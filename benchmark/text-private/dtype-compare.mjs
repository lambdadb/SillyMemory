// q8 versus fp32 diagnostic for a local model on a question subset (retrieval only, no
// network). Compares per-text cosine, exact-KNN top-50 overlap and returned/delivered
// coverage of fp32 vectors (precompute.mjs --dtype fp32 --name NAME --questions IDS)
// against the q8 vectors, and reports the stored per-question results of other arms on
// the same subset for context.
//   node dtype-compare.mjs --dataset FILE --vectors DIR --fp32 DIR --name e5-fp32 --questions IDS.json \
//     --stage3 DIR --analysis DIR --tokenizer DIR --out FILE
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prepareCase, recallQuery, requestFor, sha256 } from '../longmemeval/protocol.mjs';
import { LOCAL_DIMENSIONS as dims, LOCAL_MODELS } from './embed.mjs';
import { aggregate, coverage, evidence } from './metrics.mjs';

const { values: args } = parseArgs({ options: { dataset: { type: 'string' }, vectors: { type: 'string' }, fp32: { type: 'string' },
    name: { type: 'string', default: 'e5-fp32' }, questions: { type: 'string' }, stage3: { type: 'string' }, analysis: { type: 'string' },
    tokenizer: { type: 'string' }, out: { type: 'string' }, arms: { type: 'string', default: 'M,E,K,B' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
const wanted = new Set(JSON.parse(await readFile(args.questions)));
const rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1).filter(r => wanted.has(r.question_id));
assert.equal(rows.length, wanted.size);
const encoder = createRequire(path.join(args.tokenizer, 'package.json'))('tiktoken').get_encoding('cl100k_base');
const countTokens = text => encoder.encode(text, [], []).length;

const handles = [];
async function store(dir, name) {
    const index = new Map(JSON.parse(await readFile(path.join(dir, `${name}-index.json`))).map((k, i) => [k, i]));
    const fd = await open(path.join(dir, `${name}.f32`)); handles.push(fd);
    return async text => {
        const row = index.get(sha256(text)); assert(row !== undefined, `${name}: missing text`);
        const b = Buffer.alloc(dims * 4); await fd.read(b, 0, b.length, row * b.length);
        // Same 8-significant-digit rounding as the uploaded vectors (knn-local.mjs).
        return Float64Array.from({ length: dims }, (_, i) => Number(b.readFloatLE(i * 4).toPrecision(8)));
    };
}
const q8 = await store(args.vectors, 'e5'), fp32 = await store(args.fp32, args.name);
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const owner = JSON.parse(await readFile(path.join(args.stage3, 'e5/state.json'))).owner;

const chunkCos = new Map(), queryCos = [], out = { q8: { returned: [], delivered: [] }, fp32: { returned: [], delivered: [] } };
const overlap = { top10: 0, top50: 0, min50: 1, identical50: 0, firstEvidenceEqual: 0 }, perQuestion = [];
let q8MatchesStored = 0;
for (const row of rows) {
    const p = await prepareCase(row, config, owner), ev = evidence(row, p);
    const queryText = recallQuery(p, config).query.bayesian[0].knn.queryText;
    const ranked = {};
    for (const [label, vector] of [['q8', q8], ['fp32', fp32]]) {
        const q = await vector(queryText), scored = [];
        for (const d of p.docs) scored.push([d.id, cosine(q, await vector(d.text))]);
        scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
        ranked[label] = scored.slice(0, config.retrieval.final).map(x => x[0]);
    }
    queryCos.push(cosine(await q8(queryText), await fp32(queryText)));
    for (const d of p.docs) { const k = sha256(d.text); if (!chunkCos.has(k)) chunkCos.set(k, cosine(await q8(d.text), await fp32(d.text))); }
    const stored = JSON.parse(await readFile(path.join(args.stage3, 'e5/recall', `${row.question_id}.json`))).results.M.ids;
    q8MatchesStored += ranked.q8.every((x, i) => x === stored[i]);
    const record = { id: row.question_id, type: row.question_type };
    for (const label of ['q8', 'fp32']) {
        const ids = ranked[label], packed = requestFor(p, ids.map(i => ev.byId.get(i)), config, countTokens);
        const r = coverage(ev, ids), d = coverage(ev, packed.selectedIds);
        out[label].returned.push({ id: row.question_id, ...r }); out[label].delivered.push({ id: row.question_id, ...d });
        record[label] = { returnedComplete: r.complete, deliveredComplete: d.complete, firstEvidence: r.firstEvidence };
    }
    const s10 = new Set(ranked.q8.slice(0, 10)), s50 = new Set(ranked.q8);
    const o50 = ranked.fp32.filter(x => s50.has(x)).length / 50;
    overlap.top10 += ranked.fp32.slice(0, 10).filter(x => s10.has(x)).length / 10; overlap.top50 += o50;
    overlap.min50 = Math.min(overlap.min50, o50); overlap.identical50 += ranked.fp32.every((x, i) => x === ranked.q8[i]);
    overlap.firstEvidenceEqual += record.q8.firstEvidence === record.fp32.firstEvidence;
    perQuestion.push({ ...record, overlap50: o50 });
}
encoder.free();
for (const fd of handles) await fd.close();
overlap.top10 /= rows.length; overlap.top50 /= rows.length;
const stats = values => { const s = [...values].sort((a, b) => a - b); const at = f => s[Math.min(s.length - 1, Math.floor(s.length * f))];
    return { n: s.length, min: s[0], p1: at(0.01), p5: at(0.05), median: at(0.5), max: s.at(-1) }; };
const paired = { fp32MoreComplete: 0, fp32FewerComplete: 0 };
for (const q of perQuestion) { const a = q.fp32.deliveredComplete, b = q.q8.deliveredComplete; if (a > b) paired.fp32MoreComplete++; else if (a < b) paired.fp32FewerComplete++; }

// Stored per-question results of other arms (analyze.mjs) restricted to the same subset.
const stored = JSON.parse(await readFile(path.join(args.analysis, 'retrieval-per-question.json')));
const context = {};
for (const arm of args.arms.split(',')) context[arm] = { returned: aggregate(stored[arm].returned.filter(r => wanted.has(r.id))),
    delivered: aggregate(stored[arm].delivered.filter(r => wanted.has(r.id))) };

// Inputs over the model's 512-token limit are truncated by the tokenizer (model_max_length).
const { AutoTokenizer, env } = await import('@huggingface/transformers');
env.cacheDir = path.join(args.vectors, 'model-cache'); env.allowRemoteModels = false;
const spec = LOCAL_MODELS.e5, tokenizer = await AutoTokenizer.from_pretrained(spec.model);
const lengths = { passages: [], queries: [] }, seen = new Set();
for (const row of rows) {
    const p = await prepareCase(row, config, owner);
    lengths.queries.push(tokenizer.encode(spec.queryPrefix + recallQuery(p, config).query.bayesian[0].knn.queryText).length);
    for (const d of p.docs) { const k = sha256(d.text); if (seen.has(k)) continue; seen.add(k); lengths.passages.push(tokenizer.encode(spec.passagePrefix + d.text).length); }
}
const truncation = Object.fromEntries(Object.entries(lengths).map(([k, v]) => [k, { ...stats(v), over512: v.filter(n => n > 512).length }]));

const result = { questions: rows.length, q8MatchesStoredM: q8MatchesStored,
    cosine: { chunks: stats(chunkCos.values()), queries: stats(queryCos) }, overlapFp32VsQ8: overlap, pairedDelivered: paired,
    q8: { returned: aggregate(out.q8.returned), delivered: aggregate(out.q8.delivered) },
    fp32: { returned: aggregate(out.fp32.returned), delivered: aggregate(out.fp32.delivered) }, storedArmsOnSubset: context, truncation };
await writeFile(args.out, JSON.stringify({ ...result, perQuestion }, null, 2));
console.log(JSON.stringify(result, null, 1));
