import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatCollections, chatCollection, ensureChatIdentity } from '../src/chat-collections.js';
import { MemoryEngine, Journal, documents, options } from '../src/memory.js';
import { ConnectionError } from '../src/client.js';
const owner = 'a'.repeat(32), root = 'b'.repeat(32), child = 'c'.repeat(32);
const config = options({ recent: 2 });
const snapshot = (id = root) => ({ character: 'Mira.png', chat: id, memory: { story: root, ...(id !== root ? { source: root } : {}) }, messages: Array.from({ length: 6 }, (_, index) => ({ index, text: `Fact ${index}: the compass is blue.`, name: index % 2 ? 'Mira' : 'User', user: !(index % 2), swipe: 0, eligible: true })) });
function fixture() {
    const store = new Map(), states = new Map(); const writes = [];
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const client = {
        async assertOwned(name, o, _, scope) { const c = states.get(name); if (!c) throw new ConnectionError('Absent', 404); assert.equal(c.owner, o); assert.equal(c.scope, scope); },
        async create(name, o, scope) { states.set(name, { owner: o, scope, branches: new Map([['main', new Map()]]) }); },
        async branches(name) { return [...states.get(name).branches.keys()].map(name => ({ name })); },
        async createBranch(name, branch, source) { states.get(name).branches.set(branch, new Map(states.get(name).branches.get(source))); },
        async listDocs(name, branch) { return [...states.get(name).branches.get(branch).values()]; },
        async fetchDocs(name, ids, branch) { return (await this.listDocs(name, branch)).filter(d => ids.includes(d.id)); },
        async upsert(name, docs, _, branch) { writes.push(...docs); for (const d of docs) states.get(name).branches.get(branch).set(d.id, d); },
        async deleteIds(name, ids, _, branch) { for (const id of ids) states.get(name).branches.get(branch).delete(id); },
        async deleteBranch(name, branch) { states.get(name).branches.delete(branch); },
        async search(name, _o, _s, _q, _signal, branch) { return this.listDocs(name, branch); },
    };
    const manager = new ChatCollections(client, owner, () => {}, () => {});
    const engine = async s => { const entry = await manager.ensure(s, undefined, config); return new MemoryEngine({ client, owner, ...entry, journal: new Journal(storage, `${entry.collection}:${entry.branch}`) }); };
    return { client, manager, engine, writes, states };
}
test('story-scoped identities share unchanged prefix documents while branches isolate mutable state', async () => {
    const a = snapshot(), b = snapshot(child);
    assert.deepEqual((await documents(a, owner, config)).docs, (await documents(b, owner, config)).docs);
    const ea = await chatCollection(a, owner), eb = await chatCollection(b, owner);
    assert.equal(ea.collection, eb.collection); assert.notEqual(ea.branch, eb.branch);
    assert.notEqual(ea.collection, (await chatCollection({ ...b, memory: { story: child } }, owner)).collection);
    const f = fixture(), parent = await f.engine(a); await parent.sync(a, config);
    assert.equal(f.writes.length, 4);
    const branch = await f.engine(b); await branch.sync(b, config);
    assert.equal(f.writes.length, 4, 'no inherited upserts');
    const reload = await f.engine(b); await reload.sync(b, config);
    assert.equal(f.writes.length, 4, 'reload reuses verified remote documents');
    b.messages[0].text = 'The compass is red.'; b.messages[0].swipe++;
    await reload.sync(b, config);
    assert.equal(f.writes.length, 5, 'only changed chunk submitted');
    const recalled = await parent.retrieve(a, config, text => text.length / 10);
    assert(recalled.text.includes('compass is blue'));
    assert(!recalled.text.includes('compass is red'));
    await f.manager.delete(eb);
    assert.equal((await f.client.listDocs(ea.collection, ea.branch)).length, 4);
});
test('earlier-point fork deletes future and now-recent chunks only in the child', async () => {
    const f = fixture(), a = snapshot(), b = snapshot(child); b.messages = b.messages.slice(0, 4);
    await (await f.engine(a)).sync(a, config);
    const branch = await f.engine(b); await branch.sync(b, config);
    assert.equal(f.writes.length, 4);
    assert.equal((await f.client.listDocs(branch.collection, branch.branch)).length, 2);
    const parent = await chatCollection(a, owner);
    assert.equal((await f.client.listDocs(parent.collection, parent.branch)).length, 4);
});
test('uncertain upsert is verified on retry instead of embedding again', async () => {
    const f = fixture(), a = snapshot(), engine = await f.engine(a), original = f.client.upsert;
    f.client.upsert = async function (...args) { await original.apply(this, args); throw new ConnectionError('Timeout'); };
    await assert.rejects(engine.sync(a, config), /Timeout/);
    f.client.upsert = original; await engine.sync(a, config);
    assert.equal(f.writes.length, 4);
});
test('native branch inherits the verified story, copied chat metadata starts an independent story', async () => {
    const old = { id: root, integrity: 'parent', version: 1, story: root };
    for (const native of [true, false]) {
        const ctx = { characters: [{ avatar: 'Mira.png' }], characterId: 0, chatMetadata: { integrity: native ? 'child' : 'parent', main_chat: 'original', sillymemory: { ...old } }, getCurrentChatId: () => 'child', getRequestHeaders: () => ({}) };
        let disk;
        const fetcher = async url => ({ ok: true, json: async () => url.endsWith('/chats') ? [{ file_name: 'original.jsonl', chat_metadata: { integrity: 'parent', sillymemory: old } }, ...(disk ? [{ file_name: 'child.jsonl', chat_metadata: disk }] : [])] : [{ chat_metadata: disk }] });
        await ensureChatIdentity(ctx, async () => { disk = structuredClone(ctx.chatMetadata); }, undefined, fetcher);
        assert.notEqual(ctx.chatMetadata.sillymemory.id, root);
        assert.equal(ctx.chatMetadata.sillymemory.story, native ? root : ctx.chatMetadata.sillymemory.id);
        assert.equal(ctx.chatMetadata.sillymemory.source, native ? root : undefined);
    }
});

