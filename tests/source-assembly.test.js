import test from 'node:test';
import assert from 'node:assert/strict';
import { packedMemoryMessages, memoryMessages, selectMemory, selectPackedMemory, DEFAULTS, RETRIEVAL_POLICY } from '../src/memory.js';

const doc = (chunk, start, text, fields = {}) => ({
    id: `part-${chunk}`, owner: 'owner', scope: 'scope', revision: 'revision', message: 0,
    chunk, start, end: start + text.length, text, role: 'user', speaker: 'User', ...fields,
});
const count = text => Array.from(text).length;
const timestamp = { conversationTimestamp: '2026-01-01T00:00:00.000Z', timestampSource: 'host_message' };

test('returned chunks assemble in source order with one header and no full-message input', () => {
    const a = doc(0, 0, 'First sentence. '), b = doc(1, 16, 'Second sentence.');
    const messages = packedMemoryMessages([b, a]);
    assert.deepEqual(messages, [{ index: 0, name: 'User', is_user: true, is_system: false,
        mes: '[Past conversation excerpt: user "User", message 1, passages 1-2]\nFirst sentence. Second sentence.' }]);
    assert.deepEqual(DEFAULTS, { budget: 4096, chunkChars: 800 });
    assert.equal(RETRIEVAL_POLICY, 'current-message-native-reply-v1');
});

test('missing intervals are explicit and exact overlaps use only returned text', () => {
    assert.equal(packedMemoryMessages([doc(0, 0, 'Before'), doc(2, 40, 'After')])[0].mes,
        '[Past conversation excerpt: user "User", message 1, passages 1, 3]\nBefore\n[Omitted original text between excerpts]\nAfter');
    assert.equal(packedMemoryMessages([doc(0, 0, 'abcdef'), doc(1, 3, 'defghi'), doc(2, 4, 'efg')])[0].mes,
        '[Past conversation excerpt: user "User", message 1, passages 1-3]\nabcdefghi');
    const conflict = [doc(0, 0, 'abcdef'), doc(1, 3, 'XYZghi')];
    assert.deepEqual(packedMemoryMessages(conflict), memoryMessages(conflict));
});

test('invalid offsets and chunk ordering retain separate original excerpts', () => {
    const a = doc(0, 0, 'abcdef'), b = doc(1, 6, 'ghi');
    for (const fields of [{ start: -1 }, { end: 99 }, { start: 6.5 }, { end: undefined }, { chunk: -1 }, { chunk: 0.5 }]) {
        const passages = [a, { ...b, ...fields }];
        assert.deepEqual(packedMemoryMessages(passages), memoryMessages(passages));
    }
    const reversed = [doc(0, 6, 'Later'), doc(1, 0, 'Early ')];
    assert.deepEqual(packedMemoryMessages(reversed), memoryMessages(reversed));
});

test('assembly never crosses source identity, role or timestamp boundaries', () => {
    const a = doc(0, 0, 'Alpha', timestamp), b = doc(1, 5, 'Beta', timestamp);
    for (const fields of [{ owner: 'other' }, { scope: 'other' }, { revision: 'edited' }, { message: 1 },
        { role: 'assistant' }, { speaker: 'Character' }, { conversationTimestamp: '2026-01-02T00:00:00.000Z' },
        { timestampSource: 'other' }, { conversationTimestamp: undefined, timestampSource: undefined }]) {
        const passages = [a, { ...b, ...fields }];
        assert.deepEqual(packedMemoryMessages(passages), memoryMessages(passages));
    }
    const joined = packedMemoryMessages([a, b])[0].mes;
    assert.equal(joined.split('[Conversation timestamp:').length - 1, 1);
    assert(joined.endsWith('AlphaBeta'));
});

test('identical-text citations stay opaque at the latest occurrence across changed states', () => {
    const passages = [doc(0, 0, 'Locked.'), doc(1, 7, 'Then '),
        doc(0, 0, 'Unlocked.', { id: 'change', message: 1, revision: 'r1' }),
        doc(0, 0, 'Locked.', { id: 'repeat', message: 2, revision: 'r2' })];
    const result = packedMemoryMessages(passages);
    assert.deepEqual(result.map(m => m.index), [0, 1, 2]);
    assert(result[0].mes.endsWith('Then '));
    assert(result[1].mes.endsWith('Unlocked.'));
    assert(result[2].mes.includes('identical text at message:passage 1:1, 3:1'));
    assert(result[2].mes.endsWith('Locked.'));
});

test('UTF-16 overlap and macros remain literal after assembly', () => {
    const text = packedMemoryMessages([doc(0, 0, '🙂ab｛'), doc(1, 2, 'ab｛{char}} <USER>')])[0].mes;
    assert(text.endsWith('🙂ab｛｛char｝｝ ＜USER＞'));
    assert(!text.includes('{{'));
    const split = packedMemoryMessages([doc(0, 0, '{{char'), doc(1, 6, '}}')])[0].mes;
    assert(split.endsWith('｛｛char｝｝'));
});

