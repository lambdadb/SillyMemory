import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkSpans } from '../src/chunking.js';
import { documents, selectMemory } from '../src/memory.js';

test('chunks round-trip exact Unicode/whitespace with bounded contiguous source offsets', () => {
    for (const text of ['', 'A short message.\n', 'Dr. Mira paid $3.14. Then she left. '.repeat(60), 'A paragraph.\r\n\r\n'.repeat(100), '🙂e\u0301한글'.repeat(500), 'x'.repeat(2401), ' '.repeat(1601)]) {
        for (const limit of [1, 2, 17, 200, 800]) {
            const spans = chunkSpans(text, limit); assert.equal(spans.map(s => s.text).join(''), text);
            let offset = 0;
            for (const span of spans) { assert.equal(span.start, offset); assert.equal(text.slice(span.start, span.end), span.text); assert(Array.from(span.text).length <= limit); assert(span.end > span.start); assert(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(span.text)); offset = span.end; }
            assert.equal(offset, text.length);
        }
    }
    assert.throws(() => chunkSpans('text', 0), RangeError);
});
test('paragraph and sentence boundaries preserve a fact crossing the former hard cut', () => {
    const fact = 'The emergency door code is BLUE-739, but only after sunset.';
    const text = 'Ordinary detail. '.repeat(46) + fact + ' More ordinary detail.'.repeat(25);
    assert(text.indexOf(fact) < 800 && text.indexOf(fact) + fact.length > 800);
    assert(chunkSpans(text).some(s => s.text.includes(fact)));
    const paragraph = 'a'.repeat(600) + '\n\n';
    assert.equal(chunkSpans(paragraph + 'Some detail. '.repeat(80))[0].text, paragraph);
    assert.equal(chunkSpans('short.')[0].text, 'short.');
});
test('fallback splits long sentences at whitespace and bounds unbroken tokens', () => {
    const text = 'a '.repeat(1000); assert(chunkSpans(text, 201).slice(0, -1).every(s => s.text.endsWith(' ')));
    assert.deepEqual(chunkSpans('x'.repeat(1601)).map(s => s.text.length), [800, 800, 1]);
});
test('layout changes cannot reuse old IDs or inject old source coordinates', async () => {
    const message = { text: 'An ordinary sentence. '.repeat(90), index: 0, name: 'Mira', user: false, swipe: 0, eligible: true };
    const snap = { character: 'mira.png', chat: 'chat', memory: { story: 'chat' }, messages: [message, { ...message, index: 1 }, { ...message, index: 2 }] };
    const a = await documents(snap, 'a'.repeat(32), { recent: 2, chunkChars: 800 });
    const b = await documents(snap, 'a'.repeat(32), { recent: 2, chunkChars: 400 });
    assert(a.docs.every(d => d.text === message.text.slice(d.start, d.end)));
    for (const x of a.docs) for (const y of b.docs) if (x.text !== y.text || x.start !== y.start || x.end !== y.end) assert.notEqual(x.id, y.id);
    const old = { ...a.docs[0], id: `${a.scope}_${a.docs[0].revision}_0` };
    assert.equal((await selectMemory([old], a.docs, 800, text => text.length / 4)).text, '');
});

test('resizing deletes superseded chunk IDs before writes, survives reload and skips duplicate writes', async () => {
    const { MemoryEngine, Journal } = await import('../src/memory.js');
    const owner = 'a'.repeat(32), data = new Map(), remote = new Map(), events = [];
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
    const journal = new Journal(storage, 'chunk-resizing');
    const snap = { character: 'Mira.png', chat: 'one', memory: { story: 'one' }, messages: Array.from({ length: 3 }, (_, index) => ({ text: 'An ordinary sentence. '.repeat(100), index, name: 'Mira', user: false, swipe: 0, eligible: true })) };
    const config = { recent: 2, chunkChars: 800, budget: 800 };
    const current = await documents(snap, owner, config);
    const previous = await documents(snap, owner, { ...config, chunkChars: 400 });
    for (const d of previous.docs) remote.set(d.id, d); journal.write(current.scope, previous.docs.map(d => d.id));
    const client = { listDocs: async () => [...remote.values()], fetchDocs: async (_, ids) => ids.map(id => remote.get(id)).filter(Boolean), assertOwned: async () => {}, deleteIds: async (_, ids) => { events.push('delete'); ids.forEach(id => remote.delete(id)); }, upsert: async (_, docs) => { events.push('upsert'); docs.forEach(d => remote.set(d.id, d)); } };
    const engine = new MemoryEngine({ client, owner, collection: 'test', branch: 'chat_test', journal });
    await engine.sync(snap, config); assert.equal(events[0], 'delete'); assert.deepEqual([...remote.keys()].sort(), current.docs.map(d => d.id).sort());
    const writes = events.length; await engine.sync(snap, config); assert.equal(events.length, writes);
    const next = { ...config, chunkChars: 400 }; const wanted = await documents(snap, owner, next);
    const reloaded = new MemoryEngine({ client, owner, collection: 'test', branch: 'chat_test', journal: new Journal(storage, 'chunk-resizing') });
    await reloaded.sync(snap, next); assert.deepEqual([...remote.keys()].sort(), wanted.docs.map(d => d.id).sort());
});
