// Experimental selectors only; not imported by the shipped extension.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chunks, literal, memoryMessages } from '../src/memory.js';
export const CANDIDATE_MODES = ['current', 'raw', 'adjacent'];
export function candidateSchedule(cases, repetitions) {
    return Array.from({ length: repetitions }, (_, r) => cases.flatMap((item, i) =>
        CANDIDATE_MODES.map((_, j) => {
            const mode = CANDIDATE_MODES[(i + r + j) % 3];
            return { id: `${item.id}/r${r + 1}/${mode}`, case: item.id, repetition: r + 1, mode };
        }))).flat();
}
const identity = "Write SillyMemory E2E Mira's next reply in a fictional chat between SillyMemory E2E Mira and User.";
export const candidateMessages = passages => [...passages].sort((a, b) => a.message - b.message || a.chunk - b.chunk).map(d => ({ index: d.message, name: literal(d.speaker), is_user: d.role === 'user', is_system: false, mes: literal(d.text) }));
const textOf = messages => messages.map(m => m.mes).join('\n');
const validCount = tokens => { assert(Number.isFinite(tokens) && tokens >= 0, 'Token counting unavailable'); return tokens; };

// Yield exact tokenization requests; replay uses the same state machine offline.
export function* candidateSelection(hits, expected, budget, mode) {
    assert(CANDIDATE_MODES.includes(mode));
    const local = new Map(expected.map(d => [d.id, d])), seen = new Set(), base = [];
    for (const hit of hits) {
        const d = local.get(hit?.id);
        if (!d || seen.has(d.id) || ['scope', 'owner', 'revision', 'text'].some(k => hit[k] !== d[k])) continue;
        seen.add(d.id);
        if (validCount(yield textOf(memoryMessages([...base, d]))) <= budget) base.push(d);
    }
    const passages = [...base];
    if (mode === 'adjacent') {
        const retained = new Set(base.map(d => d.id)), considered = new Set();
        // Follow a user utterance with its assistant reply; precede an assistant
        // utterance with its user turn. Never cross a scope, role run or recent edge.
        for (const anchor of base) {
            const index = anchor.message + (anchor.role === 'user' ? 1 : -1);
            const key = JSON.stringify([anchor.owner, anchor.scope, index]);
            if (considered.has(key)) continue; considered.add(key);
            const neighbor = expected.filter(d => d.owner === anchor.owner && d.scope === anchor.scope && d.message === index && d.role !== anchor.role).sort((a, b) => a.chunk - b.chunk);
            const additions = neighbor.filter(d => !retained.has(d.id));
            if (!additions.length) continue;
            if (validCount(yield textOf(candidateMessages([...passages, ...additions]))) <= budget) {
                passages.push(...additions); additions.forEach(d => retained.add(d.id));
            }
        }
    }
    const messages = mode === 'current' ? memoryMessages(passages) : candidateMessages(passages), text = textOf(messages);
    const tokens = validCount(yield text);
    assert(tokens <= budget, 'Candidate exceeds budget');
    return { passages, messages, text, tokens, baseIds: base.map(d => d.id), addedIds: passages.filter(d => !base.includes(d)).map(d => d.id) };
}
export async function runCandidate(hits, expected, budget, mode, countTokens) {
    const run = candidateSelection(hits, expected, budget, mode), trace = [];
    let step = run.next();
    while (!step.done) { const tokens = await countTokens(step.value); trace.push({ text: step.value, tokens }); step = run.next(tokens); }
    return { ...step.value, trace };
}
export function replayCandidate(hits, expected, budget, mode, trace) {
    const run = candidateSelection(hits, expected, budget, mode); let step = run.next();
    for (const entry of trace) { assert(!step.done); assert.equal(entry.text, step.value, 'Candidate token trace changed'); step = run.next(entry.tokens); }
    assert(step.done, 'Incomplete candidate trace'); return step.value;
}

export function candidateInputs(item, fixture) {
    const cutoff = item.input.source.length + 1 - fixture.settings.recent;
    const expected = item.input.source.slice(0, cutoff).flatMap((m, message) => {
        if (!m.mes.trim() || m.is_system || m.extra?.file || m.extra?.media?.length || m.extra?.tool_invocations?.length) return [];
        const revision = createHash('sha256').update(JSON.stringify(m)).digest('hex');
        return chunks(m.mes, 800).map((text, chunk) => ({ id: `${item.id}/${message}/${revision}/${chunk}`, scope: item.id, owner: 'synthetic-candidate-owner', revision, message, chunk, text, speaker: m.name, role: m.is_user ? 'user' : 'assistant' }));
    });
    const hits = fixture.candidate.seeds[item.id].flatMap(index => expected.filter(d => d.message === index));
    assert(hits.length && new Set(hits.map(d => d.id)).size === hits.length, 'Invalid frozen candidate seeds');
    return { hits, expected };
}
export function candidateHistory(item, fixture, selected) {
    const cutoff = item.input.source.length + 1 - fixture.settings.recent;
    const old = item.input.source.slice(0, cutoff).flatMap((_, i) => selected.messages.filter(m => m.index === i));
    return [...old, ...structuredClone(item.input.source.slice(cutoff)), { mes: item.input.question, name: 'User', is_user: true, is_system: false }];
}
export function candidateEvidence(item, fixture, mode, selected, outgoing) {
    const { hits, expected } = candidateInputs(item, fixture);
    const replay = replayCandidate(hits, expected, fixture.settings.budget, mode, selected.trace);
    const { trace: _trace, ...actual } = selected; assert.deepEqual(actual, replay, 'Candidate selection changed');
    const history = candidateHistory(item, fixture, replay);
    assert.deepEqual(outgoing.filter(m => m.role !== 'system').map(({ role, content }) => ({ role, content })), history.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })), 'Candidate outgoing source, roles, order or labels changed');
    assert.deepEqual(outgoing.filter(m => m.role === 'system').map(m => m.content), [identity, fixture.generation.instruction, '[Start a new Chat]']);
    const refs = refs => refs.map(ref => ({ message: ref.message, inMemory: replay.passages.some(p => p.message === ref.message && p.text.includes(ref.quote)), inPrompt: outgoing.some(m => m.content.includes(literal(ref.quote))), ranks: [] }));
    return { selectedIds: replay.passages.map(d => d.id), addedIds: replay.addedIds, tokens: replay.tokens, sourceMessagesPresent: item.input.source.filter(m => outgoing.some(p => p.content.includes(literal(m.mes)))).length, requiredEvidence: refs(item.rubric.requiredEvidence), supersededEvidence: refs(item.rubric.supersededEvidence) };
}
