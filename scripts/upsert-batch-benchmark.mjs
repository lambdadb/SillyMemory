// Live benchmark: upsert request time per batch size. Creates one temporary owned
// collection with the production schema, uploads synthetic English chunks in the
// requested batch sizes, deletes the collection and writes a JSON report under the
// ignored artifacts directory. Sends only synthetic text; prints no credentials.
// Usage: SM_ENV_FILE=... SM_ARTIFACT_TAG=... node scripts/upsert-batch-benchmark.mjs [sizes] [docsPerSize]
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { LambdaClient } from '../src/client.js';
import { poll } from '../src/gate.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
assert(Object.values(credentials).every(Boolean), 'Missing LambdaDB credentials');
const artifactTag = process.env.SM_ARTIFACT_TAG || 'upsert-batch';
assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag));
const artifacts = path.join(root, 'artifacts', artifactTag); await mkdir(artifacts, { recursive: true });

const sizes = (process.argv[2] || '50,100,200,400').split(',').map(Number);
const perSize = Number(process.argv[3] || 400);
assert(sizes.every(n => Number.isInteger(n) && n > 0) && Number.isInteger(perSize) && perSize > 0, 'Sizes must be positive integers');
const timeoutMs = 60000; // The product uses 15000; record real durations and compare against that budget afterwards.
const client = new LambdaClient({ endpoint: credentials.endpoint, project: credentials.project }, credentials.key, { timeoutMs });
const owner = randomBytes(16).toString('hex'), scope = randomBytes(32).toString('hex');
const collection = `smbench_${randomBytes(6).toString('hex')}`;

const words = 'the lantern keeper walked along the harbor wall while gulls circled above the fishing boats and the tide pulled slowly back from the stones she remembered the letter folded in her coat pocket and the promise she had made to return before the first frost settled over the orchard the market square was already quiet when the bells rang and the baker closed his shutters against the evening wind'.split(' ');
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function chunk(i, target = 760) {
    let text = `Chunk ${i}: `;
    while (text.length < target) {
        const n = 8 + Math.floor(rand() * 12);
        const sentence = Array.from({ length: n }, () => words[Math.floor(rand() * words.length)]).join(' ');
        text += sentence[0].toUpperCase() + sentence.slice(1) + '. ';
    }
    return text.trim();
}
const base = Date.parse('2026-01-01T00:00:00Z');
const doc = (size, i) => {
    const n = i + size * 100000;
    return { id: `${owner}_${size}_${i}`, owner, scope, revision: '1', message: n, role: i % 2 ? 'assistant' : 'user',
        text: chunk(n), conversationTimestamp: new Date(base + n * 60000).toISOString(), timestampSource: 'host', conversationTimeContext: 'benchmark' };
};
const describe = e => ({ status: e?.status ?? null, code: e?.code ?? null, retryAfterMs: e?.retryAfterMs ?? null, message: e?.message?.slice(0, 120) ?? String(e) });

const report = { time: new Date().toISOString(), timeoutMs, perSize, sizes, runs: [], cleanup: false };
try {
    await client.create(collection, owner, scope);
    const probe = { ...doc(0, 0), id: `${owner}_probe`, text: 'Probe: the compass waits under the cedar.' };
    const readyStart = performance.now();
    await poll(async () => { await client.upsert(collection, [probe]); return true; }, { attempts: 60, delayMs: 1000 });
    report.readyMs = Math.round(performance.now() - readyStart);
    console.log(`collection ready after ${report.readyMs} ms`);
    for (const size of sizes) {
        const docs = Array.from({ length: perSize }, (_, i) => doc(size, i));
        const run = { size, bytesPerRequest: Buffer.byteLength(JSON.stringify(docs.slice(0, size))), requests: [] };
        report.runs.push(run);
        const total = performance.now();
        for (let i = 0; i < docs.length; i += size) {
            const batch = docs.slice(i, i + size), t = performance.now();
            try { await client.upsert(collection, batch); run.requests.push({ docs: batch.length, ms: Math.round(performance.now() - t) }); }
            catch (e) { run.requests.push({ docs: batch.length, ms: Math.round(performance.now() - t), error: describe(e) }); if (e?.status === 413) break; }
        }
        run.totalMs = Math.round(performance.now() - total);
        const ok = run.requests.filter(r => !r.error).map(r => r.ms);
        run.summary = { requests: run.requests.length, failed: run.requests.length - ok.length, minMs: Math.min(...ok), maxMs: Math.max(...ok),
            meanMs: Math.round(ok.reduce((a, b) => a + b, 0) / Math.max(1, ok.length)), docsPerSecond: ok.length ? Math.round(ok.length * size / (run.totalMs / 1000)) : 0 };
        console.log(JSON.stringify({ size, ...run.summary, bytesPerRequest: run.bytesPerRequest, errors: run.requests.filter(r => r.error).map(r => r.error) }));
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
} finally {
    try { await client.deleteOwnedCollection(collection, owner, scope); report.cleanup = true; }
    catch (e) { report.cleanup = `FAILED: ${describe(e).message}; delete collection ${collection} manually`; }
    console.log(report.cleanup === true ? 'temporary collection deleted' : report.cleanup);
    await writeFile(path.join(artifacts, 'upsert-batch-benchmark.json'), JSON.stringify(report, null, 2));
}
