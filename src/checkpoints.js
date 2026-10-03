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

export async function createCheckpoint({ host, client, collections, owner, rows, avatar, config, name = '', valid = () => true, progress = () => {} }) {
    const metadata = metadataOf(rows), memory = metadata?.sillymemory;
    if (memory?.version !== 1 || memory.checkpoint) fail('Select a versioned story path before saving a checkpoint.');
    const copy = structuredClone(rows), checkpointId = id();
    const file = `SillyMemory checkpoint ${checkpointId}`;
    copy[0].chat_metadata = { ...metadata, integrity: id(), sillymemory: { version: 1, id: checkpointId,
        story: memory.story, source: memory.id } };
    copy[0].chat_metadata.sillymemory.integrity = copy[0].chat_metadata.integrity;
    const mark = { name: checkpointName(name), state: 'pending', config: options(config), createdAt: new Date().toISOString() };
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

// Names are presentation metadata, excluded from the frozen transcript digest.
export function checkpointName(value) {
    const name = String(value || '').trim();
    if (name.length > 120) fail('Checkpoint names must be at most 120 characters.');
    return name;
}
function identityMatches(metadata, story) {
    const memory = metadata?.sillymemory;
    return memory?.version === 1 && memory.story === story && /^[a-f0-9]{32}$/.test(story || '')
        && /^[a-f0-9]{32}$/.test(memory.id || '') && memory.integrity === metadata.integrity
        && Boolean(metadata.integrity) && Boolean(memory.checkpoint);
}
async function inventory(host) {
    const items = await host.list();
    if (!Array.isArray(items)) fail('Could not read the checkpoint inventory.');
    return items;
}
function unique(items, item) {
    return items.filter(x => x.chat_metadata?.sillymemory?.id === item.chat_metadata.sillymemory.id).length === 1;
}
// Always revalidate a row's identity at action time; a displayed list is not authority.
export async function checkpointRows({ host, file, story, valid = () => true }) {
    const items = await inventory(host);
    current(valid);
    const item = items.find(x => x.file_name === `${file}.jsonl`);
    if (!identityMatches(item?.chat_metadata, story) || !unique(items, item)) fail('Checkpoint identity is missing, duplicated or outside this story. Refresh the list.');
    const rows = await host.read(file);
    current(valid);
    if (JSON.stringify(metadataOf(rows)) !== JSON.stringify(item.chat_metadata)) fail('Checkpoint changed since the inventory was read. Refresh the list.');
    return rows;
}
export async function listCheckpoints({ host, client, owner, story, avatar, valid = () => true }) {
    const items = await inventory(host), result = [];
    current(valid);
    let remote; // One ownership check and branch list per story, never per checkpoint.
    for (const item of items.filter(x => identityMatches(x.chat_metadata, story))) {
        current(valid);
        const file = item.file_name.replace(/\.jsonl$/, ''), mark = item.chat_metadata.sillymemory.checkpoint;
        const row = { file, name: mark.name || file, createdAt: mark.createdAt, status: 'unverified' };
        if (!unique(items, item)) row.status = 'duplicate';
        else {
            const rows = await host.read(file);
            current(valid);
            if (JSON.stringify(metadataOf(rows)) !== JSON.stringify(item.chat_metadata)
                || !['pending', 'ready'].includes(mark.state) || mark.hash !== await checkpointDigest(rows)) row.status = 'modified';
            else if (mark.state === 'pending') row.status = 'pending';
            else if (client) {
                const entry = await chatCollection(snapshotOf(rows, avatar, file), owner);
                if (!remote) {
                    try {
                        await client.assertOwned(entry.collection, owner, undefined, entry.scope);
                        remote = { branches: new Map((await client.branches(entry.collection)).map(b => [b.name, b])) };
                    } catch (error) {
                        if (error.status === 404) remote = { branches: new Map() };
                        else remote = { unavailable: true };
                    }
                }
                const branch = remote.branches?.get(entry.branch);
                row.status = remote.unavailable ? 'unverified' : !branch ? 'missing'
                    : (branch.headSnapshot?.snapshotId || null) !== mark.snapshot ? 'remote-changed' : 'ready';
            }
        }
        result.push(row);
    }
    current(valid);
    return result.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.file.localeCompare(b.file));
}
export async function renameCheckpoint(args, name) {
    name = checkpointName(name);
    const { host, file, valid = () => true } = args;
    const job = async () => {
        const rows = await checkpointRows(args);
        if (JSON.stringify(await checked(host, file)) !== JSON.stringify(rows)) fail('Checkpoint changed while renaming. The saved file was preserved.');
        rows[0].chat_metadata.sillymemory.checkpoint.name = name;
        await saveVerified(host, file, rows, valid);
    };
    if (host.withWriteLock) await host.withWriteLock(job); else await job();
}
export async function deleteCheckpoint(args) {
    const { host, collections, owner, file, avatar, valid = () => true } = args;
    const rows = await checkpointRows(args);
    const entry = await chatCollection(snapshotOf(rows, avatar, file), owner);
    // Keep the durable native record if remote cleanup fails or is ambiguous.
    await collections.delete(entry);
    current(valid);
    const job = async () => {
        const latest = await checkpointRows(args);
        if (JSON.stringify(latest) !== JSON.stringify(rows)) fail('Checkpoint changed during deletion. Its local file was preserved.');
        await host.remove(file);
        current(valid);
        if ((await host.read(file)).length) fail('Checkpoint file deletion is not confirmed. Refresh and retry.');
    };
    if (host.withWriteLock) await host.withWriteLock(job); else await job();
    return entry;
}
