import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { selectMemory, selectPackedMemory, interleaveHits, literal } from '../src/memory.js';
import { replayInputs, sha } from './budget-selection-data.mjs';
import { semanticBundleInputs, freshBundleInputs, coverageFor } from './context-bundle-data.mjs';
import { pinnedCounter } from './semantic-long.mjs';

const output = process.argv[2]; assert(output, 'Provide a new output report path');
mkdirSync(path.dirname(output), { recursive: true });
const sourceSha256 = Object.fromEntries(['src/memory.js', 'scripts/repeated-packing-check.mjs', 'scripts/context-bundle-data.mjs', 'docs/results/context-bundle-replay-v1.json', 'docs/results/semantic-direct-v1.json'].map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))]));
writeFileSync(`${output}.plan.json`, JSON.stringify({ sourceSha256, budgets: [320, 400, 800] }, null, 2), { flag: 'wx' });
const counter = pinnedCounter(process.env.ST_SOURCE), rows = [];
const prior = JSON.parse(readFileSync(new URL('../docs/results/context-bundle-replay-v1.json', import.meta.url)));
const inputs = [...(await replayInputs()).map(input => ({ ...input, corpus: input.id.startsWith('search/') ? 'legacy-search' : 'legacy-generation', hits: interleaveHits(input.lists) })), ...await semanticBundleInputs(), ...await freshBundleInputs()];
try {
    for (const input of inputs) for (const budget of input.budgets) {
        const baseline = await selectMemory(input.hits, input.docs, budget, counter.count);
        const packed = await selectPackedMemory(input.hits, input.docs, budget, counter.count);
        const old = prior.rows.find(row => row.id === input.id && row.budget === budget).variants.passage;
        assert.equal(baseline.tokens, old.tokens);
        assert.deepEqual(baseline.passages.map(p => `${p.message}:${p.chunk}`), old.selected);
        assert.ok(packed.tokens <= budget);
        for (const doc of baseline.passages) assert(packed.passages.some(p => p.id === doc.id), 'Baseline source was evicted');
        for (const doc of packed.passages) {
            const message = packed.messages.find(m => m.is_user === (doc.role === 'user') && m.name === literal(doc.speaker) && m.mes.endsWith(`\n${literal(doc.text)}`)
                && (m.mes.includes(`message ${doc.message + 1}, passage ${doc.chunk + 1}]`) || m.mes.split('\n')[0].split('identical text at message:passage ')[1]?.slice(0, -1).split(', ').includes(`${doc.message + 1}:${doc.chunk + 1}`)));
            assert(message, 'Full text, native speaker and source coordinate must survive rendering');
        }
        const complete = passages => input.item ? coverageFor(input.item, passages).completeEvidence : input.evidence.length ? input.evidence.every(ref => passages.some(p => p.message === ref.message && p.text.includes(ref.quote))) : null;
        rows.push({ id: input.id, corpus: input.corpus, budget, baseline: { tokens: baseline.tokens, complete: complete(baseline.passages), selected: old.selected }, packed: { tokens: packed.tokens, complete: complete(packed.passages), selected: packed.passages.map(p => `${p.message}:${p.chunk}`), messages: packed.messages.length } });
    }
} finally { counter.close(); }
assert.equal(rows.length, 362);
assert(rows.every(r => r.baseline.complete !== true || r.packed.complete === true));
const target = rows.filter(r => r.id.includes('semantic/long-ko-quotation/') && r.budget === 320);
assert.equal(target.length, 2); assert(target.every(r => r.packed.complete === true), 'Recover the missing attribution');
const groups = [...new Set(rows.map(r => `${r.corpus}/${r.budget}`))].map(key => {
    const subset = rows.filter(r => `${r.corpus}/${r.budget}` === key);
    return { key, known: subset.filter(r => r.baseline.complete !== null).length, before: subset.filter(r => r.baseline.complete).length, after: subset.filter(r => r.packed.complete).length };
});
writeFileSync(output, JSON.stringify({ passed: true, evidence: 'Offline source retention, not new search or answer quality', sourceSha256, rows, groups, baselineSourcesEvicted: 0 }, null, 2));
console.log(JSON.stringify({ groups, target }, null, 2));
