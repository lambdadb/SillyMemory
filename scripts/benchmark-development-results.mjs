// Validate the public local-fixture report; optionally revalidate private retained
// observations without starting a host or making generation/embedding requests.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha, readVerifiedFile } from './benchmark-audit.mjs';
import { prepareDevelopmentCase } from './benchmark-development-input.mjs';
import { validateObservation } from './benchmark-observation.mjs';
export const producers = ['scripts/benchmark-development-preflight.mjs', 'scripts/benchmark-development-input.mjs',
    'scripts/benchmark-checkpoint.mjs', 'scripts/benchmark-native-barrier.mjs', 'scripts/benchmark-observation.mjs', 'scripts/benchmark-retrieval-observer.mjs',
    'scripts/benchmark-host-input.mjs', 'scripts/benchmark-loopback-guard.cjs', 'scripts/benchmark-audit.mjs',
    'index.js', 'src/chat-collections.js', 'manifest.json', 'src/memory.js', 'src/context.js', 'src/client.js', 'src/gate.js', 'src/delivery.js', 'src/status.js'];
export function validateDevelopmentReport(report, plan) {
    assert.equal(report.version, 'longmemeval-development-preflight-v1');
    assert(report.passed && report.cleanup); assert.equal(report.failure, undefined); assert.deepEqual(report.errors, []);
    assert.equal(report.hostRevision, plan.hostRevision); assert.equal(report.sourceSha256, plan.sourceSha256);
    assert.deepEqual(Object.keys(report.sourceSha256ByFile || {}).sort(), [...producers].sort(), 'Complete producer map required');
    // Validate new runs against this checkout. Historical runs use their archived revision.
    for (const file of producers) assert.equal(sha(readFileSync(new URL(`../${file}`, import.meta.url))), report.sourceSha256ByFile[file], `Producer changed: ${file}`);
    assert.deepEqual(report.nativeBarriers.map(b => b.stage), plan.tasks.filter(t => t.mode === 'vectors').map(t => t.id));
    assert(report.nativeBarriers.every(b => b.disabled && b.pending === 0 && b.settleMs === 1500 && b.elapsedMs < 30000));
    assert.equal(report.traffic.hostBlocked, 0); assert.equal(report.traffic.browserBlocked, 0);
    assert.deepEqual(report.rows.map(r => `${r.id}/${r.context}/${r.mode}`), plan.tasks.map(t => t.id), 'Complete ordered matrix');
    assert.deepEqual(report.summaries.map(s => s.id), plan.cases.map(c => c.id));
    assert.equal(report.traffic.completions, 1 + 70 + report.summaries.reduce((n, s) => n + s.calls, 0));
    assert(report.traffic.completions <= 1000);
    for (const op of report.traffic.lambda.filter(x => x.operation === 'docs/upsert')) assert(Number.isInteger(op.count) && op.count > 0 && op.count <= 50, 'Ordinary upsert batch limit');
    for (const summary of report.summaries) {
        assert.equal(summary.context, 32768); assert.equal(summary.calls, summary.steps.length);
        assert(summary.calls > 0 && summary.calls <= plan.cases.find(c => c.id === summary.id).automaticSummaryCallCap);
        summary.steps.forEach((s, i) => {
            assert.equal(s.outputCap, 1024); assert.equal(s.storedAt, s.triggerMessage - 1);
            if (i) assert(s.previousSummaryIncluded && s.triggerMessage > summary.steps[i - 1].triggerMessage);
        });
    }
    for (const row of report.rows) {
        const sample = plan.cases.find(c => c.id === row.id);
        assert.equal(row.inputSha256, sample.inputSha256); assert.equal(row.sourceMessages, sample.sourceMessages);
        assert(row.sourcePreserved && row.questionDelivered); assert.equal(row.hostPromptBudget, row.context - plan.generator.maxOutputTokens);
        assert(row.hostPromptTokens > 0 && row.hostPromptTokens <= row.hostPromptBudget);
        assert.equal(row.nativeSourceIndexes.length, row.exactNativeRoleMessages);
        if (row.mode === 'off') assert(row.context === 131072 ? row.exactNativeRoleMessages === row.nonemptyMessages : row.exactNativeRoleMessages < row.nonemptyMessages);
        if (row.mode === 'sillymemory') {
            const d = row.retrieval;
            assert(d && d.queries.length > 0 && d.selected.length > 0 && d.preparedMessages > 0);
            assert.equal(d.preparedMessages, d.deliveredMessages); assert(d.memoryTokens > 0 && d.memoryTokens <= d.memoryBudget);
            assert.equal(d.memoryBudget, 800);
            assert.equal(d.uniqueValidCandidates, d.selected.length + d.unselectedValidCandidates.length);
        }
    }
    return { passed: true, rows: report.rows.length, localCompletions: report.traffic.completions,
        automaticSummaries: report.summaries.reduce((n, s) => n + s.calls, 0), externalProviderCalls: 0 };
}
export function validatePrivateObservations(report, plan, directory, cache) {
    assert(!existsSync(path.join(directory, 'writer.lock')), 'Checkpoint is still locked');
    const state = JSON.parse(readFileSync(path.join(directory, 'state.json')));
    assert.equal(state.version, 1); assert.deepEqual(state.binding, { plan: report.planSha256, producer: report.sourceSha256ByFile });
    assert.deepEqual(state.limits, { completions: 1000 });
    assert.equal(Object.keys(state.calls).length, state.used.completions);
    assert.equal(state.used.completions, report.traffic.completions);
    for (const [id, call] of Object.entries(state.calls)) {
        assert.equal(call.status, 'complete'); assert.equal(call.receipt, `receipt-${sha(id)}.json`);
        assert.equal(sha(readFileSync(path.join(directory, call.receipt))), call.receiptSha256);
    }
    const lock = JSON.parse(readFileSync(new URL('../docs/benchmarks/sources-v1.json', import.meta.url)));
    const data = readVerifiedFile(cache, lock.files.find(f => f.dataset === 'longmemeval'));
    assert.deepEqual(Object.keys(state.observations).sort(), plan.tasks.map(t => t.id).sort());
    for (const row of report.rows) {
        const id = `${row.id}/${row.context}/${row.mode}`, saved = state.observations[id].value;
        assert.equal(sha(JSON.stringify(saved.request)), state.calls[saved.completionId].requestSha256, 'Observation request differs from receipt intent');
        const sample = plan.cases.find(c => c.id === row.id), item = prepareDevelopmentCase(data[sample.sourceIndex], sample);
        const actual = validateObservation(item, row.context, row.mode, saved, plan.generator.maxOutputTokens);
        for (const [key, value] of Object.entries(actual)) assert.deepEqual(value, row[key]);
        assert.equal(sha(JSON.stringify(saved.request.messages)), row.promptSha256);
    }
    return { observationsRevalidated: report.rows.length, newProviderCalls: 0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [reportFile, directory, cache] = process.argv.slice(2);
    assert(reportFile && (process.argv.length === 3 || process.argv.length === 5), 'Usage: benchmark-development-results.mjs <report.json> [<checkpoint-dir> <dataset-cache>]');
    const report = JSON.parse(readFileSync(reportFile));
    const bytes = readFileSync(new URL('../docs/benchmarks/development-plan-v1.json', import.meta.url));
    assert.equal(report.planSha256, sha(bytes), 'Frozen plan changed');
    const plan = JSON.parse(bytes), result = validateDevelopmentReport(report, plan);
    if (directory) Object.assign(result, validatePrivateObservations(report, plan, directory, cache));
    console.log(JSON.stringify(result));
}
