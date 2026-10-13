import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatCollections, chatCollection, ensureChatIdentity } from '../src/chat-collections.js';
import { ConnectionError, LambdaClient } from '../src/client.js';

const owner = 'a'.repeat(32), id = 'b'.repeat(32), integrity = 'native-integrity';
const snapshot = { character: 'Mira.png', chat: id, memory: { story: id } };
const missing = () => new ConnectionError('Missing', 404);
function identityFixture({ metadata = { integrity }, other = [] } = {}) {
    const ctx = { characters: [{ avatar: 'Mira.png' }], characterId: 0, chatMetadata: structuredClone(metadata),
        getCurrentChatId: () => 'current', getRequestHeaders: () => ({}) };
    let disk = structuredClone(metadata), saves = 0, saveWorks = true;
    const fetcher = async (url, options) => {
        assert.equal(JSON.parse(options.body).avatar_url, 'Mira.png');
        return { ok: true, json: async () => url.endsWith('/chats') ? [{ file_name: 'current.jsonl', chat_metadata: disk }, ...other] : [{ chat_metadata: disk }] };
    };
    const save = async () => { saves++; if (saveWorks) disk = structuredClone(ctx.chatMetadata); };
    return { ctx, fetcher, save, get saves() { return saves; }, failSave: () => { saveWorks = false; }, recoverSave: () => { saveWorks = true; } };
}
test('chat collection identity separates owners, characters and stories while branches share a collection', async () => {
    const original = await chatCollection(snapshot, owner);
    assert.match(original.collection, /^smstory_[a-f0-9]{40}$/);
    assert.equal((await chatCollection({ ...snapshot, filename: 'renamed' }, owner)).collection, original.collection);
    const fork = await chatCollection({ ...snapshot, chat: 'c'.repeat(32) }, owner);
    assert.equal(fork.collection, original.collection); assert.notEqual(fork.branch, original.branch);
    for (const [s, o] of [[{ ...snapshot, memory: { story: 'c'.repeat(32) } }, owner], [{ ...snapshot, character: 'Other.png' }, owner], [snapshot, 'd'.repeat(32)]]) {
        assert.notEqual((await chatCollection(s, o)).collection, original.collection);
    }
});
test('native metadata is persisted and verified before use, including save failure retry', async () => {
    const f = identityFixture(); f.failSave();
    await assert.rejects(ensureChatIdentity(f.ctx, f.save, undefined, f.fetcher), /not saved/);
    const pendingId = f.ctx.chatMetadata.sillymemory.id;
    f.recoverSave(); assert(await ensureChatIdentity(f.ctx, f.save, undefined, f.fetcher));
    assert.equal(f.ctx.chatMetadata.sillymemory.id, pendingId); assert.equal(f.saves, 2);
});
test('rename preserves identity; copied metadata and native branch integrity rotate it', async () => {
    const metadata = { integrity, sillymemory: { version: 1, story: id, id, integrity } };
    const rename = identityFixture({ metadata });
    await ensureChatIdentity(rename.ctx, rename.save, undefined, rename.fetcher);
    assert.equal(rename.ctx.chatMetadata.sillymemory.id, id); assert.equal(rename.saves, 0);
    const copy = identityFixture({ metadata, other: [{ file_name: 'original.jsonl', chat_metadata: metadata }] });
    await ensureChatIdentity(copy.ctx, copy.save, undefined, copy.fetcher);
    assert.notEqual(copy.ctx.chatMetadata.sillymemory.id, id);
    const branch = identityFixture({ metadata: { ...metadata, integrity: 'fresh-native-branch' } });
    await ensureChatIdentity(branch.ctx, branch.save, undefined, branch.fetcher);
    assert.notEqual(branch.ctx.chatMetadata.sillymemory.id, id);
});
test('late chat switch never saves identity into a different active chat', async () => {
    const f = identityFixture();
    assert.equal(await ensureChatIdentity(f.ctx, f.save, () => false, f.fetcher), false);
    assert.equal(f.saves, 0);
});
test('lost create ACK keeps intent and retry adopts the same verified collection', async () => {
    const remembered = [], forgotten = []; let created, creates = 0;
    const client = { branches: async () => [{ name: `chat_${id}` }], assertOwned: async (name, o, signal, scope) => { if (!created) throw missing(); assert.equal(name, created.name); assert.equal(o, owner); assert.equal(scope, created.scope); },
        create: async (name, o, scope) => { creates++; assert.equal(remembered.at(-1).collection, name); created = { name, scope }; throw new ConnectionError('Timeout'); } };
    const manager = new ChatCollections(client, owner, e => remembered.push(e), e => forgotten.push(e));
    await assert.rejects(manager.ensure(snapshot), /Timeout/);
    const entry = await manager.ensure(snapshot); assert.equal(entry.collection, created.name); assert.equal(creates, 1); assert.equal(forgotten.length, 0);
});
test('create conflict requires fresh ownership and chat verification; deletion retains failed intent', async () => {
    let checks = 0;
    const client = { assertOwned: async () => { if (!checks++) throw missing(); throw new ConnectionError('Ownership'); }, create: async () => { throw new ConnectionError('Conflict', 409); }, deleteOwnedCollection: async () => { throw new ConnectionError('Denied'); } };
    let forgot = false; const manager = new ChatCollections(client, owner, () => {}, () => { forgot = true; });
    await assert.rejects(manager.ensure(snapshot), /Ownership/);
    await assert.rejects(manager.delete({ collection: 'whole-story' }), /Denied/); assert.equal(forgot, false);
});
test('cleanup discovers only owned memory names across opaque pagination and rejects cycles', async () => {
    const client = new LambdaClient({ endpoint: 'https://example.test', project: 'test' }, 'synthetic');
    const name = (await chatCollection(snapshot, owner)).collection;
    const tags = { application: 'sillymemory', owner, chat: 'e'.repeat(64) };
    let calls = 0;
    client.call = async operation => operation({ listCollections: async params => {
        calls++;
        if (calls === 1) return { collections: [{ collectionName: 'unrelated', tags }, { collectionName: name, tags: { ...tags, owner: 'other' } }], nextPageToken: 'opaque+/=' };
        assert.equal(params.pageToken, 'opaque+/=');
        return { collections: [{ collectionName: name, tags }, { collectionName: `sillymemory_${id}`, tags }] };
    } });
    const manager = new ChatCollections(client, owner, () => {}, () => {});
    assert.equal((await manager.discover()).length, 1); assert.equal(calls, 2);
    client.call = async () => ({ collections: [], nextPageToken: 'cycle' });
    await assert.rejects(client.listOwned(owner), /pagination/);
});
test('collection tags prevent adoption or deletion of another chat within the same owner', async () => {
    const client = new LambdaClient({ endpoint: 'https://example.test', project: 'test' }, 'synthetic');
    client.get = async () => ({ collection: { tags: { application: 'sillymemory', owner, chat: 'foreign' } } });
    await assert.rejects(client.assertOwned('synthetic', owner, undefined, 'expected'), /Ownership/);
    await assert.rejects(client.deleteOwnedCollection('synthetic', owner, 'expected'), /Ownership/);
});

