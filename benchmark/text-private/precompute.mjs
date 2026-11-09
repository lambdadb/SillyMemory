// Embed every unique LongMemEval chunk text and retrieval query once, in sorted
// question order, into OUT/<provider>.f32 with OUT/<provider>-index.json
// (sha256(text) -> row). Resumable; rows are appended in index order.
//   node precompute.mjs --provider local|e5|openai --dataset FILE --out DIR [--env-file FILE]
// Local shards: --start S --end E --suffix .sN --threads T embed rows [S, E) into
// OUT/<provider><suffix>.f32; concatenate shards in row order afterwards (merge-shards.mjs).
// Diagnostics: --dtype fp32 --name e5-fp32 --questions IDS.json embeds only the texts of
// the listed questions into OUT/<name>*.f32 (a distinct name is required, so the q8
// files are never overwritten). --order length embeds texts sorted by length (less
// padding); --groups N interleaves the length order into N contiguous groups of similar
// length mix, so N equal --start/--end shards take similar time. The index records the
// row order, and every shard writes the same index. --runtime ollama embeds a local
// provider (gemma, bgem3, qwen3) through Ollama's /v1/embeddings instead of ONNX.
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile, stat } from 'node:fs/promises';
import { parseEnv, parseArgs } from 'node:util';
import path from 'node:path';
import { prepareCase, recallQuery, sha256 } from '../longmemeval/protocol.mjs';
import { LOCAL_MODELS, OLLAMA_MODELS, OPENAI_DIMENSIONS, localEmbedder, ollamaEmbedder, openaiEmbed } from './embed.mjs';

const { values: args } = parseArgs({ options: { provider: { type: 'string' }, dataset: { type: 'string' },
    out: { type: 'string' }, 'env-file': { type: 'string' }, 'max-usd': { type: 'string', default: '3' },
    start: { type: 'string', default: '0' }, end: { type: 'string' }, suffix: { type: 'string', default: '' }, threads: { type: 'string' },
    dtype: { type: 'string', default: 'q8' }, name: { type: 'string' }, questions: { type: 'string' }, order: { type: 'string', default: 'hash' }, groups: { type: 'string', default: '1' },
    runtime: { type: 'string', default: 'onnx' }, 'ollama-url': { type: 'string', default: 'http://localhost:11434/v1' }, batch: { type: 'string' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
let rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
const name = args.name ?? args.provider;
assert(name === args.provider ? args.dtype === 'q8' && !args.questions : name !== 'e5' && name !== 'local' && name !== 'openai',
    'A non-default dtype or question subset needs a distinct --name');
if (args.questions) {
    const wanted = new Set(JSON.parse(await readFile(args.questions)));
    rows = rows.filter(r => wanted.has(r.question_id)); assert.equal(rows.length, wanted.size, 'Unknown question id');
}
const queries = new Set(), texts = new Map();
for (const row of rows) {
    const p = await prepareCase(row, config, '0'.repeat(64));
    const q = recallQuery(p, config).query.bayesian[0].knn.queryText;
    queries.add(q); texts.set(sha256(q), q);
    for (const d of p.docs) texts.set(sha256(d.text), d.text);
}
let keys = [...texts.keys()];
if (args.order === 'length') {
    keys.sort((a, b) => texts.get(a).length - texts.get(b).length || (a < b ? -1 : 1));
    const groups = Number(args.groups);
    keys = Array.from({ length: groups }, (_, g) => keys.filter((_, i) => i % groups === g)).flat();
} else assert.equal(args.order, 'hash');
const provider = args.provider, local = provider !== 'openai';
const dims = local ? LOCAL_MODELS[provider].dimensions : OPENAI_DIMENSIONS;
const suffix = args.suffix, first = Number(args.start), last = args.end ? Number(args.end) : keys.length;
const data = path.join(args.out, `${name}${suffix}.f32`), indexFile = path.join(args.out, `${name}-index.json`);
const progressFile = path.join(args.out, `${name}${suffix}-progress.json`);
let done = 0;
try { done = (await stat(data)).size / (4 * dims); } catch {}
const offset0 = done;
assert(Number.isInteger(done));
const progress = done ? JSON.parse(await readFile(progressFile)) : { rows: 0, tokens: 0, milliseconds: 0, requests: 0 };
assert.equal(progress.rows, done, 'Progress record differs from vector file');
console.error(`${name}${suffix}: ${keys.length} unique texts (${queries.size} queries); rows [${first}, ${last}); resuming at +${done}`);
let embed;
const started = performance.now();
const norms = [];
if (local && args.runtime === 'ollama') embed = ollamaEmbedder({ provider, baseUrl: args['ollama-url'], norms });
else if (local) embed = await localEmbedder({ cacheDir: path.join(args.out, 'model-cache'), provider,
    threads: args.threads && Number(args.threads), dtype: args.dtype });
const loadMs = performance.now() - started;
const env = local ? null : parseEnv(await readFile(args['env-file'], 'utf8'));
const batch = args.batch ? Number(args.batch) : local ? 32 : 256, maxUsd = Number(args['max-usd']);
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
    if (progress.requests % 50 < group.length) console.error(`${name}${suffix}: ${progress.rows}/${last - first} ${(progress.milliseconds / 1000).toFixed(0)}s tokens=${progress.tokens}`);
}
if (!suffix || args.order === 'length') await writeFile(indexFile, JSON.stringify(keys));
await writeFile(progressFile, JSON.stringify({ ...progress, complete: true, loadMilliseconds: loadMs, ...(local ? args.runtime === 'ollama' ? { runtime: 'ollama', model: OLLAMA_MODELS[provider] } : { dtype: args.dtype, runtime: 'onnx' } : {}),
    ...(norms.length ? { returnedNorms: { n: norms.length, min: norms.reduce((m, x) => Math.min(m, x)), max: norms.reduce((m, x) => Math.max(m, x)) } } : {}) }));
console.error(`${name}${suffix}: complete`, progress);
