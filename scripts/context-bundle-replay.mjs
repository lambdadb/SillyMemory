// Reproducible local selection replay. Never reads .env or calls a service.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { selectMemory, interleaveHits } from '../src/memory.js';
import { bundlePolicies, selectContextBundles } from './context-bundles.mjs';
import { semanticBundleInputs, freshBundleInputs, coverageFor, diagnoseEvidence } from './context-bundle-data.mjs';
import { replayInputs, read, sha } from './budget-selection-data.mjs';
import { pinnedCounter, sourceFiles, semanticHost } from './semantic-long.mjs';
const coordinate = doc => `${doc.message}:${doc.chunk}`;
const oldReport = () => read('docs/results/budget-selection-replay-v1.json');
export function bundlePlan() {
    const files = [...new Set([...Object.keys(oldReport().sourceSha256), ...sourceFiles,
        'scripts/context-bundles.mjs', 'scripts/context-bundle-data.mjs', 'scripts/context-bundle-replay.mjs',
        'docs/context-bundle-evaluation.md', 'tests/fixtures/context-bundles-v1.json',
        'docs/results/budget-selection-replay-v1.json', 'docs/results/semantic-direct-v1.json'])];
    return { version: 'context-bundles-v1', candidateFreeze: '8dcb264', host: semanticHost, policies: bundlePolicies, budgets: [320, 400, 800],
        sourceSha256: Object.fromEntries(files.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))])) };
}
const countReasons = decisions => decisions.reduce((counts, row) => { counts[row.reason] = (counts[row.reason] || 0) + 1; return counts; }, {});
const quoteCoverage = (input, passages) => ({
    completeEvidence: input.evidence.length ? input.evidence.every(ref => passages.some(doc => doc.message === ref.message && doc.text.includes(ref.quote))) : null,
    answerQuality: null,
    units: input.evidence.map((ref, i) => ({ id: `legacy-${i}`, kind: 'legacy-full-quote', covered: passages.some(doc => doc.message === ref.message && doc.text.includes(ref.quote)) })),
});
function diagnostics(input, selected) {
    const coords = new Map(input.docs.map(doc => [doc.id, coordinate(doc)]));
    const refs = input.item?.evidence || input.evidence;
    const relevant = new Set(input.docs.filter(doc => refs.some(ref => ref.message === doc.message)).map(doc => doc.id));
    const trace = decision => ({ ...decision, seed: coords.get(decision.seed) ?? null,
        ...(decision.bundle ? { bundle: decision.bundle.map(id => coords.get(id)), added: decision.added.map(id => coords.get(id)) } : {}) });
    return { decisionCounts: countReasons(selected.decisions),
        // Labels filter diagnostic output only AFTER source-only selection.
        evidenceDecisions: selected.decisions.filter(d => relevant.has(d.seed) || d.bundle?.some(id => relevant.has(id))).map(trace) };
}
export function summarizeBundles(rows) {
    const groups = [];
    for (const corpus of [...new Set(rows.map(row => row.corpus))]) for (const budget of [...new Set(rows.filter(row => row.corpus === corpus).map(row => row.budget))]) {
        const subset = rows.filter(row => row.corpus === corpus && row.budget === budget);
        for (const policy of bundlePolicies) {
            const known = subset.filter(row => row.variants[policy].coverage.completeEvidence !== null);
            const losses = [], gains = []; let unitLosses = 0, unitGains = 0;
            for (const row of subset) {
                const baseline = row.variants.passage.coverage, candidate = row.variants[policy].coverage;
                if (baseline.completeEvidence === true && candidate.completeEvidence === false) losses.push(row.id);
                if (baseline.completeEvidence === false && candidate.completeEvidence === true) gains.push(row.id);
                baseline.units.forEach((unit, i) => { assert.equal(unit.id, candidate.units[i].id); unitLosses += Number(unit.covered && !candidate.units[i].covered); unitGains += Number(!unit.covered && candidate.units[i].covered); });
            }
            groups.push({ corpus, budget, policy, samples: subset.length, known: known.length, complete: known.filter(row => row.variants[policy].coverage.completeEvidence).length,
                unknown: subset.length - known.length, unitLosses, unitGains, losses, gains,
                meanTokens: subset.reduce((n, row) => n + row.variants[policy].tokens, 0) / subset.length,
                maxTokens: Math.max(...subset.map(row => row.variants[policy].tokens)) });
        }
    }
    const eligibility = bundlePolicies.filter(p => p !== 'passage').map(policy => {
        const target = rows.filter(row => row.corpus === 'semantic-recorded' && row.budget === 320 && row.id.includes('/long-ko-quotation/'));
        assert.equal(target.length, 2);
        const recoveredQuotation = target.every(row => row.variants[policy].coverage.completeEvidence);
        const unitLosses = groups.filter(g => g.policy === policy).reduce((n, group) => n + group.unitLosses, 0);
        return { policy, recoveredQuotation, unitLosses, eligibleForFreshLiveValidation: recoveredQuotation && unitLosses === 0 };
    });
    return { groups, eligibility };
}
export async function runBundleReplay(count) {
    const legacy = await replayInputs(), historical = oldReport();
    const inputs = [
        ...legacy.map(input => ({ ...input, corpus: input.id.startsWith('search/') ? 'legacy-search' : 'legacy-generation', hits: interleaveHits(input.lists) })),
        ...await semanticBundleInputs(), ...await freshBundleInputs(),
    ];
    const rows = []; let reproducedLegacy = 0, reproducedSemantic = 0;
    for (const input of inputs) for (const budget of input.budgets) {
        const shipped = await selectMemory(input.hits, input.docs, budget, count), variants = {};
        if (input.corpus.startsWith('legacy-')) {
            const recorded = historical.rows.find(row => row.id === input.id && row.budget === budget).variants.baseline;
            assert.equal(shipped.tokens, recorded.tokens); assert.deepEqual(shipped.passages.map(coordinate), recorded.selected); reproducedLegacy++;
        }
        if (input.original && input.corpus === 'semantic-recorded' && budget === 320) {
            assert.equal(shipped.tokens, input.original.memoryTokens);
            assert.deepEqual(shipped.passages.map(coordinate), input.original.passages.map(coordinate)); reproducedSemantic++;
        }
        for (const policy of bundlePolicies) {
            const result = await selectContextBundles(input.hits, input.docs, budget, policy, count);
            if (policy === 'passage') {
                assert.deepEqual(result.passages, shipped.passages); assert.equal(result.tokens, shipped.tokens); assert.deepEqual(result.messages, shipped.messages);
            }
            const coverage = input.item ? coverageFor(input.item, result.passages) : quoteCoverage(input, result.passages);
            variants[policy] = { selected: result.passages.map(coordinate), tokens: result.tokens, coverage,
                ...(input.item ? { evidenceDiagnosis: diagnoseEvidence(input.item, result, input.hits, input.docs) } : {}), ...diagnostics(input, result) };
        }
        rows.push({ id: input.id, corpus: input.corpus, budget, variants });
    }
    assert.equal(reproducedLegacy, 218); assert.equal(reproducedSemantic, 32); assert.equal(rows.length, 362);
    return { version: 'context-bundles-v1', kind: 'Offline source-retention development with recorded and authored synthetic ranks; not new retrieval or answer quality',
        runtimeChanged: false, serviceCalls: 0, answerQuality: null, independentHumanReview: null,
        reproducedLegacy, reproducedSemantic, ...summarizeBundles(rows), rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [mode, planPath, output] = process.argv.slice(2);
    assert(['--freeze', '--run'].includes(mode) && planPath && (mode === '--freeze' ? process.argv.length === 4 : process.argv.length === 5),
        'Usage: node scripts/context-bundle-replay.mjs --freeze new-plan.json | ST_SOURCE=/pinned/host node scripts/context-bundle-replay.mjs --run plan.json new-result.json');
    if (mode === '--freeze') { writeFileSync(planPath, JSON.stringify(bundlePlan(), null, 2) + '\n', { flag: 'wx' }); console.log(`Frozen ${planPath}`); }
    else {
        const bytes = readFileSync(planPath), plan = JSON.parse(bytes); assert.deepEqual(plan, bundlePlan(), 'Frozen plan changed');
        // Reserve output before computation so an earlier result cannot be overwritten.
        writeFileSync(output, JSON.stringify({ complete: false, planSha256: sha(bytes) }), { flag: 'wx' });
        const counter = pinnedCounter(process.env.ST_SOURCE); let report;
        try { report = await runBundleReplay(counter.count); } finally { counter.close(); }
        assert.deepEqual(bundlePlan(), plan, 'Sources changed during replay');
        Object.assign(report, { complete: true, planSha256: sha(bytes), sourceSha256: plan.sourceSha256, host: plan.host,
            tokenizer: { package: 'tiktoken', version: '1.0.22', model: 'gpt-4o', padding: 6 } });
        writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ output, rows: report.rows.length, reproducedLegacy: report.reproducedLegacy, reproducedSemantic: report.reproducedSemantic, groups: report.groups, eligibility: report.eligibility }));
    }
}
