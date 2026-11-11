// Exact local cosine top-50 over exactly the searched range (one question's indexed
// documents, message < boundary), from the precomputed vectors with the same
// 8-significant-digit rounding uploaded by run.mjs. Dense-only arms only.
//   validate: node knn-local.mjs --provider openai --compare-arm K --compare-layout private ...
//   produce:  node knn-local.mjs --provider e5 --arm M --layout e5 ...   (writes recall records)
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prepareCase, recallQuery, sha256 } from '../longmemeval/protocol.mjs';
import { LOCAL_DIMENSIONS, OPENAI_DIMENSIONS } from './embed.mjs';
import { coverage, evidence } from './metrics.mjs';

const { values: args } = parseArgs({ options: { provider: { type: 'string' }, dataset: { type: 'string' }, vectors: { type: 'string' },
    stage3: { type: 'string' }, 'compare-arm': { type: 'string' }, 'compare-layout': { type: 'string' }, arm: { type: 'string' }, layout: { type: 'string' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
const rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
const dims = args.provider === 'openai' ? OPENAI_DIMENSIONS : LOCAL_DIMENSIONS;
const index = new Map(JSON.parse(await readFile(path.join(args.vectors, `${args.provider}-index.json`))).map((k, i) => [k, i]));
const fd = await open(path.join(args.vectors, `${args.provider}.f32`));
const vector = async text => {
    const row = index.get(sha256(text)); assert(row !== undefined);
    const b = Buffer.alloc(dims * 4); await fd.read(b, 0, b.length, row * b.length);
    return Float64Array.from({ length: dims }, (_, i) => Number(b.readFloatLE(i * 4).toPrecision(8)));
};
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const compare = Boolean(args['compare-arm']);
const layout = compare ? args['compare-layout'] : args.layout;
const root = path.join(args.stage3, layout);
let owner;
if (compare) owner = JSON.parse(await readFile(path.join(root, 'state.json'))).owner;
else {
    owner = randomBytes(32).toString('hex'); await mkdir(path.join(root, 'recall'), { recursive: true });
    await writeFile(path.join(root, 'state.json'), JSON.stringify({ layout, owner, localExactKnn: true, provider: args.provider, owned: {}, operations: 0 }));
}
const stats = { questions: 0, overlap10: 0, overlap50: 0, identicalOrder50: 0, firstEvidenceEqual: 0, sessionHitEqual: 0, minOverlap50: 1 };
let ms = 0;
for (const row of rows) {
    const p = await prepareCase(row, config, owner);
    const started = performance.now();
    const q = await vector(recallQuery(p, config).query.bayesian[0].knn.queryText);
    const scored = [];
    for (const d of p.docs) scored.push([d.id, cosine(q, await vector(d.text))]);
    scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const ids = scored.slice(0, config.retrieval.final).map(x => x[0]);
    ms += performance.now() - started;
    if (compare) {
        const live = JSON.parse(await readFile(path.join(root, 'recall', `${row.question_id}.json`))).results[args['compare-arm']].ids;
        const s10 = new Set(live.slice(0, 10)), s50 = new Set(live);
        const o50 = ids.filter(x => s50.has(x)).length / 50;
        stats.questions++; stats.overlap10 += ids.slice(0, 10).filter(x => s10.has(x)).length / 10; stats.overlap50 += o50;
        stats.minOverlap50 = Math.min(stats.minOverlap50, o50); stats.identicalOrder50 += ids.every((x, i) => x === live[i]);
        const ev = evidence(row, p), a = coverage(ev, ids), b = coverage(ev, live);
        stats.firstEvidenceEqual += a.firstEvidence === b.firstEvidence; stats.sessionHitEqual += a.sessionHit === b.sessionHit;
    } else {
        await writeFile(path.join(root, 'recall', `${row.question_id}.json`), JSON.stringify({ id: row.question_id, localExactKnn: true,
            sourceSha256: sha256(JSON.stringify(p)), documents: p.docs.length,
            results: { [args.arm]: { ids, scores: scored.slice(0, ids.length).map(x => x[1]), fallbackKnnOnly: false } } }));
        stats.questions++;
    }
}
if (compare) { stats.overlap10 /= stats.questions; stats.overlap50 /= stats.questions; }
console.log(JSON.stringify({ ...stats, provider: args.provider, mode: compare ? `compare-${args['compare-arm']}` : `produce-${args.arm}`, searchMilliseconds: ms }));
