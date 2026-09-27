import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, documents, selectMemory, MemoryEngine, Journal, options, chunks, literal, retrievalQueries, interleaveHits } from '../src/memory.js';
const owner = 'a'.repeat(32);
const config = { recent: 2, budget: 400, chunkChars: 200 };
const snapshot = (chat = 'chat', character = 'alice.png') => ({ chat, character, messages: Array.from({ length: 6 }, (_, index) => ({ index, text: `Synthetic message ${index}: the blue compass is under the tree.`, name: index % 2 ? 'Alice' : 'User', user: !(index % 2), swipe: 0, eligible: true })) });
class Storage {
    values = new Map(); get length() { return this.values.size; } key(i) { return [...this.values.keys()][i]; }
    getItem(k) { return this.values.get(k) ?? null; } setItem(k, v) { this.values.set(k, v); } removeItem(k) { this.values.delete(k); }
}
function setup(storage = new Storage()) {
    const remote = new Map(); const writes = []; const deletes = [];
    const client = {
        async assertOwned() {},
        async upsert(_, docs) { writes.push(docs); docs.forEach(x => remote.set(x.id, x)); },
        async deleteIds(_, ids) { deletes.push(ids); ids.forEach(x => remote.delete(x)); },
        async search(_, o, scope) { return [...remote.values()].filter(x => x.owner === o && x.scope === scope); },
        async deleteOwnedCollection() { remote.clear(); },
    };
    const engine = new MemoryEngine({ client, owner, collection: 'test', journal: new Journal(storage, 'test') });
    return { engine, client, writes, deletes, remote, storage };
}
test('stable content IDs, unique character/chat/branch scopes, and only older messages', async () => {
    const a = await documents(snapshot(), owner, config);
    assert.equal(a.docs.length, 4); assert.ok(a.docs.every(d => d.message < 4));
    assert.deepEqual(a, await documents(snapshot(), owner, config));
    for (const other of [snapshot('branch'), snapshot('chat', 'bob.png')]) assert.notEqual(a.scope, (await documents(other, owner, config)).scope);
});
test('deduplication, edits, swipe, deletion and reload reconcile uncertain writes', async () => {
    const s = setup(); const snap = snapshot();
    await s.engine.sync(snap, config); await s.engine.sync(snap, config);
    assert.equal(s.writes.length, 1);
    const first = [...s.remote.keys()][0]; snap.messages[0].text = 'Edited compass location';
    await s.engine.sync(snap, config); assert.ok(!s.remote.has(first));
    const beforeSwipe = [...s.remote.keys()]; snap.messages[1].swipe = 1;
    await s.engine.sync(snap, config); assert.ok(beforeSwipe.some(x => !s.remote.has(x)));
    snap.messages.splice(1, 1); snap.messages.forEach((m, i) => { m.index = i; });
    await s.engine.sync(snap, config); assert.equal(s.remote.size, 3);
    // Reload loses in-memory acknowledgements, but journal preserves remote IDs.
    const reloaded = new MemoryEngine({ client: s.client, owner, collection: 'test', journal: new Journal(s.storage, 'test') });
    snap.messages[0].text = 'Edited while extension was not loaded';
    await reloaded.sync(snap, config);
    assert.deepEqual([...s.remote.keys()].sort(), (await documents(snap, owner, config)).docs.map(x => x.id).sort());
});
test('intent journal survives server acceptance followed by a timeout', async () => {
    const s = setup(); const real = s.client.upsert;
    s.client.upsert = async (...args) => { await real(...args); throw new Error('timeout'); };
    await assert.rejects(s.engine.sync(snapshot(), config));
    const ids = [...s.remote.keys()]; assert.equal(ids.length, 4);
    s.client.upsert = real;
    const changed = snapshot(); changed.messages = changed.messages.slice(-2);
    await s.engine.sync(changed, config); assert.equal(s.remote.size, 0);
});
test('late results after chat switch/edit are rejected', async () => {
    const s = setup(); const resolvers = [], signals = []; let started;
    const searching = new Promise(r => { started = r; });
    s.client.search = async (_, o, scope, query, signal) => { signals.push(signal); return new Promise(r => { resolvers.push(r); if (resolvers.length === 2) started(); }); };
    const pending = s.engine.retrieve(snapshot(), config, t => t.length / 4);
    await searching; s.engine.invalidate();
    assert.ok(signals.every(signal => signal.aborted));
    resolvers.forEach(resolve => resolve([...s.remote.values()]));
    assert.equal(await pending, null);
});
test('stale, deleted, foreign, duplicate and altered search hits never inject', async () => {
    const a = await documents(snapshot(), owner, config);
    const other = await documents(snapshot('other'), owner, config);
    const hits = [other.docs[0], { ...a.docs[0], text: 'Stale or hostile text' }, { ...a.docs[1], revision: 'old' }, a.docs[2], a.docs[2]];
    const result = await selectMemory(hits, a.docs, 2000, t => t.length);
    assert.deepEqual(result.passages, [a.docs[2]]);
    assert.ok(!result.text.includes('hostile'));
    assert.equal((await selectMemory([a.docs[0]], [], 2000, t => t.length)).text, '');
});
test('token budget counts wrapper, Unicode and all labels; preserves whole passages', async () => {
    const a = await documents(snapshot(), owner, config);
    const count = t => Array.from(t).length;
    const result = await selectMemory(a.docs, a.docs, 210, count);
    assert.ok(result.tokens <= 210); assert.equal(result.tokens, count(result.text));
    assert.equal(result.passages.length, 1);
    assert.equal((await selectMemory(a.docs, a.docs, 10, count)).text, '');
    await assert.rejects(selectMemory(a.docs, a.docs, 1000, () => NaN));
    assert.deepEqual(chunks('🙂🙂한글', 2), ['🙂🙂', '한글']);
});
test('sync failure prevents retrieval; storage failure prevents any writes', async () => {
    const s = setup(); let searched = false;
    s.client.upsert = async () => { throw new Error('offline'); };
    s.client.search = async () => { searched = true; return []; };
    await assert.rejects(s.engine.retrieve(snapshot(), config, t => t.length)); assert.equal(searched, false);
    const t = setup(); t.storage.setItem = () => { throw new Error('quota'); };
    await assert.rejects(t.engine.sync(snapshot(), config)); assert.equal(t.writes.length, 0);
});
test('deletion drains pending writes and clears local journal', async () => {
    const s = setup(); let release; let started;
    const writing = new Promise(r => { started = r; });
    const write = s.client.upsert;
    s.client.upsert = async (...args) => { started(); await new Promise(r => { release = r; }); await write(...args); };
    const syncing = s.engine.sync(snapshot(), config); await writing;
    const deleting = s.engine.deleteAll(); release(); await syncing; await deleting;
    assert.equal(s.remote.size, 0); assert.equal(s.storage.length, 0);
});
test('settings are clamped and capture refuses group/no character chats', () => {
    assert.equal(options({ budget: 999999, recent: 0 }).budget, 4096);
    assert.equal(options({ recent: 0 }).recent, 2);
    assert.equal(capture({ groupId: 'group' }), null);
    assert.equal(capture({ characterId: undefined }), null);
});

