import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatCollections, chatCollection, ensureChatIdentity } from '../src/chat-collections.js';
import { ConnectionError, LambdaClient } from '../src/client.js';

const owner = 'a'.repeat(32), id = 'b'.repeat(32), integrity = 'native-integrity';
const snapshot = { character: 'Mira.png', chat: id };
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
test('chat collection identity separates owners, characters and native branch IDs', async () => {
    const original = await chatCollection(snapshot, owner);
    assert.match(original.collection, /^smchat_[a-f0-9]{40}$/);
    assert.equal((await chatCollection({ ...snapshot, filename: 'renamed' }, owner)).collection, original.collection);
    for (const [s, o] of [[{ ...snapshot, chat: 'c'.repeat(32) }, owner], [{ ...snapshot, character: 'Other.png' }, owner], [snapshot, 'd'.repeat(32)]]) {
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
    const metadata = { integrity, sillymemory: { id, integrity } };
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
    const client = { assertOwned: async (name, o, signal, scope) => { if (!created) throw missing(); assert.equal(name, created.name); assert.equal(o, owner); assert.equal(scope, created.scope); },
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
    await assert.rejects(manager.delete(await chatCollection(snapshot, owner)), /Denied/); assert.equal(forgot, false);
});
test('cleanup discovers only owned memory names across opaque pagination and rejects cycles', async () => {
    const client = new LambdaClient({ endpoint: 'https://example.test', project: 'test' }, 'synthetic');
    const name = (await chatCollection(snapshot, owner)).collection;
    const tags = { application: 'sillymemory', owner, chat: 'e'.repeat(64) };
    let calls = 0;
    client.request = async (path, options) => {
        assert.equal(options.method, 'GET'); calls++;
        if (calls === 1) return { collections: [{ collectionName: 'unrelated', tags }, { collectionName: name, tags: { ...tags, owner: 'other' } }], nextPageToken: 'opaque+/=' };
        assert.equal(new URL(`https://example.test${path}`).searchParams.get('pageToken'), 'opaque+/=');
        return { collections: [{ collectionName: name, tags }, { collectionName: `sillymemory_${id}`, tags }] };
    };
    const manager = new ChatCollections(client, owner, () => {}, () => {});
    assert.equal((await manager.discover()).length, 2); assert.equal(calls, 2);
    client.request = async () => ({ collections: [], nextPageToken: 'cycle' });
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
    await assert.rejects(engine.sync({ ...snapshot, chat: 'another', messages: [] }, options()), /scope changed/);
    assert.equal(remote, false);
});
