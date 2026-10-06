import test from 'node:test';
import assert from 'node:assert/strict';
import { hostTimestamp, annotateHostTime } from '../src/time.js';
import { capture, fingerprint, documents, selectPackedMemory } from '../src/memory.js';

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

test('timestamp-only change invalidates a snapshot without changing remote documents or embeddings', async () => {
    const source = chat(), first = capture(context(source));
    const original = await documents(first, 'owner', config);
    source[0].send_date = '2024-03-01T00:00:00Z';
    const second = capture(context(source));
    assert.notEqual(fingerprint(first), fingerprint(second));
    assert.deepEqual(await documents(second, 'owner', config), original);
    assert.equal(second.messages[0].recordedAt, '2024-03-01T00:00:00.000Z');
    assert(!('recordedAt' in first.messages[1]));
    assert(!('recordedAt' in original.docs[0]));
    assert.equal(source[0].mes, 'The treaty was signed in Frostmonth, year 812.');
    assert.deepEqual(capture(context(JSON.parse(JSON.stringify(source)))), second);
});

test('provenance uses current source only, preserves roles/bodies and cannot evict selected passages', async () => {
    const snapshot = capture(context(chat())), { docs } = await documents(snapshot, 'owner', config);
    const hits = docs.map(doc => ({ ...doc, recordedAt: '2099-01-01T00:00:00.000Z' }));
    const baseline = await selectPackedMemory(hits, docs, 2000, count);
    const saved = structuredClone(baseline), source = structuredClone(snapshot);
    const result = await annotateHostTime(baseline, snapshot, 2000, count);
    assert.deepEqual(result.passages, baseline.passages);
    assert.deepEqual(result.messages.map(m => [m.index, m.is_user, m.name]), baseline.messages.map(m => [m.index, m.is_user, m.name]));
    assert(result.messages[0].mes.startsWith('[Past conversation excerpt: user "User", message 1, passage 1]\n'));
    assert(result.messages[0].mes.endsWith('\nThe treaty was signed in Frostmonth, year 812.'));
    assert.equal(result.messages[1].mes, baseline.messages[1].mes);
    assert(result.text.includes('\n[Host message timestamps (UTC; not story/event dates): 1=2024-02-29T12:34:56.123Z]\n'));
    assert(!result.text.includes('2099')); assert(!result.text.includes('2='));
    assert.equal(result.tokens, count(result.text));
    assert.deepEqual(baseline, saved); assert.deepEqual(snapshot, source);
    for (const budget of [baseline.tokens, baseline.tokens + 5, result.tokens - 1]) {
        assert.deepEqual(await annotateHostTime(baseline, snapshot, budget, count), baseline);
    }
    assert.deepEqual(await annotateHostTime(baseline, { messages: [] }, 2000, count), baseline);
    for (const invalid of [NaN, Infinity, -1]) await assert.rejects(annotateHostTime(baseline, snapshot, 2000, () => invalid), /Token counting unavailable/);
});

test('packed repeated occurrences keep distinct timestamp coordinates without duplicating body or adding unselected sources', async () => {
    const snapshot = { messages: [0, 2, 3].map(index => ({ index, recordedAt: `2024-03-0${index + 1}T00:00:00.000Z` })) };
    const docs = [0, 2].map(message => ({ id: `id-${message}`, owner: 'owner', scope: 'scope', revision: `r-${message}`,
        role: 'user', speaker: 'User', message, chunk: 0, text: 'The door is locked. '.repeat(40) }));
    const baseline = await selectPackedMemory(docs, docs, 2000, count);
    assert.equal(baseline.messages.length, 1);
    const result = await annotateHostTime(baseline, snapshot, 2000, count);
    assert(result.text.includes('1=2024-03-01T00:00:00.000Z; 3=2024-03-03T00:00:00.000Z'));
    assert(!result.text.includes('4='));
    assert(result.messages[0].mes.startsWith(baseline.messages[0].mes.split('\n')[0] + '\n'));
    assert(result.messages[0].mes.endsWith('\n' + docs[0].text));
    assert.deepEqual(result.passages, docs);
    const firstOnly = await annotateHostTime(baseline, snapshot, baseline.tokens + 110, count);
    assert(firstOnly.text.includes('1=')); assert(!firstOnly.text.includes('3='));
    assert.deepEqual(firstOnly.passages, docs);
});