test('a collection engine refuses another chat before any remote operation', async () => {
    const { MemoryEngine, Journal, options } = await import('../src/memory.js');
    const entry = await chatCollection(snapshot, owner); let remote = false;
    const engine = new MemoryEngine({ ...entry, owner, client: { assertOwned: async () => { remote = true; } }, journal: new Journal({}, 'synthetic') });
    await assert.rejects(engine.sync({ ...snapshot, memory: { story: 'another' }, messages: [] }, options()), /scope changed/);
    assert.equal(remote, false);
});


test('new story identity is persisted and verified after failed or ambiguous saves', async () => {
    for (const mode of ['rejected', 'unpersisted', 'lost-response']) {
        const f = identityFixture();
        f.ctx.chatMetadata.sillymemory = { id, integrity, version: 1, story: id };
        if (mode === 'unpersisted') f.failSave();
        const save = async () => {
            if (mode !== 'rejected') await f.save();
            if (mode !== 'unpersisted') throw new Error('Synthetic save failure');
        };
        await assert.rejects(ensureChatIdentity(f.ctx, save, undefined, f.fetcher), /save failure|not saved/);
        f.recoverSave();
        assert(await ensureChatIdentity(f.ctx, f.save, undefined, f.fetcher));
        assert.deepEqual(f.ctx.chatMetadata.sillymemory, { id, integrity, version: 1, story: id });
        assert.equal(f.saves, mode === 'unpersisted' ? 2 : 1, 'persist once or reuse the accepted save');
    }
});

test('unsupported metadata is rejected without migration or remote writes', async () => {
    const f = identityFixture({ metadata: { integrity, sillymemory: { id, integrity } } });
    await assert.rejects(ensureChatIdentity(f.ctx, f.save, undefined, f.fetcher), /Invalid story/);
    assert.equal(f.saves, 0);
    await assert.rejects(chatCollection({ character: 'Mira.png', chat: id }, owner), /Invalid story/);
});
