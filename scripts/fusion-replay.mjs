// Development replay of a trusted synthetic live report, never runtime ranking.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { selectMemory, interleaveHits, memoryMessages } from '../src/memory.js';
const [input, output] = process.argv.slice(2);
assert(input && output && process.argv.length === 4, 'Usage: ST_SOURCE=/pinned/host node scripts/fusion-replay.mjs raw-live-report.json new-output.json');
assert(process.env.ST_SOURCE, 'Pinned host is required for its tokenizer package');
const require = createRequire(path.join(process.env.ST_SOURCE, 'package.json'));
const tokenizer = require('tiktoken').encoding_for_model('gpt-4o');
// Pinned host /openai/count adds 3 per message and 3 padding to {content: text}.
const count = text => text ? tokenizer.encode(text).length + 6 : 0;
const bytes = await readFile(input), report = JSON.parse(bytes);
assert(report.passed && report.cleanupComplete && report.sourceUnchanged);
assert.equal(report.sillyTavern, '06bde939fb1e9c4c8d8641d810f0a916b5bce127');
assert.equal(report.assistantTopic?.rows.length, 38);
const results = {};
try {
    for (const mode of ['baseline', 'sum-0', 'sum-60', 'max-context-0', 'max-context-density', 'sum-density']) {
        let selectedCount = 0; const failures = [], rows = [];
        for (const row of report.assistantTopic.rows) {
            const queries = row.variants[mode === 'baseline' ? 'baseline' : 'user-first'].queries;
            const lists = queries.map(query => row.searches.find(s => s.query === query).hits);
            const docs = [...new Map(row.searches.flatMap(s => s.hits).map(hit => [hit.id, hit])).values()];
            let ranked;
            if (mode === 'baseline') ranked = interleaveHits(lists);
            else {
                const scores = new Map();
                lists.forEach((list, i) => list.forEach((hit, j) => {
                    if (!scores.has(hit.id)) scores.set(hit.id, { hit, ranks: Array(lists.length).fill(0), tie: scores.size });
                    scores.get(hit.id).ranks[i] = 1 / ((mode === 'sum-60' ? 60 : 0) + j + 1);
                }));
                const score = s => (mode.startsWith('max-context') ? s.ranks[0] + Math.max(0, ...s.ranks.slice(1)) : s.ranks.reduce((a, b) => a + b, 0)) / (mode.endsWith('density') ? count(memoryMessages([s.hit])[0].mes) : 1);
                ranked = [...scores.values()].sort((a, b) => score(b) - score(a) || a.tie - b.tie).map(s => s.hit);
            }
            const selected = await selectMemory(ranked, docs, row.budget, count);
            if (mode === 'baseline') {
                assert.equal(selected.tokens, row.variants.baseline.tokens, 'Host token count mismatch');
                assert.deepEqual(selected.passages.map(d => d.message), row.variants.baseline.selected, 'Baseline selection mismatch');
            }
            for (const evidence of row.variants.baseline.evidence) {
                if (selected.passages.some(d => d.message === evidence.message)) selectedCount++;
                else failures.push(row.case);
            }
            rows.push({ case: row.case, selected: selected.passages.map(d => d.message), tokens: selected.tokens });
        }
        results[mode] = { selectedCount, failures, rows };
    }
} finally { tokenizer.free(); }
await writeFile(output, JSON.stringify({ kind: 'development replay, no new service calls or held-out evidence', sourceReportSha256: createHash('sha256').update(bytes).digest('hex'), results }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([name, r]) => [name, { selected: r.selectedCount, failures: r.failures }]))));
