import { ConnectionError } from './client.js';
import { capture, digest, documents, Journal, MemoryEngine, options } from './memory.js';
import { chatCollection } from './chat-collections.js';
import { poll } from './gate.js';

const id = () => crypto.randomUUID().replaceAll('-', '');
const fail = message => { throw new ConnectionError(message); };
const current = valid => { if (!valid()) fail('Chat changed during checkpoint preparation. Open the saved checkpoint to retry.'); };
const metadataOf = rows => rows?.[0]?.chat_metadata;
const snapshotOf = (rows, avatar, file) => capture({ characters: [{ avatar }], characterId: 0,
    getCurrentChatId: () => file, chatMetadata: metadataOf(rows), chat: rows.slice(1) });
export async function checkpointDigest(rows) {
    const copy = structuredClone(rows);
    delete copy[0].chat_metadata.sillymemory.checkpoint;
    // Host JSONL header labels are not chat state.
    return digest(JSON.stringify([copy[0].chat_metadata, copy.slice(1)]));
}
async function checked(host, file) {
    const rows = await host.read(file), metadata = metadataOf(rows), mark = metadata?.sillymemory?.checkpoint;
    if (!Array.isArray(rows) || !rows.length || !mark || metadata.sillymemory.version !== 1
        || !['pending', 'ready'].includes(mark.state) || mark.hash !== await checkpointDigest(rows)) {
        fail('Checkpoint transcript or metadata changed. No checkpoint was resumed.');
    }
    return rows;
}
async function saveVerified(host, file, rows, valid) {
    current(valid);
    // A successful or ambiguous host save still requires verification of its saved body.
    let saveError;
    try { await host.save(file, rows.slice(1), metadataOf(rows)); } catch (error) { saveError = error; }
    current(valid);
    const saved = await host.read(file);
    if (JSON.stringify([metadataOf(saved), saved.slice(1)]) !== JSON.stringify([metadataOf(rows), rows.slice(1)])) {
        if (saveError) throw saveError;
        fail(`Checkpoint save is not confirmed. Select ${file} and retry if it exists.`);
    }
}

export async function createCheckpoint({ host, client, collections, owner, rows, avatar, config, valid = () => true, progress = () => {} }) {
    const metadata = metadataOf(rows), memory = metadata?.sillymemory;
    if (memory?.version !== 1 || memory.checkpoint) fail('Select a versioned story path before saving a checkpoint.');
    const copy = structuredClone(rows), checkpointId = id();
    const file = `SillyMemory checkpoint ${checkpointId}`;
    copy[0].chat_metadata = { ...metadata, integrity: id(), sillymemory: { version: 1, id: checkpointId,
        story: memory.story, source: memory.id } };
    copy[0].chat_metadata.sillymemory.integrity = copy[0].chat_metadata.integrity;
    const mark = { state: 'pending', config: options(config), createdAt: new Date().toISOString() };
    copy[0].chat_metadata.sillymemory.checkpoint = mark;
    mark.hash = await checkpointDigest(copy);
    progress(`Saving ${file}…`);
    await saveVerified(host, file, copy, valid); // Durable recovery identity precedes remote writes.
    await finishCheckpoint({ host, client, collections, owner, file, avatar, valid, progress });
    return file;
}

export async function finishCheckpoint({ host, client, collections, owner, file, avatar, valid = () => true, progress = () => {} }) {
    const rows = await checked(host, file), mark = metadataOf(rows).sillymemory.checkpoint;
    if (mark.state === 'ready') { await verifyRemote({ client, owner, rows, avatar, file }); current(valid); return file; }
    current(valid);
    const snapshot = snapshotOf(rows, avatar, file), config = options(mark.config);
    progress('Preparing checkpoint memory. Waiting for committed history may take a few minutes…');
    const entry = await collections.ensure(snapshot, valid, config);
    current(valid);
    // The source transcript on the host is the durable retry journal. Only pending
    // checkpoint branches can be reconciled; ready branches are never written.
    const storage = new Map();
    const journal = new Journal({ getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, 'checkpoint');
    const engine = new MemoryEngine({ client, owner, ...entry, journal });
    await engine.sync(snapshot, config, valid);
    const desired = (await documents(snapshot, owner, config)).docs;
    await poll(async () => {
        current(valid);
        const committed = await client.listDocs(entry.collection, entry.branch);
        return committed.length === desired.length && desired.every(d => committed.some(c => Object.keys(d).every(k => c[k] === d[k])));
    }, { attempts: 120, delayMs: 1000 });
    current(valid);
    const branch = (await client.branches(entry.collection)).find(b => b.name === entry.branch);
    if (!branch) fail('Checkpoint branch is not confirmed. Retry preparation.');
    const finalize = async () => {
        current(valid);
        const latest = await checked(host, file);
        if (JSON.stringify(latest) !== JSON.stringify(rows)) fail('Checkpoint changed during preparation. The saved file was preserved.');
        mark.state = 'ready'; mark.snapshot = branch.headSnapshot?.snapshotId || null;
        await saveVerified(host, file, rows, valid);
    };
    if (host.withWriteLock) await host.withWriteLock(finalize); else await finalize();
    return file;
}

async function verifyRemote({ client, owner, rows, avatar, file }) {
    const mark = metadataOf(rows).sillymemory.checkpoint;
    if (mark.state !== 'ready') fail('Finish preparing this checkpoint before resuming it.');
    const entry = await chatCollection(snapshotOf(rows, avatar, file), owner);
    await client.assertOwned(entry.collection, owner, undefined, entry.scope);
    const branch = (await client.branches(entry.collection)).find(b => b.name === entry.branch);
    if (!branch || (branch.headSnapshot?.snapshotId || null) !== mark.snapshot) fail('Checkpoint memory is missing or changed. No checkpoint was resumed.');
    return entry;
}

export async function resumeCheckpoint({ host, client, owner, file, avatar, intents, valid = () => true }) {
    const rows = await checked(host, file);
    await verifyRemote({ client, owner, rows, avatar, file });
    current(valid);
    const metadata = metadataOf(rows), source = metadata.sillymemory.id;
    const key = await digest(JSON.stringify([owner, avatar, source, metadata.sillymemory.checkpoint.hash]));
    let intent = intents?.get(key);
    if (!intent) { intent = { id: id(), integrity: id() }; intents?.set(key, intent); }
    if (!/^[a-f0-9]{32}$/.test(intent.id || '') || !/^[a-f0-9]{32}$/.test(intent.integrity || '')) fail('Invalid pending resume identity. No chat was written.');
    const target = `SillyMemory resume ${intent.id}`;
    const memory = { id: intent.id, integrity: intent.integrity, version: 1, story: metadata.sillymemory.story, source };
    rows[0].chat_metadata = { ...metadata, main_chat: file, integrity: memory.integrity, sillymemory: memory };
    current(valid);
    const existing = await host.read(target);
    current(valid);
    if (existing.length) {
        if (JSON.stringify([metadataOf(existing), existing.slice(1)]) !== JSON.stringify([metadataOf(rows), rows.slice(1)])) {
            intents?.delete(key); // The saved path exists; a subsequent explicit retry is a new request.
            fail('Pending resume chat changed and was preserved. Open it from the chat list, or retry to start another path.');
        }
    } else await saveVerified(host, target, rows, valid);
    current(valid);
    await host.open(target);
    intents?.delete(key);
    return target;
}
