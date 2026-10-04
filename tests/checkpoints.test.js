import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint, finishCheckpoint, resumeCheckpoint, listCheckpoints, renameCheckpoint, deleteCheckpoint } from '../src/checkpoints.js';
import { ChatCollections } from '../src/chat-collections.js';
import { capture, Journal, MemoryEngine, options } from '../src/memory.js';
import { ConnectionError } from '../src/client.js';
const owner = 'a'.repeat(32), chat = 'b'.repeat(32), avatar = 'Mira.png', config = options({ recent: 2 });
async function fixture(count = 4) {
    const rows = [{ chat_metadata: { integrity: 'native', variables: { flag: 'before' }, sillymemory: { id: chat, story: chat, integrity: 'native', version: 1 } } }, ...Array.from({ length: count }, (_, i) => ({ mes: `Fact ${i}`, name: 'Mira', is_user: false, swipe_id: 1, swipes: ['old choice', `Fact ${i}`], swipe_info: [{ extra: {} }, { extra: { note: 'retained' } }], extra: {} }))];
    const files = new Map(), branches = new Map(); let exists = false, writes = 0, opened;
    const host = { read: async f => structuredClone(files.get(f) || []), save: async (f, messages, metadata) => { files.set(f, [{ chat_metadata: structuredClone(metadata) }, ...structuredClone(messages)]); }, open: async f => { opened = f; } };
    host.list = async () => [...files].map(([file, rows]) => ({ file_name: `${file}.jsonl`, chat_metadata: structuredClone(rows[0].chat_metadata) }));
    host.remove = async file => { files.delete(file); };
    const client = {
        assertOwned: async () => { if (!exists) throw new ConnectionError('missing', 404); },
        deleteBranch: async (_, branch) => { branches.delete(branch); },
        create: async () => { exists = true; branches.set('main', { docs: new Map(), head: null }); },
        branches: async () => [...branches].map(([name, b]) => ({ name, headSnapshot: b.head ? { snapshotId: b.head } : null })),
        createBranch: async (_, name, source) => { const b = branches.get(source); branches.set(name, { docs: new Map(b.docs), head: b.head }); },
        listDocs: async (_, name) => [...branches.get(name).docs.values()],
        fetchDocs: async (_, ids, name) => ids.map(id => branches.get(name).docs.get(id)).filter(Boolean),
        upsert: async (_, docs, _signal, name) => { const b = branches.get(name); docs.forEach(d => b.docs.set(d.id, d)); writes += docs.length; b.head = `snapshot-${writes}`; },
        deleteIds: async (_, ids, _signal, name) => { const b = branches.get(name); ids.forEach(id => b.docs.delete(id)); b.head = `deleted-${name}`; },
    };
    const collections = new ChatCollections(client, owner, () => {}, () => {});
    const snapshot = capture({ characterId: 0, characters: [{ avatar }], getCurrentChatId: () => 'source', chatMetadata: rows[0].chat_metadata, chat: rows.slice(1) });
    const entry = await collections.ensure(snapshot, undefined, config);
    await new MemoryEngine({ client, owner, ...entry, journal: new Journal({ getItem: () => null, setItem: () => {} }, 'unit') }).sync(snapshot, config);
    return { host, client, collections, owner, avatar, story: chat, rows, config, files, branches, get writes() { return writes; }, get opened() { return opened; } };
}
test('checkpoint reuses committed documents and restores full transcript/swipes into independent paths', async () => {
    const f = await fixture(), before = f.writes;
    const file = await createCheckpoint(f), saved = structuredClone(f.files.get(file));
    assert.equal(f.writes, before);
    assert.equal(saved[0].chat_metadata.sillymemory.checkpoint.state, 'ready');
    f.rows[1].mes = 'Changed future'; f.rows[0].chat_metadata.variables.flag = 'after';
    const a = await resumeCheckpoint({ ...f, file }), b = await resumeCheckpoint({ ...f, file });
    assert.notEqual(a, b); assert.equal(f.opened, b);
    for (const target of [a, b]) {
        const restored = f.files.get(target);
        assert.deepEqual(restored.slice(1), saved.slice(1));
        assert.equal(restored[0].chat_metadata.variables.flag, 'before');
        assert.equal(restored[0].chat_metadata.sillymemory.checkpoint, undefined);
        assert.equal(restored[0].chat_metadata.sillymemory.source, saved[0].chat_metadata.sillymemory.id);
    }
    assert.deepEqual(f.files.get(file), saved); assert.equal(f.writes, before);
});
test('changed transcript, changed snapshot and pending checkpoint cannot be resumed', async () => {
    const f = await fixture(), file = await createCheckpoint(f), original = structuredClone(f.files.get(file));
    f.files.get(file)[1].swipes[0] = 'Changed hidden swipe';
    await assert.rejects(resumeCheckpoint({ ...f, file }), /transcript/);
    f.files.set(file, structuredClone(original));
    const memory = original[0].chat_metadata.sillymemory;
    f.branches.get(`chat_${memory.id}`).head = 'foreign-snapshot';
    await assert.rejects(resumeCheckpoint({ ...f, file }), /missing or changed/);
    f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state = 'pending';
    await assert.rejects(resumeCheckpoint({ ...f, file }), /Finish preparing/);
    assert.equal(f.opened, undefined);
});
test('pending checkpoint survives a lost branch response and can finish without duplicate embeddings', async () => {
    const f = await fixture(), original = f.client.createBranch, before = f.writes;
    f.client.createBranch = async (...args) => { await original(...args); throw new Error('Lost response'); };
    await assert.rejects(createCheckpoint(f), /Lost response/);
    const file = [...f.files.keys()][0]; assert(file);
    assert.equal(f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state, 'pending');
    f.client.createBranch = original;
    await finishCheckpoint({ ...f, file });
    assert.equal(f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state, 'ready');
    assert.equal(f.writes, before);
});
test('unconfirmed local checkpoint saves never create a remote branch; empty memory can be saved', async () => {
    const f = await fixture(1), count = f.branches.size, save = f.host.save;
    f.host.save = async () => {};
    await assert.rejects(createCheckpoint(f), /save is not confirmed/);
    assert.equal(f.branches.size, count);
    f.host.save = save;
    const file = await createCheckpoint(f);
    assert.equal(f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.snapshot, null);
    await resumeCheckpoint({ ...f, file });
});

