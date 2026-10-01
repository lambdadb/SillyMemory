// No model calls, credentials or held-out input adaptation. Derive a finite
// schedule from the previously frozen development split, without answer labels.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sha, readVerifiedFile, hostRevision } from './benchmark-audit.mjs';
import { prepareDevelopmentCase } from './benchmark-development-input.mjs';
export function developmentPlan(selection, data, pilot, hashes) {
    const samples = selection.samples.filter(s => s.split === 'development');
    assert.equal(samples.length, 14);
    const cases = samples.map(sample => {
        const input = prepareDevelopmentCase(data[sample.sourceIndex], sample);
        assert(!input.chat.some(m => /\{\{|<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/i.test(m.mes)), 'Macro-bearing input requires a new adaptation contract');
        return { ...sample, originalInputSha256: input.originalInputSha256, inputSha256: input.inputSha256, literalizedMessages: input.literalizedMessages, sourceMessages: input.chat.length, automaticSummaryCallCap: Math.ceil(input.chat.length / 10) + 2,
            emptyMessages: input.chat.filter(m => !m.mes.trim()).length,
            memoryDocuments: input.chat.slice(0, -12).reduce((n, m) => n + Math.ceil(Array.from(m.mes).length / 800), 0) };
    });
    const tasks = cases.flatMap(c => [...Object.keys(pilot.arms).map(mode => ({ id: `${c.id}/32768/${mode}`, caseId: c.id, context: 32768, mode,
        reusePilot: pilot.cases.some(s => s.id === c.id && s.inputSha256 === c.inputSha256) })), { id: `${c.id}/131072/off`, caseId: c.id, context: 131072, mode: 'off', reusePilot: false }]);
    const fresh = tasks.filter(t => !t.reusePilot), summaryCases = cases.filter(c => fresh.some(t => t.caseId === c.id && t.mode === 'summary'));
    const summaryCalls = summaryCases.reduce((n, c) => n + c.automaticSummaryCallCap, 0);
    const newAnswers = fresh.length, newJudges = fresh.length, extraAttempts = 16;
    const controls = fresh.filter(t => t.context === 131072).length;
    const maxOpenaiUsd = (newAnswers - controls + summaryCalls) * (32768 * .4 + 1024 * 1.6) / 1e6
        + (controls + extraAttempts) * (131072 * .4 + 1024 * 1.6) / 1e6 + newJudges * (4096 * 2.5 + 10 * 10) / 1e6 + .10;
    return { version: 'longmemeval-development-plan-v1', adaptation: 'uniform-host-macro-literalization-v1', ...hashes, hostRevision,
        generator: pilot.generator, judge: { model: 'gpt-4o-2024-08-06', temperature: 0, maxOutputTokens: 10 },
        arms: pilot.arms, cases, tasks,
        frozenOrder: 'selection order; 32K off/vectors/summary/sillymemory, then 128K off',
        timestampPolicy: 'Preserve released order and exact dates; report audit flags without removing or correcting source turns.',
        pilotReuse: 'Reuse only recorded 32K rows with matching input/runtime/settings. Preserve the native recovered-observation limitation.',
        newAnswers, newJudges, maxSummaryCalls: summaryCalls,
        limits: { completionAttempts: newAnswers + newJudges + summaryCalls + extraAttempts, extraAttempts,
            openaiUsd: Math.ceil(maxOpenaiUsd), nativeEmbeddingCalls: 10000, nativeEmbeddingInputs: 40000, nativeEmbeddingTokens: 5000000,
            lambdaRequests: 3000, lambdaDocuments: 30000, lambdaTokens: 5000000, lambdaWriteBytes: 100000000, collections: 30 },
        minimumProviderStartIntervalMs: 15000,
        minimumDispatchMinutesAtSummaryCap: (newAnswers + newJudges + summaryCalls - 1) * 15 / 60,
        estimateBoundary: 'Conservative per-call reservations, no cache/free-quota assumptions. Not an exact LambdaDB billing ceiling; host preflight must pass first.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [cache, output] = process.argv.slice(2); assert(cache && output && process.argv.length === 4);
    const read = f => readFile(new URL(`../docs/benchmarks/${f}`, import.meta.url));
    const selection = await read('selection-v1.json'), lock = await read('sources-v1.json'), pilot = await read('pilot-design-v1.json');
    const data = readVerifiedFile(cache, JSON.parse(lock).files.find(f => f.dataset === 'longmemeval'));
    const plan = developmentPlan(JSON.parse(selection), data, JSON.parse(pilot), { selectionSha256: sha(selection), sourceSha256: sha(lock), pilotPlanSha256: sha(pilot) });
    await writeFile(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ cases: plan.cases.length, tasks: plan.tasks.length, newAnswers: plan.newAnswers, maxSummaries: plan.maxSummaryCalls, limits: plan.limits, minimumDispatchMinutesAtSummaryCap: plan.minimumDispatchMinutesAtSummaryCap }));
}
