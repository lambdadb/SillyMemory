import test from 'node:test';
import assert from 'node:assert/strict';
import { retrievalDiagnostics, validateObservation } from '../scripts/benchmark-observation.mjs';
const doc = (id, message) => ({ id, message, chunk: 0, scope: 'scope', owner: 'owner', revision: 'r', text: `text-${id}` });
test('diagnostics separate invalid hits, duplicates, unselected sources and final delivery', () => {
    const a = doc('a', 1), b = doc('b', 2), c = doc('c', 3);
    const trace = { budget: 800, prepared: { docs: [a, b, c] }, queries: [{ query: 'q1', hits: [{ ...a, message: 999 }, { ...b, revision: 'stale' }] }, { query: 'q2', hits: [a, b, c] }],
        result: { passages: [a, b], tokens: 700, messages: [{ mes: 'packed excerpts', is_user: true }] } };
    const request = { messages: [{ role: 'user', content: 'packed excerpts' }] };
    const result = retrievalDiagnostics(trace, request);
    assert.deepEqual(result.queries[0].valid, [{ message: 1, chunk: 0 }]);
    assert.equal(result.uniqueValidCandidates, 3); assert.equal(result.queries[0].invalid, 1);
    assert.deepEqual(result.unselectedValidCandidates, [{ message: 3, chunk: 0 }]);
    assert.equal(result.preparedMessages, 1); assert.equal(result.deliveredMessages, 1);
    assert.equal(retrievalDiagnostics(trace, { messages: [{ role: 'assistant', content: 'packed excerpts' }] }).deliveredMessages, 0);
    assert.throws(() => retrievalDiagnostics({ ...trace, result: { ...trace.result, tokens: 801 } }, request), /limit/);
    assert.throws(() => retrievalDiagnostics({ ...trace, result: { ...trace.result, passages: [{ ...a, text: 'stale' }] } }, request), /valid candidate/);
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