test('unopened native branch metadata does not rotate its original parent identity', async () => {
    const original = { integrity: 'parent', sillymemory: { id: root, integrity: 'parent', version: 1, story: root } };
    const ctx = { characters: [{ avatar: 'Mira.png' }], characterId: 0, chatMetadata: structuredClone(original), getCurrentChatId: () => 'original', getRequestHeaders: () => ({}) };
    const fetcher = async url => ({ ok: true, json: async () => url.endsWith('/chats') ? [
        { file_name: 'original.jsonl', chat_metadata: original },
        { file_name: 'child.jsonl', chat_metadata: { ...original, integrity: 'child', main_chat: 'original' } },
    ] : [{ chat_metadata: original }] });
    await ensureChatIdentity(ctx, async () => assert.fail('Parent identity must remain intact'), undefined, fetcher);
    assert.deepEqual(ctx.chatMetadata, original);
});
test('uncertain branch creation reuses its journaled identity and deletion failures retain cleanup intent', async () => {
    const f = fixture(), a = snapshot(); await (await f.engine(a)).sync(a, config);
    const b = snapshot(child), original = f.client.createBranch;
    const remember = [], forget = [];
    const manager = new ChatCollections(f.client, owner, e => remember.push(e), (...e) => forget.push(e));
    f.client.createBranch = async function (...args) { assert.equal(remember.at(-1).branch, `chat_${child}`); await original.apply(this, args); throw new ConnectionError('Lost response'); };
    await assert.rejects(manager.ensure(b, undefined, config), /Lost response/);
    const adopted = await manager.ensure(b, undefined, config);
    assert.equal(adopted.branch, `chat_${child}`);
    f.client.deleteBranch = async () => { throw new ConnectionError('Denied', 403); };
    await assert.rejects(manager.delete(adopted), /Denied/);
    assert.equal(forget.length, 0);
});
test('a chat switch during remote reconciliation sends no writes for the abandoned snapshot', async () => {
    const f = fixture(), a = snapshot(), engine = await f.engine(a), list = f.client.listDocs; let valid = true;
    f.client.listDocs = async function (...args) { const docs = await list.apply(this, args); valid = false; return docs; };
    assert.equal(await engine.sync(a, config, () => valid), null);
    assert.equal(f.writes.length, 0);
});

test('fork waits for committed matching content and cancellation never creates a child', async () => {
    const f = fixture(), a = snapshot(); await (await f.engine(a)).sync(a, config);
    const fetch = f.client.fetchDocs, create = f.client.createBranch; let committedRead = false;
    f.client.fetchDocs = async function (name, ids, branch, consistent) {
        if (consistent === false) committedRead = true;
        return fetch.call(this, name, ids, branch);
    };
    f.client.createBranch = async function (...args) { assert(committedRead, 'consistent overlay is not enough to fork'); return create.apply(this, args); };
    await f.manager.ensure(snapshot(child), undefined, config);
    let valid = true;
    f.client.fetchDocs = async function (...args) { const rows = await fetch.apply(this, args); valid = false; return rows; };
    const other = snapshot('d'.repeat(32));
    await assert.rejects(f.manager.ensure(other, () => valid, config), /Chat changed/);
    const entry = await chatCollection(other, owner);
    assert(!(await f.client.branches(entry.collection)).some(b => b.name === entry.branch));
});
