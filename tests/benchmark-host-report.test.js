import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha } from '../scripts/benchmark-audit.mjs';
import { recordedSource } from '../scripts/recorded-source.mjs';

test('host preflight report binds the complete matrix to its actual producer and frozen pilot', async () => {
    const read = file => readFile(new URL(`../${file}`, import.meta.url));
    const report = JSON.parse(await read('docs/benchmarks/host-preflight-v1.json'));
    const planBytes = await read('docs/benchmarks/pilot-design-v1.json'), plan = JSON.parse(planBytes);
    assert.equal(report.planSha256, sha(planBytes));
    assert.equal(report.sourceSha256, plan.sourceSha256);
    assert.equal(report.hostRevision, plan.hostRevision);
    for (const [file, hash] of Object.entries(report.sourceSha256ByFile)) recordedSource(file, hash);
    assert.equal(report.passed, true); assert.equal(report.cleanup, true);
    assert.deepEqual(report.errors, []); assert.equal(report.failure, undefined);
    assert.equal(report.traffic.hostBlocked, 0); assert.equal(report.traffic.browserBlocked, 0);
    const expected = plan.cases.flatMap(c => plan.offlinePreflightContexts.flatMap(context =>
        Object.keys(plan.arms).map(mode => `${c.id}/${context}/${mode}`))).sort();
    assert.deepEqual(report.rows.map(r => `${r.id}/${r.context}/${r.mode}`).sort(), expected);
    for (const row of report.rows) {
        const source = plan.cases.find(c => c.id === row.id);
        assert.equal(row.inputSha256, source.inputSha256);
        assert.equal(row.sourceMessages, source.sourceMessages);
        assert(row.sourcePreserved && row.questionDelivered);
        assert.equal(row.hostPromptBudget, row.context - plan.generator.maxOutputTokens);
        assert(row.hostPromptTokens > 0 && row.hostPromptTokens <= row.hostPromptBudget);
        assert.match(row.tokenObservation, /^Non-dry-run CHAT_COMPLETION_PROMPT_READY;/);
        if (row.mode === 'off' && row.context === 131072) assert.equal(row.exactNativeRoleMessages, row.sourceMessages);
        if (row.mode === 'off' && row.context === 32768) assert(row.exactNativeRoleMessages < row.sourceMessages);
        if (row.mode === 'vectors') assert(row.nativePromptDelivered && row.nativeDocuments > 0);
        if (row.mode === 'summary') assert(row.summaryDelivered);
        if (row.mode === 'sillymemory') { assert(row.memoryDocuments > 0); assert.match(row.delivery, /^Final host prompt:/); }
    }
    assert.equal(report.summaries.length, 4);
    for (const summary of report.summaries) {
        assert.equal(summary.calls, summary.steps.length);
        assert(summary.calls > 0 && summary.calls <= plan.cases.find(c => c.id === summary.id).automaticSummaryCallCap);
        for (const [i, step] of summary.steps.entries()) {
            assert.equal(step.outputCap, plan.generator.maxOutputTokens);
            assert.equal(step.storedAt, step.triggerMessage - 1);
            if (i) { assert(step.previousSummaryIncluded); assert(step.triggerMessage > summary.steps[i - 1].triggerMessage); }
        }
    }
    assert(report.probes.importedEmptyPreserved && !report.probes.emptyInOutgoing);
    assert(report.probes.macroExpandedByHost && report.probes.macroChangedStoredSourceAfterGeneration);
    assert(report.probes.pilotMacroSpellings.every(c => c.messages === 0));
    assert.equal(report.traffic.completions, 1 + report.rows.length + report.summaries.reduce((n, s) => n + s.calls, 0));
});
