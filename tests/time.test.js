import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_GUIDANCE } from '../src/context.js';
import { hostTimestamp, SENT_GUIDANCE } from '../src/time.js';
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
    assert(dated.every(d => d.conversationTimeContext === "Message sent at 2024-02-29T12:34:56.123Z (UTC), supplied by the host; not an event date. UTC alone does not establish the speaker's local date."));
    assert.equal(dated.map(d => d.text).join(''), source[0].mes);
    assert(!('conversationTimestamp' in original.docs.find(d => d.message === 1)));
    assert(!('conversationTimeContext' in original.docs.find(d => d.message === 1)));
    source[0].send_date = '2024-03-01T00:00:00Z';
    const second = capture(context(source)), changed = await documents(second, 'owner', { ...config, chunkChars: 200 });
    assert.notEqual(fingerprint(first), fingerprint(second));
    assert(changed.docs.filter(d => d.message === 0).every(d => !dated.some(old => old.id === d.id)));
    assert(changed.docs.filter(d => d.message === 0).every(d => d.conversationTimeContext.includes('2024-03-01T00:00:00.000Z') && !d.conversationTimeContext.includes(stamp)));
    assert.deepEqual(capture(context(JSON.parse(JSON.stringify(source)))), second);
});

test('UTC sent time preserves local-day ambiguity across the date line', async () => {
    const sent = '2024-02-29T23:30:00.000Z';
    const localDate = timeZone => {
        const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(new Date(sent));
        return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
    };
    assert.equal(localDate('Pacific/Honolulu'), '2024-02-29');
    assert.equal(localDate('Pacific/Kiritimati'), '2024-03-01');
    const source = chat();
    source[0] = { ...source[0], send_date: sent, mes: 'Yesterday I visited the garden.' };
    const { docs } = await documents(capture(context(source)), 'owner', config);
    assert.equal(docs[0].conversationTimestamp, sent);
    for (const render of [memoryMessages, packedMemoryMessages]) {
        const recalled = render([docs[0]])[0].mes;
        assert(recalled.includes(`, sent: ${sent}]`));
        assert(recalled.endsWith(source[0].mes));
        assert(MEMORY_GUIDANCE.includes('only if the local conversation date is known; UTC alone is insufficient'));
        assert(MEMORY_GUIDANCE.includes('Otherwise keep date ambiguity'));
        assert(!recalled.includes(SENT_GUIDANCE));
    }
});

test('selection budgets full dated excerpts and rejects forged, missing and stale remote times', async () => {
    const { docs } = await documents(capture(context(chat())), 'owner', config);
    const dated = docs[0], plain = memoryMessages([{ ...dated, conversationTimestamp: undefined }])[0].mes;
    const full = memoryMessages([dated])[0].mes;
    assert(full.startsWith('[Past conversation excerpt: user "User", message 1, passage 1, sent: 2024-02-29T12:34:56.123Z]\n'));
    assert(!full.includes(SENT_GUIDANCE));
    assert(!full.includes('source=host_message'));
    assert(full.endsWith('The treaty was signed in Frostmonth, year 812.'));
    assert.equal((await selectPackedMemory([dated], docs, count(full), count)).text, full);
    assert.equal((await selectPackedMemory([dated], docs, count(full) - 1, count)).text, '');
    assert.equal((await selectPackedMemory([dated], docs, count(plain), count)).text, '');
    for (const bad of [{ ...dated, conversationTimestamp: undefined }, { ...dated, timestampSource: 'session' },
        { ...dated, conversationTimeContext: undefined },
        { ...dated, conversationTimeContext: 'Event occurred on 2099-01-01.' },
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
    const result = await selectPackedMemory(docs.slice(0, 2), docs, 4000, count);
    assert.equal(result.messages.length, 2);
    assert(result.messages[0].mes.includes(stamp)); assert(result.messages[1].mes.includes('2024-03-01'));
    const unknown = { ...docs[1] }; delete unknown.conversationTimestamp; delete unknown.timestampSource;
    assert.equal(packedMemoryMessages([docs[0], unknown]).length, 2);
    const same = { ...docs[1], conversationTimestamp: stamp };
    const packed = packedMemoryMessages([docs[0], same]);
    assert.equal(packed.length, 1); assert(packed[0].mes.includes('1:1, 2:1'));
    assert.equal(packed[0].mes.split(stamp).length, 2);
});

test('sent headers preserve source clocks while interpretation stays in system guidance', async () => {
    const source = chat(); source[1].send_date = '2024-03-01T00:00:00Z';
    const { docs } = await documents(capture(context(source)), 'owner', config);
    const before = structuredClone(docs);
    for (const render of [memoryMessages, packedMemoryMessages]) {
        const result = render(docs), text = result.map(m => m.mes).join('\n');
        assert.equal(text.split(SENT_GUIDANCE).length - 1, 0);
        assert.equal(MEMORY_GUIDANCE.split(SENT_GUIDANCE).length - 1, 1);
        assert.equal(text.split(', sent:').length - 1, 2);
        assert(result[0].mes.startsWith('[Past conversation excerpt: user "User", message 1, passage 1, sent: 2024-02-29T12:34:56.123Z]\n'));
        assert(result[1].mes.startsWith('[Past conversation excerpt: assistant "Mira", message 2, passage 1, sent: 2024-03-01T00:00:00.000Z]\n'));
        assert(result.every(m => m.mes.endsWith(docs.find(d => d.message === m.index).text)));
        assert(!result[2].mes.includes(', sent:'));
        assert(!render([docs[1]])[0].mes.includes(SENT_GUIDANCE));
        assert(!render([docs[2]])[0].mes.includes(SENT_GUIDANCE));
        assert.deepEqual(render([]), []);
    }
    assert.deepEqual(docs, before);
    const text = packedMemoryMessages(docs).map(m => m.mes).join('\n');
    const countWithGuidance = text => count(MEMORY_GUIDANCE + '\n' + text);
    const budget = countWithGuidance(text);
    const selected = await selectPackedMemory(docs, docs, budget, countWithGuidance);
    assert.equal(selected.tokens, budget); assert.equal(selected.text, text);
    const short = await selectPackedMemory(docs, docs, budget - 1, countWithGuidance);
    assert(short.tokens <= budget - 1); assert(short.passages.length < docs.length);
});
