// Retrieval-only screening of a local dense model (no network): exact cosine top 50 over
// each question's searched range (knn-local.mjs ranking, 8-significant-digit rounding),
// returned/delivered coverage at the 4,096-token budget, and the stored per-question
// results of other arms on the same questions for context.
//   node screen.mjs --dataset FILE --vectors DIR --name gemma-fp32 --dims 768 [--questions IDS.json] \
//     --stage3 DIR --analysis DIR --tokenizer DIR --out FILE [--provider gemma] [--cosine-against DIR/NAME]
// --provider also reports prefixed token lengths with the model's tokenizer (truncation check).
// --cosine-against compares this store with another one (same dims) on their shared texts.
// --compare-arm K checks the ranking against that arm's stored live results (layout private).
// --requests-out FILE writes the frozen generation request bodies (as analyze.mjs does) for score.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prepareCase, recallQuery, requestFor, sha256 } from '../longmemeval/protocol.mjs';
import { LOCAL_MODELS } from './embed.mjs';
import { aggregate, coverage, evidence } from './metrics.mjs';

const { values: args } = parseArgs({ options: { dataset: { type: 'string' }, vectors: { type: 'string' }, name: { type: 'string' },
    dims: { type: 'string' }, questions: { type: 'string' }, stage3: { type: 'string' }, analysis: { type: 'string' },
    tokenizer: { type: 'string' }, out: { type: 'string' }, arms: { type: 'string', default: 'K,E,M,B' }, provider: { type: 'string' },
    'cosine-against': { type: 'string' }, 'compare-arm': { type: 'string' }, 'requests-out': { type: 'string' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
let rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
const wanted = args.questions ? new Set(JSON.parse(await readFile(args.questions))) : new Set(rows.map(r => r.question_id));
rows = rows.filter(r => wanted.has(r.question_id)); assert.equal(rows.length, wanted.size);
const encoder = createRequire(path.join(args.tokenizer, 'package.json'))('tiktoken').get_encoding('cl100k_base');
const countTokens = text => encoder.encode(text, [], []).length;
const dims = Number(args.dims);

const handles = [];
async function store(dir, name) {
    const keys = JSON.parse(await readFile(path.join(dir, `${name}-index.json`)));
    const index = new Map(keys.map((k, i) => [k, i]));
    const fd = await open(path.join(dir, `${name}.f32`)); handles.push(fd);
    assert.equal((await fd.stat()).size, keys.length * dims * 4, `${name}: size differs from index`);
    const read = async text => {
        const row = index.get(sha256(text)); assert(row !== undefined, `${name}: missing text`);
        const b = Buffer.alloc(dims * 4); await fd.read(b, 0, b.length, row * b.length);
        return Float64Array.from({ length: dims }, (_, i) => Number(b.readFloatLE(i * 4).toPrecision(8)));
    };
    return { read, keys, index };
}
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const stats = values => { const s = [...values].sort((a, b) => a - b); const at = f => s[Math.min(s.length - 1, Math.floor(s.length * f))];
    return { n: s.length, min: s[0], p1: at(0.01), p5: at(0.05), median: at(0.5), max: s.at(-1) }; };
const vectors = await store(args.vectors, args.name);
const owner = JSON.parse(await readFile(path.join(args.stage3, 'private/state.json'))).owner;

const out = { returned: [], delivered: [] }, perQuestion = [], requests = {}, compare = { overlap10: 0, overlap50: 0, identical50: 0 };
let searchMs = 0;
for (const row of rows) {
    const p = await prepareCase(row, config, owner), ev = evidence(row, p);
    const q = await vectors.read(recallQuery(p, config).query.bayesian[0].knn.queryText), scored = [];
    const t = performance.now();
    for (const d of p.docs) scored.push([d.id, cosine(q, await vectors.read(d.text))]);
    scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    searchMs += performance.now() - t;
    const ids = scored.slice(0, config.retrieval.final).map(x => x[0]);
    const packed = requestFor(p, ids.map(i => ev.byId.get(i)), config, countTokens);
    const r = coverage(ev, ids), d = coverage(ev, packed.selectedIds);
    requests[row.question_id] = packed.body;
    out.returned.push({ id: row.question_id, type: row.question_type, ...r }); out.delivered.push({ id: row.question_id, type: row.question_type, ...d });
    perQuestion.push({ id: row.question_id, type: row.question_type, returnedComplete: r.complete, deliveredComplete: d.complete, deliveredPartial: d.partial, deliveredAllComplete: d.allComplete,
        annotated: r.annotated, firstEvidence: r.firstEvidence, sessionHit: r.sessionHit, ids });
    if (args['compare-arm']) {
        const live = JSON.parse(await readFile(path.join(args.stage3, 'private/recall', `${row.question_id}.json`))).results[args['compare-arm']].ids;
        const s10 = new Set(live.slice(0, 10)), s50 = new Set(live);
        compare.overlap10 += ids.slice(0, 10).filter(x => s10.has(x)).length / 10 / rows.length;
        compare.overlap50 += ids.filter(x => s50.has(x)).length / 50 / rows.length; compare.identical50 += ids.every((x, i) => x === live[i]);
    }
}

// Stored per-question results of other arms (analyze.mjs), restricted to the same questions, and paired delivered-complete counts.
const stored = JSON.parse(await readFile(path.join(args.analysis, 'retrieval-per-question.json')));
const context = {}, paired = {};
const mine = new Map(perQuestion.map(q => [q.id, q.deliveredComplete]));
for (const arm of args.arms.split(',')) {
    const delivered = stored[arm].delivered.filter(r => wanted.has(r.id));
    context[arm] = { returned: aggregate(stored[arm].returned.filter(r => wanted.has(r.id))), delivered: aggregate(delivered) };
    paired[arm] = { modelMoreComplete: delivered.filter(r => mine.get(r.id) > r.complete).length, modelFewerComplete: delivered.filter(r => mine.get(r.id) < r.complete).length };
}

const result = { name: args.name, dims, questions: rows.length, searchMilliseconds: Math.round(searchMs),
    returned: aggregate(out.returned), delivered: aggregate(out.delivered), storedArmsOnQuestions: context, pairedDelivered: paired,
    ...(args['compare-arm'] ? { compareLive: { arm: args['compare-arm'], ...compare } } : {}) };

if (args['cosine-against']) {
    const other = await store(path.dirname(args['cosine-against']), path.basename(args['cosine-against']));
    const shared = other.keys.filter(k => vectors.index.has(k)), cos = [];
    const byKey = new Map(); for (const row of rows) { const p = await prepareCase(row, config, owner);
        byKey.set(sha256(recallQuery(p, config).query.bayesian[0].knn.queryText), recallQuery(p, config).query.bayesian[0].knn.queryText);
        for (const d of p.docs) byKey.set(sha256(d.text), d.text); }
    for (const k of shared) if (byKey.has(k)) cos.push(cosine(await vectors.read(byKey.get(k)), await other.read(byKey.get(k))));
    result.cosineAgainst = { store: args['cosine-against'], ...stats(cos) };
}
if (args.provider) {
    const spec = LOCAL_MODELS[args.provider];
    const { AutoTokenizer, env } = await import('@huggingface/transformers');
    env.cacheDir = path.join(args.vectors, 'model-cache'); env.allowRemoteModels = false;
    const tokenizer = await AutoTokenizer.from_pretrained(spec.model), lengths = { passages: [], queries: [] }, seen = new Set();
    for (const row of rows) {
        const p = await prepareCase(row, config, owner);
        lengths.queries.push(tokenizer.encode(spec.queryPrefix + recallQuery(p, config).query.bayesian[0].knn.queryText).length);
        for (const d of p.docs) { const k = sha256(d.text); if (seen.has(k)) continue; seen.add(k); lengths.passages.push(tokenizer.encode(spec.passagePrefix + d.text).length); }
    }
    result.tokenLengths = Object.fromEntries(Object.entries(lengths).map(([k, v]) => [k, { ...stats(v), overMax: v.filter(n => n > spec.maxLength).length, maxLength: spec.maxLength }]));
}
encoder.free();
for (const fd of handles) await fd.close();
await writeFile(args.out, JSON.stringify({ ...result, perQuestion }, null, 2));
if (args['requests-out']) await writeFile(args['requests-out'], JSON.stringify(requests));
console.log(JSON.stringify(result, null, 1));