test('recalled macros are literal before token counting and include host separators', async () => {
    const a = await documents(snapshot(), owner, config);
    a.docs[0].text = '{{setvar::key::value}} <USER> {story}';
    a.docs[0].speaker = '{{char}}';
    const result = await selectMemory([a.docs[0]], a.docs, 2000, t => t.length);
    assert.ok(result.text.includes('｛｛setvar::key::value｝｝ ＜USER＞ ｛story｝'));
    assert.ok(!result.text.includes('{{'));
    assert.ok(result.text.startsWith('\n') && result.text.endsWith('\n'));
    assert.equal(result.tokens, result.text.length);
    assert.equal(literal('<char> <GROUP>'), '＜char＞ ＜GROUP＞');
});


test('query anchors on the latest user; contextual retrieval stays separate from the question', () => {
    const messages = [
        { user: true, text: 'Old unrelated topic' },
        { user: false, text: 'Mira stored a travel document.' },
        { user: true, text: 'Where did she put it?' },
        { user: false, text: 'Incorrect previous answer during swipe or regenerate' },
    ];
    assert.deepEqual(retrievalQueries({ messages }), ['Where did she put it?', 'Where did she put it?\nMira stored a travel document.\nOld unrelated topic']);
    assert.deepEqual(retrievalQueries({ messages: messages.slice(0, -1) }), retrievalQueries({ messages }));
    assert.deepEqual(retrievalQueries({ messages: [{ user: true, text: '  Question  ' }] }), ['Question']);
    assert.deepEqual(retrievalQueries({ messages: [{ user: false, text: 'Opening scene' }] }), ['Opening scene']);
    assert.deepEqual(retrievalQueries({ messages: [{ user: true, text: '  ' }] }), []);
    const long = retrievalQueries({ messages: [{ text: 'context' }, { user: true, text: 'x'.repeat(7000) }] });
    assert.deepEqual(long, ['x'.repeat(6000)]);
});
test('rank interleaving keeps question and contextual top hits inside a bounded selection', async () => {
    const { docs } = await documents(snapshot(), owner, config);
    const count = text => text.length;
    const expected = await selectMemory([docs[0], docs[3]], docs, 2000, count);
    const hits = interleaveHits([[{ ...docs[3], text: 'Invalid duplicate' }, docs[0], docs[1]], [docs[3], docs[2]]]);
    const result = await selectMemory(hits, docs, expected.tokens, count);
    assert.deepEqual(new Set(result.passages.map(d => d.id)), new Set([docs[3].id, docs[0].id]));
    assert.equal(result.tokens, expected.tokens);
    assert.deepEqual(interleaveHits([[1, 2, 3], [4]]), [1, 4, 2, 3]);
});
test('a query failure cancels the sibling and rejects partial memory', async () => {
    const s = setup(); let count = 0, siblingAborted = false;
    s.client.search = async (_, o, scope, query, signal) => {
        if (++count === 1) throw new Error('query failed');
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => { siblingAborted = true; reject(signal.reason); }, { once: true }));
    };
    await assert.rejects(s.engine.retrieve(snapshot(), config, text => text.length), /query failed/);
    assert.equal(count, 2); assert.equal(siblingAborted, true);
});