test('lost ready-save acknowledgement retains a finishable checkpoint; canceled resume creates no chat', async () => {
    const f = await fixture(), save = f.host.save, before = f.writes;
    f.host.save = async (file, messages, metadata) => {
        if (metadata.sillymemory.checkpoint?.state === 'ready') return;
        return save(file, messages, metadata);
    };
    await assert.rejects(createCheckpoint(f), /save is not confirmed/);
    const file = [...f.files.keys()][0];
    assert.equal(f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state, 'pending');
    f.host.save = save;
    await finishCheckpoint({ ...f, file });
    assert.equal(f.writes, before);
    await assert.rejects(resumeCheckpoint({ ...f, file, valid: () => false }), /Chat changed/);
    assert.equal(f.files.size, 1); assert.equal(f.opened, undefined);
});

test('finishing a pending checkpoint never overwrites edits saved during remote preparation', async () => {
    const f = await fixture(), create = f.client.createBranch;
    f.client.createBranch = async (...args) => { await create(...args); throw new Error('Interrupted'); };
    await assert.rejects(createCheckpoint(f), /Interrupted/);
    const file = [...f.files.keys()][0]; f.client.createBranch = create;
    const list = f.client.listDocs; let edited = false;
    f.client.listDocs = async (...args) => {
        const result = await list(...args);
        if (!edited) { f.files.get(file)[1].mes = 'User edit must survive'; edited = true; }
        return result;
    };
    await assert.rejects(finishCheckpoint({ ...f, file }), /changed/);
    assert.equal(f.files.get(file)[1].mes, 'User edit must survive');
    assert.equal(f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state, 'pending');
});

