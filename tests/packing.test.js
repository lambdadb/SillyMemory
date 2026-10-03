import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMemory, selectPackedMemory, packedMemoryMessages } from '../src/memory.js';

const doc = (message, text, overrides = {}) => ({ id: `id-${message}`, owner: 'owner', scope: 'scope', revision: `r-${message}`, role: 'user', speaker: 'User', message, chunk: 0, text, ...overrides });
const repeated = 'The door is locked. {{keep_literal}}\n'.repeat(8);
const docs = [doc(0, repeated), doc(2, repeated), doc(1, 'Mira signed the letter.')];
const count = text => Array.from(text).length;

test('packing adds distinct evidence without evicting any selected source or exceeding the budget', async () => {
    const baseline = await selectMemory(docs.slice(0, 2), docs, 2000, count);
    const before = await selectMemory(docs, docs, baseline.tokens, count);
    const after = await selectPackedMemory(docs, docs, baseline.tokens, count);
    assert.deepEqual(before.passages, docs.slice(0, 2));
    assert.deepEqual(after.passages, docs);
    assert(after.tokens < baseline.tokens);
    assert.equal(after.tokens, count(after.text));
    assert.equal(after.messages.length, 2);
    assert.deepEqual(after.messages.map(m => m.index), [1, 2]);
    assert.match(after.messages[1].mes, /identical text at message:passage 1:1, 3:1]/);
    assert(after.messages[1].mes.endsWith(repeated.replaceAll('{', '｛').replaceAll('}', '｝')));
    assert.equal(after.messages[1].name, 'User');
    assert.equal(after.messages[1].is_user, true);
    // Retention holds across budgets, including those too small for a repeat.
    for (const budget of [0, 100, 400, 700, 1000, 2000]) {
        const old = await selectMemory(docs, docs, budget, count);
        const current = await selectPackedMemory(docs, docs, budget, count);
        assert(current.tokens <= budget);
        assert(old.passages.every(source => current.passages.includes(source)));
    }
});

test('repeat identity includes role, speaker, scope, owner and exact text', () => {
    for (const changed of [{ role: 'assistant' }, { speaker: 'Mira' }, { scope: 'other-chat' }, { owner: 'other-install' }, { text: repeated + ' ' }]) {
        assert.equal(packedMemoryMessages([docs[0], { ...docs[1], ...changed }]).length, 2);
    }
});

test('a repeated state keeps every coordinate at its latest occurrence after intervening changes', () => {
    const messages = packedMemoryMessages([doc(0, 'Locked.'), doc(1, 'Unlocked.'), doc(2, 'Locked.')]);
    assert.deepEqual(messages.map(m => m.index), [1, 2]);
    assert.match(messages[1].mes, /1:1, 3:1]/);
    assert(messages[1].mes.endsWith('\nLocked.'));
    const chunks = packedMemoryMessages([doc(1, 'Eleventh chunk', { chunk: 10 }), doc(1, 'Third chunk', { chunk: 2 })]);
    assert(chunks[0].mes.endsWith('Third chunk'));
});

test('no-repeat selections stay identical and expensive grouped labels fall back', async () => {
    const distinct = [doc(0, 'First'), doc(1, 'Second')];
    assert.deepEqual(await selectPackedMemory(distinct, distinct, 1000, count), await selectMemory(distinct, distinct, 1000, count));
    const expensiveLabels = text => count(text) + (text.includes('identical text at') ? 10000 : 0);
    assert.deepEqual(await selectPackedMemory(docs, docs, 2000, expensiveLabels), await selectMemory(docs, docs, 2000, expensiveLabels));
});

test('newly affordable hits still require local identity and cannot be suppressed by invalid copies', async () => {
    const budget = (await selectMemory(docs.slice(0, 2), docs, 2000, count)).tokens;
    const invalid = ['owner', 'scope', 'revision', 'text'].map(key => ({ ...docs[2], [key]: 'forged' }));
    const hits = [...docs.slice(0, 2), ...invalid, { ...docs[2], id: 'deleted' }];
    const denied = await selectPackedMemory(hits, docs, budget, count);
    assert.deepEqual(denied.passages, docs.slice(0, 2));
    const accepted = await selectPackedMemory([...hits, { ...docs[2], speaker: 'forged', role: 'assistant' }, docs[2]], docs, budget, count);
    assert.deepEqual(accepted.passages, docs);
    assert(!accepted.text.includes('forged'));
    assert.equal(accepted.messages[0].is_user, true);
});

test('failure to count packed labels fails closed', async () => {
    for (const invalid of [NaN, Infinity, -1]) {
        await assert.rejects(selectPackedMemory(docs, docs, 2000, text => text.includes('identical text at') ? invalid : count(text)), /Token counting unavailable/);
    }
});
