// Post-result diagnosis on recorded synthetic hits. No service or model calls.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { capture, retrievalQueries, selectMemory, interleaveHits } from '../src/memory.js';
import { naturalCases, loadNaturalFixture } from './natural-dialogue.mjs';
const [input, output] = process.argv.slice(2);
assert(input && output && process.argv.length === 4 && process.env.ST_SOURCE,
    'Usage: ST_SOURCE=/pinned/host node scripts/context-turn-budget-replay.mjs generation-evidence.json new-output.json');
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', process.env.ST_SOURCE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
const bytes = readFileSync(input), report = JSON.parse(bytes);
assert(report.passed && report.cleanupComplete && report.nativeCleanupComplete);
assert.equal(report.sillyTavern, revision);
const evaluation = report.evaluation ?? { version: report.summary?.version, rows: report.rows };
assert.equal(evaluation.version, 'context-turn-generation-v1');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of ['index.js', 'src/memory.js', 'src/context.js']) {
    assert.equal(sha(readFileSync(new URL(`../${file}`, import.meta.url))), report.sourceSha256[file], 'Use the recorded runtime');
}
const fixture = loadNaturalFixture(evaluation.version);
const cases = new Map(naturalCases(fixture).map(item => [item.id, item]));
// Pinned host passes context minus maximum response length to the interceptor;
// index.js caps memory to one quarter of that size. /openai/count adds six tokens.
const effectiveBudget = Math.min(fixture.settings.budget, Math.floor((fixture.settings.context - fixture.settings.maxOutputTokens) / 4));
const require = createRequire(path.join(process.env.ST_SOURCE, 'package.json'));
const tokenizer = require('tiktoken').encoding_for_model('gpt-4o');
const count = text => text ? tokenizer.encode(text).length + 6 : 0;
const rows = []; let reproduced = 0;
try {
    for (const row of evaluation.rows.filter(row => row.mode === 'on')) {
        const item = cases.get(row.case), messages = [...item.input.source, { mes: item.input.question, name: 'User', is_user: true }];
        const snapshot = capture({ chat: messages, characterId: 0, characters: [{ avatar: 'synthetic.png' }], chatMetadata: { sillymemory: { version: 1, id: row.id, story: row.id } }, getCurrentChatId: () => row.id });
        // Telemetry appends requests on completion. Restore runtime query order.
        const queries = retrievalQueries(snapshot), hits = queries.map(query => row.queries.find(search => search.query === query).hits);
        const docs = [...new Map(hits.flat().map(hit => [hit.id, hit])).values()];
        const actual = await selectMemory(interleaveHits(hits), docs, effectiveBudget, count);
        assert.equal(actual.tokens, row.memoryTokens);
        assert.deepEqual(actual.passages.map(doc => doc.id), row.selectedIds);
        reproduced++;
        if (row.case !== 'ko-historical-assistant-topic') continue;
        const variants = {};
        for (const recent of [8, 12]) for (const budget of [effectiveBudget, fixture.settings.budget]) {
            const filtered = hits.map(list => list.filter(doc => doc.message < messages.length - recent));
            const selected = await selectMemory(interleaveHits(filtered), docs, budget, count);
            variants[`recent${recent}-budget${budget}`] = { selected: selected.passages.map(doc => doc.message), tokens: selected.tokens,
                targetSelected: selected.passages.some(doc => doc.message === 8), targetRanks: filtered.map(list => list.findIndex(doc => doc.message === 8) + 1) };
        }
        rows.push({ id: row.id, queries, variants });
    }
} finally { tokenizer.free(); }
assert.equal(reproduced, 32); assert.equal(rows.length, 2);
const result = { kind: 'Post-result offline diagnosis; no new searches or generations; recent12 filters recorded top-30 lists and is not a new live query',
    generationReportSha256: report.rawReportSha256 ?? sha(bytes), serviceCalls: 0, reproducedLiveOnSelections: reproduced, configuredBudget: fixture.settings.budget, effectiveBudget, rows };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, reproduced, effectiveBudget, serviceCalls: 0 }));
