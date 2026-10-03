// Bounded managed-embedding API contract; no generation model or personal data.
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { LambdaClient } from '../src/client.js';
import { poll } from '../src/gate.js';
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || '.env.local', 'utf8'));
const client = new LambdaClient({ endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME }, env.LAMBDADB_PROJECT_API_KEY);
const owner = randomUUID().replaceAll('-', ''), scope = 'a'.repeat(64), collection = `smstory_${owner}`;
const directory = 'artifacts/versioning-live'; await mkdir(directory, { recursive: true });
const pending = `${directory}/pending.json`;
await writeFile(pending, JSON.stringify({ owner, scope, collection }), { flag: 'wx' });
const report = { evidence: 'Live LambdaDB managed embeddings via Node HTTPS; not browser CORS or model generation', checks: [], cleanup: false, passed: false, timings: {}, sourceSha256: {} };
for (const file of ['src/client.js', 'scripts/versioning-live.mjs']) report.sourceSha256[file] = createHash('sha256').update(await readFile(file)).digest('hex');
const check = (name, ok) => { assert(ok, name); report.checks.push(name); console.log(`PASS ${name}`); };
const wait = check => poll(check, { attempts: 90, delayMs: 1000 });
let started = performance.now();
try {
    await client.create(collection, owner, scope);
    await client.createBranch(collection, 'chat_parent');
    const doc = { id: 'synthetic-fact', owner, scope, revision: '1', text: 'Mira placed the blue compass beneath the cedar tree.' };
    await client.upsert(collection, [doc], undefined, 'chat_parent');
    await wait(async () => (await client.fetchDocs(collection, [doc.id], 'chat_parent', false)).some(d => d.text === doc.text));
    report.timings.committedMs = performance.now() - started;
    const head = (await client.branches(collection)).find(b => b.name === 'chat_parent').headSnapshot;
    check('Managed parent document is committed before forking', Boolean(head?.snapshotId));
    started = performance.now();
    await client.createBranch(collection, 'chat_child', 'chat_parent');
    report.timings.forkMs = performance.now() - started;
    const child = (await client.branches(collection)).find(b => b.name === 'chat_child');
    check('Fork metadata identifies the committed parent snapshot', child.parentSnapshot?.snapshotId === head.snapshotId && child.parentBranch?.name === 'chat_parent');
    check('Child inherits the full document without any child upsert', (await client.listDocs(collection, 'chat_child')).some(d => d.id === doc.id && d.text === doc.text));
    await wait(async () => (await client.search(collection, owner, scope, 'Where is the blue compass?', undefined, 'chat_child')).some(d => d.id === doc.id));
    check('Inherited managed vector supports branch-scoped queryText', true);
    const changed = { ...doc, revision: '2', text: 'Mira placed the blue compass in the silver chest.' };
    await client.upsert(collection, [changed], undefined, 'chat_child');
    await wait(async () => (await client.fetchDocs(collection, [doc.id], 'chat_child')).some(d => d.text === changed.text));
    check('Child edit preserves the parent document', (await client.fetchDocs(collection, [doc.id], 'chat_parent')).some(d => d.text === doc.text));
    await client.deleteIds(collection, [doc.id], undefined, 'chat_child');
    await wait(async () => !(await client.fetchDocs(collection, [doc.id], 'chat_child')).length);
    check('Child deletion preserves parent retrieval', (await client.search(collection, owner, scope, 'blue compass', undefined, 'chat_parent')).some(d => d.text === doc.text));
    await client.deleteBranch(collection, 'chat_child');
    check('Deleting one branch preserves its parent', (await client.branches(collection)).some(b => b.name === 'chat_parent'));
    report.passed = true;
} catch (error) {
    report.failure = { name: error.name, status: error.status || 0, code: error.code || '' };
    process.exitCode = 1;
} finally {
    try { await client.deleteOwnedCollection(collection, owner, scope); report.cleanup = true; await rm(pending); }
    catch (error) { report.cleanupFailure = { name: error.name, status: error.status || 0 }; process.exitCode = 1; }
    client.forget();
    await writeFile(`${directory}/report-${Date.now()}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, cleanup: report.cleanup, checks: report.checks.length, timings: report.timings, failure: report.failure }));
}