test('resume retry reuses an unchanged saved path and preserves an edited path before another explicit attempt', async () => {
    for (const edited of [false, true]) {
        const f = await fixture(), file = await createCheckpoint(f), intents = new Map(), save = f.host.save, read = f.host.read;
        let loseRead = false;
        f.host.save = async (...args) => { await save(...args); loseRead = true; throw new Error('Lost save response'); };
        f.host.read = async name => { if (loseRead && name.startsWith('SillyMemory resume')) throw new Error('Read unavailable'); return read(name); };
        await assert.rejects(resumeCheckpoint({ ...f, file, intents }), /Read unavailable/);
        const target = [...f.files.keys()].find(name => name.startsWith('SillyMemory resume'));
        assert(target); assert.equal(intents.size, 1);
        f.host.read = read; f.host.save = async () => assert.fail('Existing resume must not be written again');
        if (edited) {
            f.files.get(target)[1].mes = 'User continued this saved resume';
            await assert.rejects(resumeCheckpoint({ ...f, file, intents }), /Pending resume chat changed/);
            assert.equal(f.files.get(target)[1].mes, 'User continued this saved resume');
            assert.equal(f.files.size, 2); assert.equal(intents.size, 0);
            f.host.save = save;
            assert.notEqual(await resumeCheckpoint({ ...f, file, intents }), target);
            assert.equal(f.files.get(target)[1].mes, 'User continued this saved resume');
            assert.equal(f.files.size, 3);
        } else {
            assert.equal(await resumeCheckpoint({ ...f, file, intents }), target);
            assert.equal(f.files.size, 2); assert.equal(intents.size, 0);
        }
    }
});

test('lost resume acknowledgement can be verified immediately without creating another path', async () => {
    const f = await fixture(), file = await createCheckpoint(f), save = f.host.save, intents = new Map();
    f.host.save = async (...args) => { await save(...args); throw new Error('Lost response'); };
    const target = await resumeCheckpoint({ ...f, file, intents });
    assert.equal(f.opened, target); assert.equal(f.files.size, 2); assert.equal(intents.size, 0);
});


test('manager lists only this story, checks snapshots once, and renames without changing restoration', async () => {
    const f = await fixture();
    const first = await createCheckpoint({ ...f, name: 'Before the harbor' }), second = await createCheckpoint(f);
    const before = structuredClone(f.files.get(first)), reads = { branches: 0, owned: 0 };
    const branches = f.client.branches, owned = f.client.assertOwned;
    f.client.branches = async (...args) => { reads.branches++; return branches(...args); };
    f.client.assertOwned = async (...args) => { reads.owned++; return owned(...args); };
    const unrelated = structuredClone(before); unrelated[0].chat_metadata.sillymemory.story = 'f'.repeat(32); unrelated[0].chat_metadata.sillymemory.id = 'e'.repeat(32);
    f.files.set('other story', unrelated);
    const list = await listCheckpoints(f);
    assert.equal(list.length, 2); assert(list.every(x => x.status === 'ready'));
    assert.equal(list.find(x => x.file === first).name, 'Before the harbor');
    assert.deepEqual(reads, { branches: 1, owned: 1 });
    await renameCheckpoint({ ...f, file: first }, '  Observatory  ');
    assert.equal(f.files.get(first)[0].chat_metadata.sillymemory.checkpoint.name, 'Observatory');
    assert.equal(f.files.get(first)[0].chat_metadata.sillymemory.checkpoint.hash, before[0].chat_metadata.sillymemory.checkpoint.hash);
    const resumed = await resumeCheckpoint({ ...f, file: first });
    assert.deepEqual(f.files.get(resumed).slice(1), before.slice(1));
    await assert.rejects(renameCheckpoint({ ...f, file: second }, 'x'.repeat(121)), /120 characters/);
    await assert.rejects(deleteCheckpoint({ ...f, file: 'other story' }), /outside this story/);
});

test('manager distinguishes pending, modified, missing, changed and unverified remote states', async () => {
    const f = await fixture(), file = await createCheckpoint(f), original = structuredClone(f.files.get(file));
    const status = async () => (await listCheckpoints(f))[0].status;
    f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state = 'pending'; assert.equal(await status(), 'pending');
    f.files.set(file, structuredClone(original)); f.files.get(file)[1].swipes[0] = 'Changed'; assert.equal(await status(), 'modified');
    f.files.set(file, structuredClone(original)); const branch = `chat_${original[0].chat_metadata.sillymemory.id}`;
    f.branches.get(branch).head = 'changed'; assert.equal(await status(), 'remote-changed');
    f.branches.delete(branch); assert.equal(await status(), 'missing');
    assert.equal((await listCheckpoints({ ...f, client: undefined }))[0].status, 'unverified');
    f.client.assertOwned = async () => { throw new ConnectionError('Authentication failed', 401); };
    assert.equal(await status(), 'unverified');
    f.client.assertOwned = async () => { throw new ConnectionError('Missing', 404); };
    assert.equal(await status(), 'missing');
});

