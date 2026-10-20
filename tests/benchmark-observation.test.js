import test from 'node:test';
import assert from 'node:assert/strict';
import { retrievalDiagnostics, validateObservation } from '../scripts/benchmark-observation.mjs';
const doc = (id, message) => ({ id, message, chunk: 0, scope: 'scope', owner: 'owner', revision: 'r', text: `text-${id}` });
test('diagnostics separate invalid hits, duplicates, unselected sources and final delivery', () => {
    const a = doc('a', 1), b = doc('b', 2), c = doc('c', 3);
    const trace = { budget: 800, prepared: { docs: [a, b, c] }, queries: [{ query: 'q1', hits: [{ ...a, message: 999 }, { ...b, revision: 'stale' }] }, { query: 'q2', hits: [a, b, c] }],
        result: { passages: [a, b], tokens: 700, messages: [{ mes: 'user excerpt', is_user: true }, { mes: 'assistant excerpt', is_user: false }] } };
    const archive = '[Recalled conversation excerpts]\nuser excerpt\nassistant excerpt';
    const request = { messages: [{ role: 'user', content: archive }] };
    const result = retrievalDiagnostics(trace, request);
    assert.deepEqual(result.queries[0].valid, [{ message: 1, chunk: 0 }]);
    assert.equal(result.uniqueValidCandidates, 3); assert.equal(result.queries[0].invalid, 1);
    assert.deepEqual(result.unselectedValidCandidates, [{ message: 3, chunk: 0 }]);
    assert.equal(result.preparedMessages, 1); assert.equal(result.deliveredMessages, 1);
    assert.equal(result.sourceExcerpts, 2);
    assert.equal(retrievalDiagnostics(trace, { messages: [{ role: 'assistant', content: archive }] }).deliveredMessages, 0);
    assert.equal(retrievalDiagnostics(trace, { messages: [{ role: 'user', content: '[Recalled conversation excerpts]\nuser excerpt' }] }).deliveredMessages, 0);
    assert.throws(() => retrievalDiagnostics({ ...trace, result: { ...trace.result, tokens: 801 } }, request), /limit/);
    assert.throws(() => retrievalDiagnostics({ ...trace, result: { ...trace.result, passages: [{ ...a, text: 'stale' }] } }, request), /valid candidate/);
});
test('diagnostics reject mismatched time provenance before attributing omissions to selection', () => {
    const dated = { ...doc('dated', 1), conversationTimestamp: '2025-01-13T00:00:00.000Z',
        timestampSource: 'host_message', conversationTimeContext: 'Host-supplied UTC clock; not an event date.' };
    const undated = doc('undated', 2);
    const provenance = ['conversationTimestamp', 'timestampSource', 'conversationTimeContext'];
    const invalid = provenance.flatMap(key => {
        const missing = { ...dated }; delete missing[key];
        return [missing, { ...dated, [key]: 'altered' }, { ...undated, [key]: dated[key] }];
    });
    const trace = { budget: 800, prepared: { docs: [dated, undated] },
        queries: [{ query: 'q', hits: invalid }], result: { passages: [], messages: [], tokens: 0 } };
    const result = retrievalDiagnostics(trace, { messages: [] });
    assert.equal(result.queries[0].invalid, 9);
    assert.deepEqual(result.queries[0].valid, []);
    assert.equal(result.uniqueValidCandidates, 0);
    assert.deepEqual(result.unselectedValidCandidates, []);
    // Even an intact local passage cannot be selected through a rejected remote hit.
    assert.throws(() => retrievalDiagnostics({ ...trace,
        result: { ...trace.result, passages: [dated] } }, { messages: [] }), /valid candidate/);

    const control = { ...trace, queries: [{ query: 'q', hits: [dated, undated] }] };
    const accepted = retrievalDiagnostics(control, { messages: [] });
    assert.equal(accepted.queries[0].invalid, 0);
    assert.equal(accepted.uniqueValidCandidates, 2);
    assert.deepEqual(accepted.unselectedValidCandidates, [{ message: 1, chunk: 0 }, { message: 2, chunk: 0 }]);
    for (const passage of invalid) {
        assert.throws(() => retrievalDiagnostics({ ...control,
            result: { ...control.result, passages: [passage] } }, { messages: [] }), /valid candidate/);
    }
});
test('an empty native insertion is recorded without inventing a failed model answer', () => {
    const item = { chat: [{ mes: 'old', name: 'User', is_user: true }], question: 'question' };
    const request = { max_tokens: 1024, messages: [{ role: 'user', content: 'question' }] };
    const saved = { successfulCompletions: 1, request, observation: { snapshotCount: 1, promptReady: request.messages, chat: [...item.chat, {}, {}], native: '', hostPromptTokens: 100, hostPromptBudget: 31744 } };
    const result = validateObservation(item, 32768, 'vectors', saved, 1024);
    assert.equal(result.exactNativeRoleMessages, 0);
    assert.throws(() => validateObservation(item, 131072, 'off', saved, 1024));
    saved.observation.promptReady = [];
    assert.throws(() => validateObservation(item, 32768, 'vectors', saved, 1024), /transport/);
});
test('live zero-hit memory is a retained result while missing delivery still fails', () => {
    const item = { chat: [{ mes: 'old', name: 'User', is_user: true }], question: 'question' };
    const request = { max_tokens: 1024, messages: [{ role: 'user', content: 'question' }] };
    const retrieval = { budget: 800, prepared: { docs: [] }, queries: [{ query: 'q', hits: [] }], result: { passages: [], messages: [], tokens: 0 } };
    const saved = { successfulCompletions: 1, request, observation: { snapshotCount: 1, promptReady: request.messages,
        chat: [...item.chat, {}, {}], hostPromptTokens: 100, hostPromptBudget: 31744, delivery: 'Final host prompt: 0/0', retrieval } };
    assert.throws(() => validateObservation(item, 32768, 'sillymemory', saved, 1024), /No prepared memory/);
    const result = validateObservation(item, 32768, 'sillymemory', saved, 1024, { requirePreparedMemory: false });
    assert.equal(result.retrieval.preparedMessages, 0); assert.equal(result.retrieval.uniqueValidCandidates, 0);
    retrieval.result.messages.push({ mes: 'missing', is_user: true });
    assert.throws(() => validateObservation(item, 32768, 'sillymemory', saved, 1024, { requirePreparedMemory: false }), /missing from final prompt/);
});
