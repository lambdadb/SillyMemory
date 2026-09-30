// Read one completed evaluation row without rerunning retrieval or selection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bundlePolicies } from './context-bundles.mjs';
export function inspectBundleRow(report, id, budget, policy) {
    assert(report.version === 'context-bundles-v1' && report.complete, 'Complete context bundle report required');
    assert(bundlePolicies.includes(policy), 'Unknown policy');
    const matches = report.rows.filter(row => row.id === id && row.budget === budget);
    assert.equal(matches.length, 1, 'Case and budget must identify one result');
    const row = matches[0], result = row.variants[policy];
    return { case: id, corpus: row.corpus, policy, budget, tokens: result.tokens, selected: result.selected,
        evidenceComplete: result.coverage.completeEvidence, answerQuality: null,
        units: result.evidenceDiagnosis || result.coverage.units,
        decisionCounts: result.decisionCounts,
        evidenceDecisions: result.evidenceDecisions,
        note: 'Evidence labels only filter this post-selection view; no new search or generated answer.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [input, id, budget, policy] = process.argv.slice(2);
    assert(process.argv.length === 6, 'Usage: node scripts/context-bundle-inspect.mjs report.json case-id budget policy');
    console.log(JSON.stringify(inspectBundleRow(JSON.parse(readFileSync(input)), id, Number(budget), policy), null, 2));
}
