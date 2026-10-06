import test from 'node:test';
import assert from 'node:assert/strict';
import { hostTimestamp } from '../src/time.js';
import { capture, fingerprint, documents, selectPackedMemory, memoryMessages, packedMemoryMessages } from '../src/memory.js';

const stamp = '2024-02-29T12:34:56.123Z';
const context = chat => ({ characterId: 0, characters: [{ avatar: 'test.png' }], chat,
    chatMetadata: { sillymemory: { id: 'chat', story: 'story' } }, getCurrentChatId: () => 'chat' });
const chat = () => [
    { mes: 'The treaty was signed in Frostmonth, year 812.', name: 'User', is_user: true, send_date: stamp },
    { mes: 'The chest was opened on an unknown story date.', name: 'Mira', is_user: false, send_date: 'unknown' },
    { mes: 'Recent.', is_user: true }, { mes: 'Question.', is_user: false },
];
const config = { recent: 2, chunkChars: 800, budget: 2000 };
const count = text => Array.from(text).length;

test('host timestamp accepts pinned ISO/epoch values without calendar, timezone or clock guesses', () => {
    assert.equal(hostTimestamp(stamp), stamp);
    assert.equal(hostTimestamp(1709210096123), stamp);
    assert.equal(hostTimestamp('2024-02-29T12:34:56Z'), '2024-02-29T12:34:56.000Z');
    assert.equal(hostTimestamp('2024-02-29T12:34:56.1Z'), '2024-02-29T12:34:56.100Z');
    for (const value of [null, undefined, '', 0, -1, NaN, Infinity, 8640000000000001, {},
        '2023-02-29T12:00:00Z', '2024-04-31T00:00:00Z', '2024-02-29T24:00:00Z',
        '2024-02-29', '2024-02-29T12:00:00', '1709210096123', '{{setvar::date::today}}']) {
        assert.equal(hostTimestamp(value), null);
    }
});

test('every chunk inherits source time separately from text and timestamp edits change revisions', async () => {
    const source = chat(); source[0].mes = 'The treaty was signed in Frostmonth, year 812. '.repeat(20);
    const first = capture(context(source)), original = await documents(first, 'owner', { ...config, chunkChars: 200 });
    const dated = original.docs.filter(d => d.message === 0);
    assert(dated.length > 1);
    assert(dated.every(d => d.conversationTimestamp === stamp && d.timestampSource === 'host_message'));
    assert.equal(dated.map(d => d.text).join(''), source[0].mes);
    assert(!('conversationTimestamp' in original.docs.find(d => d.message === 1)));
    source[0].send_date = '2024-03-01T00:00:00Z';
    const second = capture(context(source)), changed = await documents(second, 'owner', { ...config, chunkChars: 200 });
    assert.notEqual(fingerprint(first), fingerprint(second));
    assert(changed.docs.filter(d => d.message === 0).every(d => !dated.some(old => old.id === d.id)));
    assert.deepEqual(capture(context(JSON.parse(JSON.stringify(source)))), second);
});

test('selection budgets full dated excerpts and rejects forged, missing and stale remote times', async () => {
    const { docs } = await documents(capture(context(chat())), 'owner', config);
    const dated = docs[0], plain = memoryMessages([{ ...dated, conversationTimestamp: undefined }])[0].mes;
    const full = memoryMessages([dated])[0].mes;
    assert(full.startsWith('[Past conversation excerpt: user "User", message 1, passage 1]\n'));
    assert(full.includes('source=host_message; UTC, not story/event date; original local timezone unknown'));
    assert(full.endsWith('The treaty was signed in Frostmonth, year 812.'));
    assert.equal((await selectPackedMemory([dated], docs, count(full), count)).text, full);
    assert.equal((await selectPackedMemory([dated], docs, count(full) - 1, count)).text, '');
    assert.equal((await selectPackedMemory([dated], docs, count(plain), count)).text, '');
    for (const bad of [{ ...dated, conversationTimestamp: undefined }, { ...dated, timestampSource: 'session' },
        { ...dated, conversationTimestamp: '2099-01-01T00:00:00.000Z' }]) {
        assert.equal((await selectPackedMemory([bad], docs, 2000, count)).text, '');
        assert.equal((await selectPackedMemory([bad, dated], docs, 2000, count)).text, full);
    }
    for (const invalid of [NaN, Infinity, -1]) await assert.rejects(selectPackedMemory([dated], docs, 2000, () => invalid), /Token counting unavailable/);
});

test('identical bodies with distinct known or unknown times are not collapsed', async () => {
    const source = chat(); source[1] = { ...source[0], send_date: '2024-03-01T00:00:00Z' };
    source[0].mes = source[1].mes = 'The door is locked. '.repeat(30);
    const { docs } = await documents(capture(context(source)), 'owner', { ...config, chunkChars: 800 });
    const result = await selectPackedMemory(docs, docs, 4000, count);
    assert.equal(result.messages.length, 2);
    assert(result.messages[0].mes.includes(stamp)); assert(result.messages[1].mes.includes('2024-03-01'));
    const unknown = { ...docs[1] }; delete unknown.conversationTimestamp; delete unknown.timestampSource;
    assert.equal(packedMemoryMessages([docs[0], unknown]).length, 2);
    const same = { ...docs[1], conversationTimestamp: stamp };
    const packed = packedMemoryMessages([docs[0], same]);
    assert.equal(packed.length, 1); assert(packed[0].mes.includes('1:1, 2:1'));
    assert.equal(packed[0].mes.split(stamp).length, 2);
});
