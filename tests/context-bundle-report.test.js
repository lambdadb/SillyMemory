import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha } from '../scripts/semantic-long.mjs';
import { bundlePlan, summarizeBundles } from '../scripts/context-bundle-replay.mjs';
import { inspectBundleRow } from '../scripts/context-bundle-inspect.mjs';
import { recordedSource } from '../scripts/recorded-source.mjs';
const read = file => readFileSync(new URL(`../docs/results/${file}`, import.meta.url));
const report = JSON.parse(read('context-bundle-replay-v1.json'));

test('recorded replay retains frozen inputs, complete rows and all source-retention regressions', () => {
    const planBytes = read('context-bundle-plan-v1.json');
    const historical = JSON.parse(planBytes), reconstructed = bundlePlan();
    for (const file of Object.keys(reconstructed.sourceSha256)) reconstructed.sourceSha256[file] = sha(recordedSource(file, historical.sourceSha256[file]));
    assert.deepEqual(reconstructed, historical);
    assert.equal(report.planSha256, sha(planBytes));
    assert.deepEqual(report.sourceSha256, historical.sourceSha256);
    assert.equal(report.complete, true); assert.equal(report.serviceCalls, 0);
    assert.equal(report.runtimeChanged, false); assert.equal(report.answerQuality, null);
    assert.equal(report.reproducedLegacy, 218); assert.equal(report.reproducedSemantic, 32);
    assert.equal(report.rows.length, 362);
    assert.equal(new Set(report.rows.map(row => `${row.id}/${row.budget}`)).size, 362);
    const summary = summarizeBundles(report.rows);
    assert.deepEqual(summary.groups, report.groups); assert.deepEqual(summary.eligibility, report.eligibility);
    assert.deepEqual(report.eligibility.map(row => [row.recoveredQuotation, row.unitLosses, row.eligibleForFreshLiveValidation]), [[true, 21, false], [true, 38, false]]);
    for (const row of report.rows) for (const v of Object.values(row.variants)) {
        assert(v.tokens <= row.budget); assert.equal(v.coverage.answerQuality, null);
        assert.equal(new Set(v.selected).size, v.selected.length);
        for (const d of v.evidenceDecisions.filter(d => d.reason === 'budget-exceeded')) {
            assert.equal(d.overBy, d.trialTokens - row.budget); assert(d.overBy > 0);
        }
    }
});

test('inspection distinguishes retrieved-but-rejected context from unknown evidence and incomplete output', () => {
    const id = 'semantic/long-ko-quotation/r1/on';
    const baseline = inspectBundleRow(report, id, 320, 'passage');
    assert.deepEqual(baseline.units.find(unit => unit.id === 'signature'), { id: 'signature', kind: 'attribution', covered: false, available: true, retrieved: true, reason: 'not-selected-within-budget' });
    assert(baseline.evidenceDecisions.some(d => d.seed === '0:0' && d.trialTokens === 333 && d.overBy === 13));
    const candidate = inspectBundleRow(report, id, 320, 'previous-turn');
    assert(candidate.evidenceComplete); assert.equal(candidate.tokens, 257);
    const unknown = inspectBundleRow(report, 'fresh/bundle-ko-unknown', 320, 'passage');
    assert.equal(unknown.evidenceComplete, null); assert.equal(unknown.answerQuality, null);
    assert.throws(() => inspectBundleRow({ ...report, complete: false }, id, 320, 'passage'), /Complete/);
    assert.throws(() => inspectBundleRow(report, id, 321, 'passage'), /identify one/);
    assert.throws(() => inspectBundleRow(report, id, 320, 'invented'), /Unknown/);
});
