// Bounded live check of the text-analyzer setting against a real LambdaDB project.
// Creates at most two owned, empty story collections (no documents, embeddings or
// searches), checks the reported analyzers on the create and read paths, the
// mismatch notice and the rebuild recreation, then deletes them and confirms absence.
// Pending identities are persisted before each create so an interrupted run can be
// cleaned up by running the script again. Credentials come from .env.local or SM_ENV_FILE.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LambdaClient, collectionAnalyzers } = await import(path.join(root, 'src/client.js'));
const { ChatCollections } = await import(path.join(root, 'src/chat-collections.js'));
const { options } = await import(path.join(root, 'src/memory.js'));
const { analyzerNotice } = await import(path.join(root, 'src/status.js'));

const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const target = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME };
const client = new LambdaClient(target, env.LAMBDADB_PROJECT_API_KEY);
const pendingPath = path.join(root, 'artifacts', 'analyzers-live-pending.json');
await mkdir(path.dirname(pendingPath), { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sets = a => [...a].sort().join(',');
const hex = () => randomBytes(16).toString('hex');

// Confirmed absence, then the entry can be forgotten.
async function remove(owner, entry) {
    try { await client.deleteOwnedCollection(entry.collection, owner, entry.scope); } catch (e) { console.log(`cleanup ${entry.collection}: ${e.message}`); }
    try { await client.get(entry.collection); return false; } catch (e) { return e.status === 404; }
}

// Retry cleanup left by an interrupted earlier run against the same project.
let pending = { ...target, owner: hex(), entries: [] };
try {
    const earlier = JSON.parse(await readFile(pendingPath, 'utf8'));
    if (earlier.entries.length) {
        if (earlier.endpoint !== target.endpoint || earlier.project !== target.project) {
            // Never overwrite another target's unresolved cleanup record.
            console.log(`${pendingPath} holds ${earlier.entries.length} pending collection(s) for a different endpoint/project. Rerun with that target's credentials to clean them up first.`);
            client.forget(); process.exit(1);
        }
        console.log(`Retrying cleanup of ${earlier.entries.length} pending collection(s) from an earlier run…`);
        for (const entry of earlier.entries) check(`earlier run: ${entry.collection.slice(0, 16)}… deleted`, await remove(earlier.owner, entry));
        if (results.some(r => !r.ok)) { console.log('Pending cleanup still incomplete; not creating new collections.'); client.forget(); process.exit(1); }
    }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const persist = () => writeFile(pendingPath, JSON.stringify(pending, null, 2));
const remembered = [];
const collections = new ChatCollections(client, pending.owner, entry => { remembered.push(entry); }, () => {});
// ensure() calls remember() before the create request; persist the intent first.
const ensure = async (snapshot, config) => {
    const { chatCollection } = await import(path.join(root, 'src/chat-collections.js'));
    const intent = await chatCollection(snapshot, pending.owner);
    if (!pending.entries.some(e => e.collection === intent.collection)) { pending.entries.push({ collection: intent.collection, scope: intent.scope }); await persist(); }
    return collections.ensure(snapshot, undefined, config);
};
const snapshot = () => ({ memory: { story: hex() }, chat: hex(), character: 'analyzers-live.png' });

try {
    // 1. A new story collection reports the configured analyzers from the create (201) path and from a read.
    const bilingual = options({ analyzers: ['english', 'korean'] });
    const entryA = await ensure(snapshot(), bilingual);
    const getA = await client.get(entryA.collection);
    check('new collection reports english+korean from the create path', sets(entryA.analyzers) === 'english,korean');
    check('read path reports english+korean', sets(collectionAnalyzers(getA)) === 'english,korean', `server reports ${JSON.stringify(collectionAnalyzers(getA))}`);
    check('no notice when the setting matches', analyzerNotice(entryA.analyzers, bilingual.analyzers) === '');

    // 2. A story created with english only reports a mismatch once the setting changes; rebuild recreates it.
    const englishOnly = options({ analyzers: ['english'] });
    const storyB = snapshot();
    const entryB1 = await ensure(storyB, englishOnly);
    check('second story created with english only', sets(entryB1.analyzers) === 'english');
    const entryB2 = await ensure(storyB, bilingual);
    const notice = analyzerNotice(entryB2.analyzers, bilingual.analyzers);
    check('existing collection keeps english and the notice appears', sets(entryB2.analyzers) === 'english' && notice.includes('indexed with: english') && notice.includes('english, korean'), notice);
    await client.deleteOwnedCollection(entryB2.collection, pending.owner, entryB2.scope);
    const entryB3 = await ensure(storyB, bilingual);
    check('rebuild recreates the story collection with english+korean', entryB3.collection === entryB2.collection && sets(entryB3.analyzers) === 'english,korean' && analyzerNotice(entryB3.analyzers, bilingual.analyzers) === '');
} finally {
    for (const entry of [...pending.entries]) {
        const gone = await remove(pending.owner, entry);
        check(`cleanup: ${entry.collection.slice(0, 16)}… deleted`, gone);
        if (gone) { pending.entries = pending.entries.filter(e => e.collection !== entry.collection); await persist(); }
    }
    if (!pending.entries.length) await rm(pendingPath, { force: true });
    else console.log(`Cleanup incomplete; ${pendingPath} keeps the pending identities. Run the script again to retry.`);
    client.forget();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