test('assembly refills ranking without evicting whole-passage or repeated-packing sources', async () => {
    const a = doc(0, 0, 'Alpha '.repeat(10), timestamp), b = doc(1, 60, 'Beta '.repeat(10), timestamp);
    const extra = doc(0, 0, 'New fact.', { id: 'extra', message: 1, revision: 'r1' });
    const baseline = await selectMemory([a, b], [a, b], 2000, count);
    const before = await selectMemory([a, b, extra], [a, b, extra], baseline.tokens, count);
    const after = await selectPackedMemory([a, b, extra], [a, b, extra], baseline.tokens, count);
    assert.deepEqual(before.passages, [a, b]);
    assert.deepEqual(after.passages, [a, b, extra]);
    assert.equal(after.tokens, count(after.text));
    assert(after.tokens <= baseline.tokens);
    const repeat = { ...a, id: 'repeat', message: 2, revision: 'r2' };
    const hits = [a, repeat, b, extra];
    for (const budget of [0, 50, 200, 400, 600, 1000]) {
        const repeatedFloor = await selectPackedMemory(hits.map(d => ({ ...d, start: undefined, end: undefined })),
            hits.map(d => ({ ...d, start: undefined, end: undefined })), budget, count);
        const current = await selectPackedMemory(hits, hits, budget, count);
        assert(repeatedFloor.passages.every(d => current.passages.some(c => c.id === d.id)));
        assert(current.tokens <= budget);
    }
});

test('refill rejects stale/foreign/deleted text and takes attribution/offsets from current documents', async () => {
    const a = doc(0, 0, 'A'.repeat(50), timestamp), b = doc(1, 50, 'B'.repeat(50), timestamp);
    const extra = doc(0, 0, 'Current fact.', { id: 'extra', message: 1, revision: 'r1' });
    const expected = [a, b, extra], budget = (await selectMemory([a, b], expected, 2000, count)).tokens;
    const invalid = ['scope', 'owner', 'revision', 'text', 'conversationTimestamp', 'timestampSource'].map(k => ({ ...extra, [k]: 'forged' }));
    const denied = await selectPackedMemory([a, b, ...invalid, { ...extra, id: 'deleted' }], expected, budget, count);
    assert.deepEqual(denied.passages, [a, b]);
    const accepted = await selectPackedMemory([a, b, ...invalid, { ...extra, start: 999, end: 1000, role: 'assistant', speaker: 'Forged' }], expected, budget, count);
    assert.deepEqual(accepted.passages, expected);
    assert.deepEqual(accepted.messages.at(-1), memoryMessages([extra])[0]);
});

test('expensive assembly falls back exactly and token-count failures fail closed', async () => {
    const docs = [doc(0, 0, 'One'), doc(1, 3, 'Two')];
    const expensive = text => count(text) + (text.includes('passages 1-2]') ? 10000 : 0);
    assert.deepEqual(await selectPackedMemory(docs, docs, 1000, expensive), await selectMemory(docs, docs, 1000, expensive));
    for (const invalid of [NaN, Infinity, -1]) {
        await assert.rejects(selectPackedMemory(docs, docs, 1000,
            text => text.includes('passages 1-2]') ? invalid : count(text)), /Token counting unavailable/);
    }
});

test('a rejected adjacent chunk fits through assembly even when the source floor is unchanged', async () => {
    const a = doc(0, 0, 'A'.repeat(100)), b = doc(1, 100, 'B'.repeat(100));
    const expectedText = '[Past conversation excerpt: user "User", message 1, passages 1-2]\n'
        + 'A'.repeat(100) + 'B'.repeat(100);
    const budget = count(expectedText);
    const baseline = await selectMemory([a, b], [a, b], budget, count);
    assert.deepEqual(baseline.passages, [a]);
    for (const hits of [[a, b], [b, a]]) {
        const result = await selectPackedMemory(hits, [a, b], budget, count);
        assert.equal(result.text, expectedText);
        assert.equal(result.tokens, budget);
        assert.equal(result.messages.length, 1);
        assert.deepEqual(new Set(result.passages), new Set([a, b]));
    }
    const expected = [a, b];
    const invalid = ['scope', 'owner', 'revision', 'text', 'conversationTimestamp', 'timestampSource']
        .map(key => ({ ...b, [key]: 'forged' }));
    assert.deepEqual(await selectPackedMemory([a, ...invalid, { ...b, id: 'deleted' }], expected, budget, count), baseline);
    assert.equal((await selectPackedMemory([a, ...invalid, b], expected, budget, count)).text, expectedText);
});

test('candidate assembly preserves the exact floor when boundaries or budget prevent joining', async () => {
    const a = doc(0, 0, 'A'.repeat(100)), b = doc(1, 100, 'B'.repeat(100));
    const budget = count('[Past conversation excerpt: user "User", message 1, passages 1-2]\n') + 200;
    for (const fields of [{ revision: 'other' }, { message: 1 }, { role: 'assistant' },
        { speaker: 'Other' }, { ...timestamp }, { start: 50, end: 150 }, { end: 999 }]) {
        const docs = [a, { ...b, ...fields }];
        assert.deepEqual(await selectPackedMemory(docs, docs, budget, count), await selectMemory(docs, docs, budget, count));
    }
    assert.deepEqual(await selectPackedMemory([a, b], [a, b], budget - 1, count),
        await selectMemory([a, b], [a, b], budget - 1, count));
    for (const invalid of [NaN, Infinity, -1]) {
        await assert.rejects(selectPackedMemory([a, b], [a, b], budget,
            text => text.includes('passages 1-2]') ? invalid : count(text)), /Token counting unavailable/);
    }
});
