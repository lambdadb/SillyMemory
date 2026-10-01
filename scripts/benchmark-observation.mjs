// Read-only validation of a persisted host observation. No provider calls.
import assert from 'node:assert/strict';
import { sha } from './benchmark-audit.mjs';
import { sourceView, promptCoverage } from './benchmark-host-input.mjs';

export function retrievalDiagnostics(trace, request) {
    assert(trace?.prepared && trace.result && Array.isArray(trace.queries), 'Missing retrieval observation');
    const expected = new Map(trace.prepared.docs.map(d => [d.id, d]));
    const valid = hit => {
        const doc = expected.get(hit?.id);
        return doc && ['scope', 'owner', 'revision', 'text'].every(key => hit[key] === doc[key]);
    };
    const coordinate = d => ({ message: d.message, chunk: d.chunk });
    const candidates = trace.queries.flatMap(q => q.hits);
    const eligible = new Set(candidates.filter(valid).map(d => d.id));
    const selected = new Set(trace.result.passages.map(d => d.id));
    assert.equal(selected.size, trace.result.passages.length, 'Duplicate selected passage');
    for (const d of trace.result.passages) assert(valid(d) && eligible.has(d.id), 'Selected source was not a valid candidate');
    const messages = trace.result.messages || [];
    const delivered = messages.filter(m => request.messages.some(p => p.role === (m.is_user ? 'user' : 'assistant') && p.content.includes(m.mes)));
    assert(Number.isFinite(trace.result.tokens) && trace.result.tokens >= 0 && trace.result.tokens <= trace.budget, 'Memory token limit');
    return { queries: trace.queries.map(q => ({ querySha256: sha(q.query), returned: q.hits.length,
        valid: q.hits.filter(valid).map(d => coordinate(expected.get(d.id))), invalid: q.hits.filter(d => !valid(d)).length })),
    uniqueValidCandidates: eligible.size, selected: trace.result.passages.map(coordinate),
    unselectedValidCandidates: [...eligible].filter(id => !selected.has(id)).map(id => coordinate(expected.get(id))),
    preparedMessages: messages.length, deliveredMessages: delivered.length, memoryTokens: trace.result.tokens, memoryBudget: trace.budget,
    interpretation: 'Valid but unselected includes whole-passage budget/packing policy; not a measured ANN miss or semantic recall score.' };
}
export function validateObservation(item, context, mode, saved, maxOutputTokens, { requirePreparedMemory = true } = {}) {
    const { observation, request } = saved;
    assert.equal(saved.successfulCompletions, 1, 'One completion per answer');
    assert.equal(observation.snapshotCount, 1, 'One non-dry-run prompt snapshot');
    assert.equal(sha(JSON.stringify(observation.promptReady)), sha(JSON.stringify(request.messages)), 'Prompt-ready snapshot matches transport');
    assert.equal(sha(JSON.stringify(observation.chat.slice(0, item.chat.length))), sha(JSON.stringify(sourceView(item.chat))), 'Source preserved through generation');
    assert.equal(observation.chat.length, item.chat.length + 2);
    assert(request.messages.some(m => m.role === 'user' && m.content.includes(item.question)), 'Dated question delivered');
    const coverage = promptCoverage(item.chat, request.messages);
    assert.equal(request.max_tokens, maxOutputTokens);
    assert.equal(observation.hostPromptBudget, context - maxOutputTokens);
    assert(observation.hostPromptTokens > 0 && observation.hostPromptTokens <= observation.hostPromptBudget);
    if (mode === 'off' && context === 131072) assert.equal(coverage.exactNativeRoleMessages, coverage.nonemptyMessages);
    if (mode === 'off' && context === 32768) assert(coverage.exactNativeRoleMessages < coverage.nonemptyMessages);
    if (mode === 'vectors' && observation.native) assert(request.messages.some(m => m.content.includes(observation.native.trim())));
    if (mode === 'summary') assert(observation.summary && request.messages.some(m => m.content.includes(observation.summary)));
    let retrieval = null;
    if (mode === 'sillymemory') {
        assert.match(observation.delivery, /^Final host prompt:/);
        retrieval = retrievalDiagnostics(observation.retrieval, request);
        if (requirePreparedMemory) assert(retrieval.preparedMessages > 0, 'No prepared memory in fixture');
        assert.equal(retrieval.deliveredMessages, retrieval.preparedMessages, 'Prepared memory missing from final prompt');
    }
    return { ...coverage, retrieval };
}