test('manager rejects duplicate identities and stale story requests without mutation', async () => {
    const f = await fixture(), file = await createCheckpoint(f);
    f.files.set('duplicate', structuredClone(f.files.get(file)));
    assert((await listCheckpoints(f)).every(x => x.status === 'duplicate'));
    await assert.rejects(renameCheckpoint({ ...f, file }, 'Rename'), /duplicated/);
    await assert.rejects(deleteCheckpoint({ ...f, file }), /duplicated/);
    assert.equal(f.files.size, 2);
    f.files.delete('duplicate');
    await assert.rejects(listCheckpoints({ ...f, valid: () => false }), /Chat changed/);
    await assert.rejects(deleteCheckpoint({ ...f, file, valid: () => false }), /Chat changed/);
    assert.equal(f.files.size, 1);
});

test('checkpoint deletion preserves sibling memory and durable retry record until remote cleanup succeeds', async () => {
    const f = await fixture(), file = await createCheckpoint(f), sibling = await createCheckpoint(f);
    const siblingRows = structuredClone(f.files.get(sibling)), branchCount = f.branches.size, remove = f.client.deleteBranch;
    f.client.deleteBranch = async () => { throw new ConnectionError('Unavailable', 503); };
    await assert.rejects(deleteCheckpoint({ ...f, file }), /Unavailable/);
    assert(f.files.has(file)); assert.equal(f.branches.size, branchCount);
    f.client.deleteBranch = remove;
    const hostRemove = f.host.remove;
    f.host.remove = async () => { throw new Error('Local delete failed'); };
    await assert.rejects(deleteCheckpoint({ ...f, file }), /Local delete failed/);
    assert(f.files.has(file)); assert.equal(f.branches.size, branchCount - 1);
    assert.equal((await listCheckpoints(f)).find(x => x.file === file).status, 'missing');
    f.host.remove = hostRemove;
    await deleteCheckpoint({ ...f, file });
    assert(!f.files.has(file)); assert.deepEqual(f.files.get(sibling), siblingRows);
    assert.equal(f.branches.size, branchCount - 1);
});

test('deletion and rename preserve edits that arrive between reads', async () => {
    const f = await fixture(), file = await createCheckpoint(f), remove = f.client.deleteBranch;
    f.client.deleteBranch = async (...args) => { await remove(...args); f.files.get(file)[1].mes = 'Keep this edit'; };
    await assert.rejects(deleteCheckpoint({ ...f, file }), /changed during deletion/);
    assert.equal(f.files.get(file)[1].mes, 'Keep this edit');
    const other = await createCheckpoint(f), read = f.host.read; let reads = 0;
    f.host.read = async name => { if (++reads === 2) f.files.get(name)[1].mes = 'Edit before rename'; return read(name); };
    await assert.rejects(renameCheckpoint({ ...f, file: other }, 'New name'), /changed/);
    assert.equal(f.files.get(other)[1].mes, 'Edit before rename');
});


test('a committed branch still requires complete checkpoint contents before readiness', async () => {
    const f = await fixture(), list = f.client.listDocs; let checkpointLists = 0;
    f.client.listDocs = async (collection, branch) => {
        const rows = await list(collection, branch);
        if (branch !== `chat_${chat}` && ++checkpointLists === 2) return rows.slice(1);
        return rows;
    };
    await assert.rejects(createCheckpoint(f), /content does not match/);
    assert.equal(checkpointLists, 2, 'one reconciliation list and one full final verification');
    assert.equal([...f.files.values()][0][0].chat_metadata.sillymemory.checkpoint.state, 'pending');
});


test('canceled checkpoint reconciliation retains pending state and reports checkpoint cancellation', async () => {
    const f = await fixture(), create = f.client.createBranch;
    f.client.createBranch = async (...args) => { await create(...args); throw new Error('Interrupted'); };
    await assert.rejects(createCheckpoint(f), /Interrupted/);
    f.client.createBranch = create;
    const file = [...f.files.keys()][0], list = f.client.listDocs; let valid = true;
    f.client.listDocs = async (...args) => { const rows = await list(...args); valid = false; return rows; };
    await assert.rejects(finishCheckpoint({ ...f, file, valid: () => valid }), /Chat changed during checkpoint preparation/);
    assert.equal(f.files.get(file)[0].chat_metadata.sillymemory.checkpoint.state, 'pending');
});
