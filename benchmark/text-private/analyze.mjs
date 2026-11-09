// Offline stage-3 analysis: returned-50 and delivered (4,096-token packing) coverage
// per arm from exact source bindings, plus generation request bodies for chosen arms.
//   node analyze.mjs --dataset FILE --stage3 DIR --historical DIR --tokenizer DIR --out DIR [--requests B,C,D]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prepareCase, requestFor, sha256 } from '../longmemeval/protocol.mjs';
import { aggregate, coverage, evidence } from './metrics.mjs';

const { values: args } = parseArgs({ options: { dataset: { type: 'string' }, stage3: { type: 'string' }, historical: { type: 'string' },
    tokenizer: { type: 'string' }, out: { type: 'string' }, requests: { type: 'string', default: '' } } });
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
const rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
const require = createRequire(path.join(args.tokenizer, 'package.json'));
const encoder = require('tiktoken').get_encoding('cl100k_base');
const countTokens = text => encoder.encode(text, [], []).length;
const readJSON = async file => JSON.parse(await readFile(file));
const historicalLock = await readJSON(path.join(args.historical, 'lock.json'));
const owners = { native: (await readJSON(path.join(args.stage3, 'native/state.json'))).owner,
    private: (await readJSON(path.join(args.stage3, 'private/state.json'))).owner,
    // M: local exact KNN (knn-local.mjs), validated identical to live LambdaDB K and E.
    e5: (await readJSON(path.join(args.stage3, 'e5/state.json'))).owner, historical: historicalLock.owner };
const ARMS = { 'A-historical': 'historical', A: 'native', B: 'native', F: 'native', L: 'native', C: 'private', D: 'private', E: 'private', K: 'private', S: 'private', M: 'e5' };
const wanted = new Set(args.requests.split(',').filter(Boolean));
const perArm = Object.fromEntries(Object.keys(ARMS).map(a => [a, { returned: [], delivered: [], memoryTokens: [], selected: [], recentEvidence: 0, fallback: 0, ids: {} }]));
const requests = Object.fromEntries([...wanted].map(a => [a, {}]));
await mkdir(args.out, { recursive: true });
for (const row of rows) {
    const id = row.question_id, prepared = {};
    for (const [layout, owner] of Object.entries(owners)) prepared[layout] = await prepareCase(row, config, owner);
    const records = {
        historical: await readJSON(path.join(args.historical, 'recall', `${id}.json`)),
        native: await readJSON(path.join(args.stage3, 'native/recall', `${id}.json`)),
        private: await readJSON(path.join(args.stage3, 'private/recall', `${id}.json`)),
        e5: await readJSON(path.join(args.stage3, 'e5/recall', `${id}.json`)),
    };
    assert.equal(records.native.sourceSha256, sha256(JSON.stringify(prepared.native)));
    assert.equal(records.private.sourceSha256, sha256(JSON.stringify(prepared.private)));
    assert.equal(records.e5.sourceSha256, sha256(JSON.stringify(prepared.e5)));
    for (const [arm, layout] of Object.entries(ARMS)) {
        const p = prepared[layout], ev = evidence(row, p), out = perArm[arm];
        let ids;
        if (arm === 'A-historical') {
            ids = records.historical.response.docs.map(h => h.doc.id);
            assert.deepEqual(records.historical.packed.selectedIds, requestFor(p, ids.map(i => ev.byId.get(i)), config, countTokens).selectedIds);
        } else {
            const r = records[layout].results[arm];
            if (!r) { assert.equal(arm, 'S'); ids = []; } else { ids = r.ids; out.fallback += r.fallbackKnnOnly ? 1 : 0; }
        }
        // Text-private arms restore source text locally from the returned IDs.
        const hits = ids.map(i => { const d = ev.byId.get(i); assert(d, 'Unbound returned ID'); return d; });
        const packed = requestFor(p, hits, config, countTokens);
        out.returned.push({ id, type: row.question_type, ...coverage(ev, ids) });
        out.delivered.push({ id, type: row.question_type, ...coverage(ev, packed.selectedIds) });
        out.memoryTokens.push(packed.memoryTokens); out.selected.push(packed.selectedIds.length);
        out.recentEvidence += ev.recent.length;
        // Store message/start/end coordinates rather than owner-scoped IDs for cross-arm comparison.
        out.ids[id] = ids.map(i => { const d = ev.byId.get(i); return [d.message, d.start, d.end]; });
        if (requests[arm]) requests[arm][id] = packed.body;
    }
}
encoder.free();
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const summary = {};
for (const [arm, out] of Object.entries(perArm)) {
    summary[arm] = { returned: aggregate(out.returned), delivered: aggregate(out.delivered),
        meanMemoryTokens: mean(out.memoryTokens), meanSelectedChunks: mean(out.selected), recentAnnotatedMessages: out.recentEvidence,
        knnOnlyFallbacks: out.fallback,
        evidenceInTop10: out.returned.filter(r => r.firstEvidence !== null && r.firstEvidence <= 10).length };
}
// Paired question-level comparison of all-annotated-complete delivery against B and A-historical.
const paired = {};
for (const base of ['A-historical', 'B']) for (const arm of Object.keys(ARMS)) {
    if (arm === base) continue;
    let better = 0, worse = 0;
    perArm[arm].delivered.forEach((r, i) => {
        const b = perArm[base].delivered[i]; if (!r.annotated) return;
        const x = r.complete, y = b.complete; if (x > y) better++; else if (x < y) worse++;
    });
    paired[`${arm}-vs-${base}`] = { questionsMoreCompleteMessages: better, questionsFewerCompleteMessages: worse };
}
// Overlap of returned top-50 source coordinates with A-historical and B.
const overlap = {};
for (const base of ['A-historical', 'B']) for (const arm of Object.keys(ARMS)) {
    let sum10 = 0, sum50 = 0;
    for (const row of rows) {
        const a = perArm[arm].ids[row.question_id].map(x => x.join(':')), b = perArm[base].ids[row.question_id].map(x => x.join(':'));
        const s10 = new Set(b.slice(0, 10)), s50 = new Set(b);
        sum10 += a.slice(0, 10).filter(x => s10.has(x)).length / 10; sum50 += a.filter(x => s50.has(x)).length / 50;
    }
    overlap[`${arm}-vs-${base}`] = { overlap10: sum10 / rows.length, overlap50: sum50 / rows.length };
}
await writeFile(path.join(args.out, 'retrieval-metrics.json'), JSON.stringify({ summary, paired, overlap }, null, 2));
await writeFile(path.join(args.out, 'retrieval-per-question.json'), JSON.stringify(Object.fromEntries(Object.entries(perArm).map(([a, o]) => [a, { returned: o.returned, delivered: o.delivered, memoryTokens: o.memoryTokens }]))));
for (const [arm, bodies] of Object.entries(requests)) await writeFile(path.join(args.out, `requests-${arm}.json`), JSON.stringify(bodies));
console.log(JSON.stringify(summary, null, 1));
