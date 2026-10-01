import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha } from '../scripts/benchmark-audit.mjs';
import { recordedSource } from '../scripts/recorded-source.mjs';
import { validateLivePilot, validateContinuation } from '../scripts/benchmark-live-results.mjs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url));
const planBytes = read('docs/benchmarks/pilot-design-v1.json'), plan = JSON.parse(planBytes);
const reportBytes = read('docs/benchmarks/live-pilot-v1.json'), report = JSON.parse(reportBytes);

test('live pilot binds real results to the frozen plan, producer and derived usage', () => {
    assert.equal(report.planSha256, sha(planBytes));
    assert.equal(report.sourceSha256, plan.sourceSha256);
    assert.equal(report.preflightSha256, sha(read('docs/benchmarks/host-preflight-v1.json')));
    for (const [file, hash] of Object.entries(report.sourceSha256ByFile)) recordedSource(file, hash);
    const priorBytes = read('docs/benchmarks/live-pilot-interrupted-v1.json'), prior = JSON.parse(priorBytes);
    assert.equal(report.continuation.reportSha256, sha(priorBytes));
    for (const [file, hash] of Object.entries(prior.sourceSha256ByFile)) recordedSource(file, hash);
    validateContinuation(report, prior);
    const actual = { reportSha256: sha(reportBytes), ...validateLivePilot(report, plan) };
    assert.deepEqual(actual, JSON.parse(read('docs/benchmarks/live-pilot-summary-v1.json')));
});

test('incomplete, changed, undelivered or uncleared live evidence cannot become a comparison', () => {
    for (const mutate of [
        r => { r.rows.pop(); },
        r => { r.rows[0].answer = 'Changed answer'; },
        r => { r.rows[0].judge.correct = !r.rows[0].judge.correct; },
        r => { r.rows.find(x => x.mode === 'sillymemory').delivery = 'Final host prompt: 0/0 memory passages and 12/12 recent messages verified. Provider receipt is not checked.'; },
        r => { r.cleanupResults.remote[0].inaccessible = false; },
        r => { r.generations[0].attempts[0].status = 500; },
        r => { r.budget.openaiReservedUsd = 0; },
        r => { r.rows[0].id = 'held-out'; },
        r => { r.rows[0].judge.response = 'Maybe yes'; },
    ]) {
        const changed = structuredClone(report); mutate(changed);
        assert.throws(() => validateLivePilot(changed, plan));
    }
});


test('continuation cannot hide or regenerate successful prior calls', () => {
    const previous = JSON.parse(read('docs/benchmarks/live-pilot-interrupted-v1.json'));
    const changed = structuredClone(report); changed.generations[0].answer = 'rerun';
    assert.throws(() => validateContinuation(changed, previous), /Previously successful calls/);
    const obscured = structuredClone(report); obscured.continuation.errors = [];
    assert.throws(() => validateContinuation(obscured, previous));
});
