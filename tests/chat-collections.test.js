import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatCollections, chatCollection, ensureChatIdentity, checkStoryMode } from '../src/chat-collections.js';
import { embeddingIdentity } from '../src/embedding.js';
import { documents, options, withoutText } from '../src/memory.js';
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
test('created collections and branches are verified from their 201 bodies; conflicts and bodiless responses read again', async () => {
    const entry = await chatCollection(snapshot, owner);
    const tags = { application: 'sillymemory', owner, chat: entry.scope };
    let reads = 0, verified = 0, lists = 0;
    const client = { assertOwned: async () => { reads++; throw missing(); }, verifyOwned: (result, o, scope) => { verified++; assert.deepEqual(result.collection.tags, { ...tags, owner: o, chat: scope }); },
        create: async (name, o, scope) => ({ collection: { collectionName: name, tags: { application: 'sillymemory', owner: o, chat: scope } } }),
        branches: async () => { lists++; return []; }, createBranch: async (name, branch) => ({ branch: { name: branch } }) };
    assert.equal((await new ChatCollections(client, owner, () => {}, () => {}).ensure(snapshot)).branch, entry.branch);
    assert.deepEqual([reads, verified, lists], [1, 1, 1]);
    reads = 0; lists = 0;
    const conflict = { ...client, assertOwned: async () => { if (!reads++) throw missing(); }, verifyOwned: () => { throw new Error('No create body to verify.'); },
        create: async () => { throw new ConnectionError('Conflict', 409); }, branches: async () => ++lists === 1 ? [] : [{ name: entry.branch }], createBranch: async () => { throw new ConnectionError('Conflict', 409); } };
    assert.equal((await new ChatCollections(conflict, owner, () => {}, () => {}).ensure(snapshot)).branch, entry.branch);
    assert.deepEqual([reads, lists], [2, 2]);
    reads = 0; lists = 0;
    const bodiless = { ...conflict, create: async () => {}, createBranch: async () => {} };
    assert.equal((await new ChatCollections(bodiless, owner, () => {}, () => {}).ensure(snapshot)).branch, entry.branch);
    assert.deepEqual([reads, lists], [2, 2]);
    const real = new LambdaClient({ endpoint: 'https://example.test', project: 'test' }, 'synthetic');
    assert.throws(() => real.verifyOwned({ collection: { tags: { ...tags, owner: 'other' } } }, owner, entry.scope), /Ownership/);
    assert.throws(() => real.verifyOwned({ collection: { tags: { ...tags, chat: 'foreign' } } }, owner, entry.scope), /Ownership/);
    real.verifyOwned({ collection: { tags } }, owner, entry.scope);
});
test('ensure reports the analyzers a story was created with and creates new stories from the setting', async () => {
    const entry = await chatCollection(snapshot, owner);
    const tags = { application: 'sillymemory', owner, chat: entry.scope };
    const existing = analyzers => ({ assertOwned: async () => ({ collection: { tags, ...(analyzers ? { indexConfigs: { text: { type: 'text', analyzers } } } : {}) } }), branches: async () => [{ name: entry.branch }] });
    const config = { analyzers: ['english', 'korean'] };
    assert.deepEqual((await new ChatCollections(existing(['korean', 'english']), owner, () => {}, () => {}).ensure(snapshot, undefined, config)).analyzers, ['korean', 'english']);
    assert.deepEqual((await new ChatCollections(existing(undefined), owner, () => {}, () => {}).ensure(snapshot, undefined, config)).analyzers, ['standard']);
    const remembered = []; let requested;
    const fresh = { assertOwned: async () => { throw missing(); }, verifyOwned: result => result,
        // The live service's 201 body carries no indexConfigs; the requested analyzers are the created ones.
        create: async (name, o, scope, analyzers) => { requested = analyzers; return { collection: { collectionName: name, tags: { application: 'sillymemory', owner: o, chat: scope } } }; },
        branches: async () => [], createBranch: async (name, branch) => ({ branch: { name: branch } }) };
    const created = await new ChatCollections(fresh, owner, e => remembered.push(e), () => {}).ensure(snapshot, undefined, config);
    assert.deepEqual([requested, created.analyzers], [config.analyzers, config.analyzers]);
    assert.equal(Object.hasOwn(remembered[0], 'analyzers'), false, 'persisted intent keeps its stored shape');
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

// Group chats keep metadata in their file header; inventory is the group's chat list.
function groupFixture({ files, current = 'current' }) {
    const disk = structuredClone(files), requests = [];
    const ctx = { groupId: '1700000000000', groups: [{ id: '1700000000000', chats: Object.keys(disk) }], characterId: undefined, characters: [],
        chatMetadata: structuredClone(disk[current]), getCurrentChatId: () => current, getRequestHeaders: () => ({}) };
    const fetcher = async (url, options) => {
        const body = JSON.parse(options.body); requests.push([url, body.id]);
        assert.equal(url, '/api/chats/group/get');
        return { ok: true, json: async () => disk[body.id] ? [{ chat_metadata: disk[body.id], user_name: 'unused' }, { mes: 'text' }] : [] };
    };
    let saves = 0;
    const save = async () => { saves++; disk[current] = structuredClone(ctx.chatMetadata); };
    return { ctx, fetcher, save, requests, get saves() { return saves; } };
}
test('group chat identity is saved and verified through group chat reads between member turns', async () => {
    const f = groupFixture({ files: { current: { integrity }, other: { integrity: 'other' } } });
    assert(await ensureChatIdentity(f.ctx, f.save, undefined, f.fetcher));
    const memory = f.ctx.chatMetadata.sillymemory;
    assert.equal(memory.story, memory.id); assert.equal(memory.integrity, integrity); assert.equal(f.saves, 1);
    assert.deepEqual(f.requests, [['/api/chats/group/get', 'current'], ['/api/chats/group/get', 'other'], ['/api/chats/group/get', 'current']]);
    const entry = await chatCollection({ character: 'group:1700000000000', chat: memory.id, memory }, owner);
    assert.notEqual(entry.collection, (await chatCollection({ character: 'Mira.png', chat: memory.id, memory }, owner)).collection);
});
test('group checkpoints and branches fork from their parent group chat; copies start a new story', async () => {
    const memory = { version: 1, story: id, id, integrity };
    const parent = { integrity, sillymemory: memory };
    // A native group branch saves { main_chat, integrity: <new uuid> } over the inherited metadata.
    const branch = groupFixture({ current: 'branch', files: { parent, branch: { ...parent, main_chat: 'parent', integrity: 'fresh-native-branch' } } });
    assert(await ensureChatIdentity(branch.ctx, branch.save, undefined, branch.fetcher));
    const forked = branch.ctx.chatMetadata.sillymemory;
    assert.notEqual(forked.id, id); assert.equal(forked.story, id); assert.equal(forked.source, id);
    const copy = groupFixture({ current: 'copy', files: { parent, copy: structuredClone(parent) } });
    assert(await ensureChatIdentity(copy.ctx, copy.save, undefined, copy.fetcher));
    assert.notEqual(copy.ctx.chatMetadata.sillymemory.id, id); assert.equal(copy.ctx.chatMetadata.sillymemory.story, copy.ctx.chatMetadata.sillymemory.id);
    const reopened = groupFixture({ current: 'parent', files: { parent } });
    assert(await ensureChatIdentity(reopened.ctx, reopened.save, undefined, reopened.fetcher));
    assert.deepEqual(reopened.ctx.chatMetadata.sillymemory, memory); assert.equal(reopened.saves, 0);
});
test('a failed group chat read stops identity verification', async () => {
    const f = groupFixture({ files: { current: { integrity } } });
    const failing = async () => ({ ok: false });
    await assert.rejects(ensureChatIdentity(f.ctx, f.save, undefined, failing), /Could not verify chat identity/);
    f.ctx.groups = [];
    await assert.rejects(ensureChatIdentity(f.ctx, f.save, undefined, f.fetcher), /chat inventory/);
    assert.equal(f.saves, 0);
});

const gemma = { baseUrl: 'http://localhost:11434/v1', model: 'embeddinggemma', queryPrefix: 'task: search result | query: ', documentPrefix: 'title: none | text: ', dimensions: 768 };
test('Private memory on blocks a standard story; a private story keeps its own mode while the saved embedding identity matches', async () => {
    const current = await embeddingIdentity(gemma);
    const stored = tags => ({ collection: { tags: { application: 'sillymemory', owner, chat: 'c', ...tags } } });
    const on = { privateMemory: true, embedding: current }, off = { privateMemory: false, embedding: current };
    assert.equal(checkStoryMode(stored({}), undefined), undefined);
    assert.equal(checkStoryMode(stored({}), off), undefined, 'a standard story works with Private memory off');
    assert.equal(checkStoryMode(stored(current.tags), on), current);
    assert.equal(checkStoryMode(stored(current.tags), off), current, 'a private story keeps working after Private memory is turned off');
    const blocked = (result, setting, pattern) => assert.throws(() => checkStoryMode(result, setting), e => e instanceof ConnectionError && e.code === 'memory-mode' && pattern.test(e.message) && /Rebuild story memory/.test(e.message));
    blocked(stored({}), on, /without Private memory and stores chat text/);
    for (const setting of [on, off]) blocked(stored({ memory_mode: 'text_private' }), setting, /unsupported memory mode/);
    for (const setting of [{ privateMemory: false }, undefined]) blocked(stored(current.tags), setting, /no tested embedding endpoint/);
    for (const changed of [{ model: 'qwen3-embedding:0.6b' }, { queryPrefix: '' }, { documentPrefix: '' }, { dimensions: 1024 }]) {
        const tags = (await embeddingIdentity({ ...gemma, ...changed })).tags;
        for (const setting of [on, off]) blocked(stored(tags), setting, /different embedding model, prefixes or vector dimension/);
    }
});
test('ensure creates new stories in the global mode and stops on a mismatch before any branch work', async () => {
    const entry = await chatCollection(snapshot, owner), embedding = await embeddingIdentity(gemma);
    const tags = { application: 'sillymemory', owner, chat: entry.scope };
    let branchCalls = 0;
    const existing = extra => ({ assertOwned: async () => ({ collection: { tags: { ...tags, ...extra }, indexConfigs: { embedding: { type: 'vector' } } } }),
        branches: async () => { branchCalls++; return [{ name: entry.branch }]; } });
    const on = { ...options(), privateMemory: true, embedding }, off = { ...options(), privateMemory: false, embedding };
    await assert.rejects(new ChatCollections(existing({}), owner, () => {}, () => {}).ensure(snapshot, undefined, on), e => e.code === 'memory-mode');
    await assert.rejects(new ChatCollections(existing(embedding.tags), owner, () => {}, () => {}).ensure(snapshot, undefined, options()), e => e.code === 'memory-mode');
    assert.equal(branchCalls, 0);
    for (const config of [on, off]) {
        const adopted = await new ChatCollections(existing(embedding.tags), owner, () => {}, () => {}).ensure(snapshot, undefined, config);
        assert.equal(adopted.privateMemory, true, 'an existing private story stays private whatever the global setting');
        assert.equal(adopted.analyzers, undefined, 'a private story has no text analyzers to report');
    }
    // A missing (or rebuilt, so deleted) story is created in the current global mode.
    const fresh = requested => ({ assertOwned: async () => { throw missing(); }, verifyOwned: result => result,
        create: async (name, o, scope, analyzers, identity) => { requested.push(identity); return { collection: { collectionName: name, tags: { ...tags, ...identity?.tags } } }; },
        branches: async () => [], createBranch: async (name, branch) => ({ branch: { name: branch } }) });
    const requested = [];
    const privateStory = await new ChatCollections(fresh(requested), owner, () => {}, () => {}).ensure(snapshot, undefined, on);
    const standardStory = await new ChatCollections(fresh(requested), owner, () => {}, () => {}).ensure(snapshot, undefined, off);
    assert.deepEqual(requested, [embedding, undefined]);
    assert.deepEqual([privateStory.branch, privateStory.privateMemory, standardStory.privateMemory], [entry.branch, true, false]);
});
test('a private fork waits for its parent documents compared without text', async () => {
    const parent = 'c'.repeat(32);
    const forked = { ...snapshot, memory: { story: id, source: parent }, messages: [0, 1].map(index => ({ index, text: `Synthetic line ${index}.`, name: index ? 'Mira' : 'User', user: !index, swipe: 0, eligible: true })) };
    const entry = await chatCollection(forked, owner), embedding = await embeddingIdentity(gemma);
    const config = { ...options(), privateMemory: false, embedding };
    const stored = (await documents(forked, owner, config)).docs.map(withoutText);
    const reads = [];
    const client = { assertOwned: async () => ({ collection: { tags: { application: 'sillymemory', owner, chat: entry.scope, ...embedding.tags } } }),
        branches: async () => [{ name: entry.source }], fetchDocs: async (_c, ids, branch, consistent = true) => { reads.push(consistent); return stored.filter(d => ids.includes(d.id)); },
        createBranch: async (_c, branch, source) => { assert.equal(source, entry.source); return { branch: { name: branch } }; } };
    const progress = [];
    assert.equal((await new ChatCollections(client, owner, () => {}, () => {}).ensure(forked, undefined, config, p => progress.push(p.phase))).branch, entry.branch);
    assert.deepEqual(progress, ['committing']);
    assert.deepEqual(reads, [true, false], 'acknowledged text-free documents are polled until committed before the fork');
});
