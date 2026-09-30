import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { interleaveHits, selectMemory } from '../src/memory.js';
import { replayInputs, read, sha } from './budget-selection-data.mjs';
import { sentencePolicies, selectSentencePassages, excerptEvidence } from './sentence-passages.mjs';

const [output] = process.argv.slice(2);
assert(output && process.argv.length === 3 && process.env.ST_SOURCE,
    'Usage: ST_SOURCE=/pinned/host node scripts/sentence-passage-replay.mjs new-output.json');
const prior = read('docs/results/budget-selection-replay-v1.json');
assert.equal(execFileSync('git', ['-C', process.env.ST_SOURCE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), prior.sillyTavern);
const require = createRequire(path.resolve(process.env.ST_SOURCE, 'package.json'));
assert.equal(JSON.parse(readFileSync(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, prior.tokenizer.version);
const encoder = require('tiktoken').encoding_for_model(prior.tokenizer.model);
const count = text => text ? encoder.encode(text).length + prior.tokenizer.padding : 0;
const files = [...Object.keys(prior.sourceSha256), 'docs/results/budget-selection-replay-v1.json',
    'docs/sentence-passage-evaluation.md', 'scripts/sentence-passages.mjs', 'scripts/sentence-passage-replay.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))]));
const sourceSha256 = hashes();
for (const [file, hash] of Object.entries(prior.sourceSha256)) assert.equal(sourceSha256[file], hash, `Baseline input changed: ${file}`);
const inputs = await replayInputs(), rows = [];
try {
    for (const input of inputs) for (const budget of input.budgets) {
        const hits = interleaveHits(input.lists), baseline = await selectMemory(hits, input.docs, budget, count);
        const original = prior.rows.find(row => row.id === input.id && row.budget === budget); assert(original);
        assert.equal(baseline.tokens, original.variants.baseline.tokens);
        assert.deepEqual(baseline.passages.map(doc => `${doc.message}:${doc.chunk}`), original.variants.baseline.selected);
        const baseSpans = baseline.passages.map(doc => ({ doc, start: 0, end: doc.text.length }));
        const variants = { baseline: { selected: baseSpans.map(({doc,start,end})=>({message:doc.message,chunk:doc.chunk,start,end})),
            tokens: baseline.tokens, evidence: excerptEvidence(baseSpans, input.evidence) } };
        for (const policy of sentencePolicies) {
            const selected = await selectSentencePassages(hits, input.docs, input.queries, budget, policy, count);
            variants[policy] = { selected: selected.passages.map(({doc,start,end})=>({message:doc.message,chunk:doc.chunk,start,end})),
                tokens: selected.tokens, evidence: excerptEvidence(selected.passages, input.evidence) };
        }
        rows.push({ id: input.id, recent: input.recent, budget, evidence: input.evidence, variants });
    }
} finally { encoder.free(); }
assert.equal(rows.length, 218); assert.deepEqual(hashes(), sourceSha256, 'Source changed during replay');
const summary = Object.fromEntries(['baseline', ...sentencePolicies].map(policy => {
    let selected = 0, total = 0, partialParents = 0; const losses = [], gains = [];
    for (const row of rows) for (const [i, ref] of row.variants[policy].evidence.entries()) {
        selected += Number(ref.selected); total++; partialParents += Number(ref.parentSelected && !ref.selected);
        const baseline = row.variants.baseline.evidence[i].selected;
        if (baseline && !ref.selected) losses.push({ id: row.id, budget: row.budget, message: ref.message });
        if (!baseline && ref.selected) gains.push({ id: row.id, budget: row.budget, message: ref.message });
    }
    const historical = rows.filter(row => row.id.startsWith('generation/ko-historical-assistant-topic/'));
    assert.equal(historical.length, 2);
    const recoveredHistorical = historical.every(row => row.variants[policy].evidence.every(ref => ref.selected));
    return [policy, { selected, total, partialParents, losses, gains, recoveredHistorical,
        eligibleForFreshValidation: gains.length > 0 && losses.length === 0 && recoveredHistorical }];
}));
const result = { version: 'sentence-passage-replay-v1', kind: 'Offline known-hit excerpt development; no new retrieval or generated answers',
    serviceCalls: 0, generationCalls: 0, sillyTavern: prior.sillyTavern, tokenizer: prior.tokenizer, sourceSha256,
    reproducedBaselineRows: rows.length, summary, rows };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, summary }, null, 2));
