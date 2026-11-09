// Embed every unique LongMemEval chunk text and retrieval query once, in sorted
// question order, into OUT/<provider>.f32 with OUT/<provider>-index.json
// (sha256(text) -> row). Resumable; rows are appended in index order.
//   node precompute.mjs --provider local|e5|openai --dataset FILE --out DIR [--env-file FILE]
// Local shards: --start S --end E --suffix .sN --threads T embed rows [S, E) into
// OUT/<provider><suffix>.f32; concatenate shards in row order afterwards (merge-shards.mjs).
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile, stat } from 'node:fs/promises';
import { parseEnv, parseArgs } from 'node:util';
import path from 'node:path';
import { prepareCase, recallQuery, sha256 } from '../longmemeval/protocol.mjs';
import { LOCAL_DIMENSIONS, OPENAI_DIMENSIONS, localEmbedder, openaiEmbed } from './embed.mjs';

const { values: args } = parseArgs({ options: { provider: { type: 'string' }, dataset: { type: 'string' },
    out: { type: 'string' }, 'env-file': { type: 'string' }, 'max-usd': { type: 'string', default: '3' },
    start: { type: 'string', default: '0' }, end: { type: 'string' }, suffix: { type: 'string', default: '' }, threads: { type: 'string' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
const rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
const queries = new Set(), texts = new Map();
for (const row of rows) {
    const p = await prepareCase(row, config, '0'.repeat(64));
    const q = recallQuery(p, config).query.bayesian[0].knn.queryText;
    queries.add(q); texts.set(sha256(q), q);
    for (const d of p.docs) texts.set(sha256(d.text), d.text);
}
const keys = [...texts.keys()];
const provider = args.provider, local = provider !== 'openai';
const dims = local ? LOCAL_DIMENSIONS : OPENAI_DIMENSIONS;
const suffix = args.suffix, first = Number(args.start), last = args.end ? Number(args.end) : keys.length;
const data = path.join(args.out, `${provider}${suffix}.f32`), indexFile = path.join(args.out, `${provider}-index.json`);
const progressFile = path.join(args.out, `${provider}${suffix}-progress.json`);
let done = 0;
try { done = (await stat(data)).size / (4 * dims); } catch {}
const offset0 = done;
assert(Number.isInteger(done));
const progress = done ? JSON.parse(await readFile(progressFile)) : { rows: 0, tokens: 0, milliseconds: 0, requests: 0 };
assert.equal(progress.rows, done, 'Progress record differs from vector file');
console.error(`${provider}${suffix}: ${keys.length} unique texts (${queries.size} queries); rows [${first}, ${last}); resuming at +${done}`);
let embed;
const started = performance.now();
if (local) embed = await localEmbedder({ cacheDir: path.join(args.out, 'model-cache'), provider, threads: args.threads && Number(args.threads) });
const loadMs = performance.now() - started;
const env = local ? null : parseEnv(await readFile(args['env-file'], 'utf8'));
const batch = local ? 32 : 256, maxUsd = Number(args['max-usd']);
for (let i = first + offset0; i < last;) {
    const group = [];
    for (let j = 0; j < (local ? 1 : 4) && i < last; j++, i += batch) group.push(keys.slice(i, Math.min(i + batch, last)));
    const t = performance.now();
    const results = await Promise.all(group.map(async ks => {
        const input = ks.map(k => texts.get(k));
        if (local) {
            // Queries take the model's retrieval instruction; passages do not.
            const isQuery = ks.map(k => queries.has(texts.get(k)));
            const out = new Array(ks.length);
            const qi = isQuery.flatMap((q, n) => q ? [n] : []), di = isQuery.flatMap((q, n) => q ? [] : [n]);
            if (qi.length) (await embed(qi.map(n => input[n]), { query: true })).forEach((v, n) => { out[qi[n]] = v; });
            if (di.length) (await embed(di.map(n => input[n]))).forEach((v, n) => { out[di[n]] = v; });
            return { vectors: out, tokens: 0 };
        }
        // Empty input is rejected by OpenAI; LongMemEval chunks are never empty after trimming.
        for (let attempt = 1; ; attempt++) {
            try { return await openaiEmbed(input, env.LLM_API_KEY); }
            catch (error) { if (attempt >= 3) throw error; await new Promise(r => setTimeout(r, 5000 * attempt)); }
        }
    }));
    const buffer = Buffer.alloc(results.reduce((n, r) => n + r.vectors.length, 0) * dims * 4);
    let offset = 0;
    for (const r of results) for (const v of r.vectors) { for (const x of v) { buffer.writeFloatLE(x, offset); offset += 4; } }
    await appendFile(data, buffer);
    progress.rows += results.reduce((n, r) => n + r.vectors.length, 0);
    progress.tokens += results.reduce((n, r) => n + r.tokens, 0);
    progress.requests += results.length; progress.milliseconds += performance.now() - t;
    await writeFile(progressFile, JSON.stringify(progress));
    if (!local) assert(progress.tokens * 0.02 / 1e6 <= maxUsd, 'Embedding spend cap reached');
    if (progress.requests % 50 < group.length) console.error(`${provider}${suffix}: ${progress.rows}/${last - first} ${(progress.milliseconds / 1000).toFixed(0)}s tokens=${progress.tokens}`);
}
if (!suffix) await writeFile(indexFile, JSON.stringify(keys));
await writeFile(progressFile, JSON.stringify({ ...progress, complete: true, loadMilliseconds: loadMs }));
console.error(`${provider}: complete`, progress);
