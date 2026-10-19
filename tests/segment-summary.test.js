import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentHistory, summaryRequest, selectMemories, selectionRequest, replaceMemory } from '../scripts/segment-summary.mjs';
test('segment boundaries preserve each source message exactly once and keep recent dialogue outside summaries', () => {
    const messages = Array.from({ length: 87 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `source ${i}`, date: '2026/01/01' }));
    const { segments, recent } = segmentHistory(messages);
    assert.deepEqual(segments.map(s => [s.start, s.end]), [[0, 39], [39, 79], [79, 83]]);
    assert.deepEqual([...segments.flatMap(s => s.messages), ...recent], messages);
    assert.equal(recent[0].content, 'source 83');
    const request = summaryRequest({ ...segments[0], answer: 'secret', has_answer: true });
    assert(!JSON.stringify(request).includes('secret'));
});
test('selector sees all old memories but cannot invent IDs, duplicate selections or choose newest IDs', () => {
    const memories = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, text: `fact ${i}` }));
    const payload = JSON.parse(selectionRequest(memories, [], 'question')[1].content);
    assert.equal(payload.older.length, 5);
    assert.deepEqual(selectMemories(memories, '["m0","m3"]').map(m => m.id), ['m0', 'm3', 'm5', 'm6', 'm7']);
    for (const bad of ['["m0","m0"]', '["m0","m7"]', '["m0","invented"]', '{}']) assert.throws(() => selectMemories(memories, bad));
    assert.deepEqual(selectMemories(memories.slice(0, 4)), memories.slice(0, 4));
});
test('replacement preserves native shell and recent context and fails instead of truncating over-budget memory', () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `message ${i}` }));
    const result = replaceMemory({ model: 'model', messages }, [{ id: 'a', text: 'fact' }], s => s.length);
    assert.deepEqual(result.body.messages.slice(0, 3), messages.slice(0, 3));
    assert.deepEqual(result.body.messages.slice(-6), messages.slice(-6));
    assert(!result.body.messages.some(m => m.content === 'message 3'));
    assert.throws(() => replaceMemory({ messages }, [], () => 4096), /exceed/);
});
