// Offline development replay. Uses the pinned host tokenizer, never a service.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { selectMemory, interleaveHits } from '../src/memory.js';
import { replayInputs, sha } from './budget-selection-data.mjs';
import { policies, rankPassages, summarizeSelection } from './budget-selection.mjs';

const [output] = process.argv.slice(2);
assert(output && process.argv.length === 3 && process.env.ST_SOURCE,
    'Usage: ST_SOURCE=/pinned/host node scripts/budget-selection-replay.mjs new-output.json');
const sillyTavern = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', process.env.ST_SOURCE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sillyTavern);
const require = createRequire(path.resolve(process.env.ST_SOURCE, 'package.json'));
const tokenizerVersion = JSON.parse(readFileSync(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version;
assert.equal(tokenizerVersion, '1.0.22', 'Use the recorded tokenizer version');
const tokenizer = require('tiktoken').encoding_for_model('gpt-4o');
// Pinned /openai/count adds six tokens to each nonempty content count.
const count = text => text ? tokenizer.encode(text).length + 6 : 0;
const inputs = await replayInputs(), rows = [];
const sourceFiles = [
    'index.js', 'src/memory.js', 'src/context.js',
    'scripts/budget-selection.mjs', 'scripts/budget-selection-data.mjs', 'scripts/budget-selection-replay.mjs',
    'scripts/context-turn-cases.mjs', 'scripts/assistant-fallback-cases.mjs', 'scripts/assistant-topic-diagnostic.mjs',
    'scripts/context-edges.mjs', 'scripts/selection-diagnostic.mjs', 'scripts/natural-dialogue.mjs', 'scripts/context-candidate.mjs', 'scripts/actor-ablation.mjs', 'scripts/actor-perspective.mjs',
    'docs/results/context-turn-search-v1.json', 'docs/results/context-turn-generation-v1.json',
    ...readdirSync(new URL('../tests/fixtures/', import.meta.url)).filter(file => file.endsWith('.json')).map(file => `tests/fixtures/${file}`),
];
const hashes = () => Object.fromEntries(sourceFiles.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))]));
const sourceSha256 = hashes();
try {
    for (const input of inputs) {
        const original = await selectMemory(interleaveHits(input.lists), input.docs, input.originalBudget, count);
        assert.equal(original.tokens, input.original.tokens, `${input.id}: recorded tokens`);
        assert.deepEqual(original.passages.map(doc => input.selectionKey === 'message' ? doc.message : `${doc.message}:${doc.chunk}`), input.original.selected, `${input.id}: recorded selection`);
        for (const budget of input.budgets) {
            const variants = {};
            for (const policy of policies) {
                const result = await selectMemory(rankPassages(input.lists, input.queries, policy, count), input.docs, budget, count);
                variants[policy] = { selected: result.passages.map(doc => `${doc.message}:${doc.chunk}`), tokens: result.tokens,
                    evidence: input.evidence.map(ref => ({ message: ref.message, selected: result.passages.some(doc => doc.message === ref.message && doc.text.includes(ref.quote)) })) };
            }
            rows.push({ id: input.id, recent: input.recent, budget, evidence: input.evidence, variants });
        }
    }
} finally { tokenizer.free(); }
assert.equal(inputs.length, 94); assert.equal(rows.length, 218);
assert.deepEqual(hashes(), sourceSha256, 'Sources changed during replay');
const summary = summarizeSelection(rows);
const eligible = policies.filter(policy => summary[policy].eligibleForFreshValidation);
const report = { version: 'budget-selection-replay-v1',
    kind: 'Post-result development replay of known recorded hits, not independent quality evidence',
    serviceCalls: 0, generationCalls: 0, runtimeChanged: false, sillyTavern,
    tokenizer: { package: 'tiktoken', version: tokenizerVersion, model: 'gpt-4o', encoding: 'o200k_base', padding: 6 },
    sourceSha256, reproduced: { search: 62, generationOn: 32 },
    eligibleForFreshValidation: eligible, summary, rows };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, reproduced: report.reproduced, rows: rows.length, eligibleForFreshValidation: eligible, serviceCalls: 0 }));
