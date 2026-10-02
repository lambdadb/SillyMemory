// Validate completed live evidence before comparing modes. No generation or judge calls.
import assert from 'node:assert/strict';
import { createBudget, LIMITS } from './benchmark-live-budget.mjs';
import { recordedSource } from './recorded-source.mjs';
import { PROVIDER_SPACING, summarizeProviderSpacing } from './provider-spacing.mjs';
const commonProducers = [
    'scripts/benchmark-live-pilot.mjs', 'scripts/benchmark-live-budget.mjs',
    'scripts/provider-retry.mjs', 'scripts/provider-spacing.mjs', 'scripts/benchmark-host-input.mjs',
    'scripts/benchmark-live-network.cjs', 'scripts/benchmark-audit.mjs', 'index.js', 'manifest.json',
    'src/memory.js', 'src/context.js', 'src/client.js', 'src/gate.js', 'src/delivery.js', 'src/status.js',
];
export function parseJudgeResponse(response) {
    assert(typeof response === 'string' && /^(yes|no)\.?$/i.test(response.trim()), 'Ambiguous judge response');
    return /^yes\.?$/i.test(response.trim());
}

export function validateProvenance(report, plan, { initial = false } = {}) {
    assert.equal(report.sourceSha256, plan.sourceSha256, 'Dataset lock differs from frozen plan');
    const required = initial ? commonProducers : [...commonProducers, 'scripts/three-mode-native.mjs'];
    assert.deepEqual(Object.keys(report.sourceSha256ByFile || {}).sort(), [...required].sort(), 'Complete producer map required');
    for (const file of required) recordedSource(file, report.sourceSha256ByFile[file]);
}
export function validateLivePilot(report, plan) {
    validateProvenance(report, plan);
    assert.equal(report.version, 'longmemeval-live-pilot-v1');
    assert(report.passed && report.cleanup, 'Incomplete execution or cleanup');
    assert.equal(report.failure, undefined); assert.deepEqual(report.errors, []);
    assert.deepEqual(report.limits, LIMITS); assert.deepEqual(report.providerSpacing, PROVIDER_SPACING);
    assert.equal(report.traffic.hostBlocked, 0); assert.equal(report.traffic.browserBlocked, 0);
    assert.equal(report.hostRevision, plan.hostRevision); assert.deepEqual(report.generator, plan.generator);
    assert.equal(report.judge, 'gpt-4o-2024-08-06');
    assert.equal(report.scorerRevision, '9e0b455f4ef0e2ab8f2e582289761153549043fc');
    assert.equal(report.scorerSha256, 'ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251');
    const expected = plan.cases.flatMap(c => Object.keys(plan.arms).map(mode => `${c.id}/${plan.pilotContext}/${mode}`)).sort();
    assert.deepEqual(report.rows.map(r => `${r.id}/${r.context}/${r.mode}`).sort(), expected, 'Complete unique matrix required');
    assert.deepEqual(report.availability.map(x => x.model).sort(), [plan.generator.model, report.judge, 'text-embedding-3-small'].sort());
    assert(report.availability.every(x => x.status === 200));
    const ownedCount = report.continuation ? 4 : 2;
    assert(report.owned.length === ownedCount && report.cleanupResults.remote.length === ownedCount);
    assert(report.cleanupResults.remote.every(r => r.inaccessible && report.owned.some(o => o.collection === r.collection)));
    assert.equal(new Set(report.cleanupResults.remote.map(r => r.collection)).size, ownedCount);
    assert.equal(report.cleanupResults.native.length, 2);
    assert(report.cleanupResults.native.every(r => r.purgeStatus === 200 && r.listStatus === 200 && r.remaining.length === 0));
    assert.equal(report.summaries.length, plan.cases.length);
    for (const summary of report.summaries) {
        assert.equal(summary.context, plan.pilotContext);
        assert.equal(summary.calls, summary.steps.length);
        assert(summary.calls > 0 && summary.calls <= plan.cases.find(c => c.id === summary.id).automaticSummaryCallCap);
        const calls = report.generations.filter(g => g.stage === `${summary.id}/${summary.context}/summary/summary-replay`);
        assert.equal(calls.length, summary.calls);
        for (const [i, step] of summary.steps.entries()) {
            assert.equal(step.promptSha256, calls[i].promptSha256);
            assert.equal(step.storedAt, step.triggerMessage - 1);
            assert.equal(step.outputCap, 1024);
            if (i) assert(step.previousSummaryIncluded && step.triggerMessage > summary.steps[i - 1].triggerMessage);
        }
    }
    for (const row of report.rows) {
        const sample = plan.cases.find(c => c.id === row.id), phase = `${row.id}/${row.context}/${row.mode}`;
        assert.equal(row.inputSha256, sample.inputSha256); assert.equal(row.sourceMessages, sample.sourceMessages);
        assert(row.questionDelivered);
        if (row.recoveredFromIdenticalPrompt) {
            assert(report.continuation && row.id === 'eeda8a6d_abs' && row.mode === 'vectors');
            const baseline = report.rows.find(r => r.id === row.id && r.mode === 'off');
            assert.equal(row.promptSha256, baseline.promptSha256);
            assert.equal(row.recoveredFromIdenticalPrompt, baseline.promptSha256);
            assert.equal(row.hostPromptTokens, null); assert.equal(row.sourcePreserved, null);
            for (const key of ['nativeSourceIndexes', 'exactNativeRoleMessages', 'exactTextMessages', 'finalMessages', 'finalContentTokenEstimate']) assert.deepEqual(row[key], baseline[key]);
        } else { assert(row.sourcePreserved); assert(row.hostPromptTokens > 0 && row.hostPromptTokens <= row.hostPromptBudget); }
        assert.equal(row.hostPromptBudget, row.context - 1024);
        const calls = report.generations.filter(g => g.stage === phase), judges = report.generations.filter(g => g.stage === phase + '/judge');
        assert.equal(calls.length, 1); assert.equal(judges.length, 1);
        assert.equal(calls[0].answer, row.answer); assert.deepEqual(calls[0].usage, row.usage);
        assert.equal(calls[0].promptSha256, row.promptSha256);
        assert.equal(judges[0].answer, row.judge.response); assert.equal(judges[0].promptSha256, row.judge.promptSha256);
        assert.equal(row.judge.correct, parseJudgeResponse(row.judge.response));
        assert(row.judge.exactYesNo && /^(yes|no)\.?$/i.test(row.judge.response.trim()), 'Ambiguous judge response');
        if (row.mode === 'off') assert(row.exactNativeRoleMessages < row.sourceMessages);
        if (row.mode === 'vectors') { assert(row.nativeDocuments > 0); assert(row.nativePromptDelivered || row.nativeNoInjection); }
        if (row.mode === 'summary') assert(row.summaryDelivered);
        if (row.mode === 'sillymemory') {
            assert(row.memoryDocuments > 0);
            const delivery = /^Final host prompt: (\d+)\/(\d+) memory passages and (\d+)\/(\d+) recent messages verified\. Provider receipt is not checked\.$/.exec(row.delivery);
            assert(delivery && Number(delivery[1]) > 0, 'SillyMemory must actually deliver memory');
            assert.equal(delivery[1], delivery[2]); assert.equal(delivery[3], '12'); assert.equal(delivery[4], '12');
        }
    }
    assert.equal(report.generations.length, 16 + report.summaries.reduce((n, s) => n + s.calls, 0));
    const attempts = report.generations.flatMap(g => g.attempts);
    assert.equal(attempts.length, report.retryBudget.calls); assert(attempts.length <= 125);
    assert.equal(attempts.length - report.generations.length, report.retryBudget.retries);
    assert(report.retryBudget.retries <= 8);
    const reconstructed = createBudget();
    for (const g of report.generations) {
        assert.equal(g.model, g.stage.endsWith('/judge') ? report.judge : plan.generator.model);
        for (const attempt of g.attempts) reconstructed.completion(g.model);
        assert.equal(g.status, 200); assert.equal(g.finishReason, 'stop');
        assert(g.attempts.length > 0 && g.attempts.length <= 3);
        assert.equal(new Set(g.attempts.map(a => a.requestSha256)).size, 1);
        assert(g.attempts.slice(0, -1).every(a => [500, 502, 503, 504].includes(a.status)));
        assert.equal(g.attempts.at(-1).status, 200);
        assert(typeof g.answer === 'string' && g.answer.length > 0);
        assert(g.usage.prompt_tokens > 0 && g.usage.completion_tokens > 0);
        assert.equal(g.usage.total_tokens, g.usage.prompt_tokens + g.usage.completion_tokens);
        const cached = g.usage.prompt_tokens_details?.cached_tokens || 0;
        assert(Number.isInteger(cached) && cached >= 0 && cached <= g.usage.prompt_tokens);
        assert(g.usage.prompt_tokens <= (g.stage.endsWith('/judge') ? 4096 : 32768));
        assert(g.usage.completion_tokens <= (g.stage.endsWith('/judge') ? 10 : 1024));
    }
    assert.equal(report.budget.completions, attempts.length);
    for (const [key, limit] of Object.entries(LIMITS)) if (key in report.budget) assert(report.budget[key] <= limit);
    assert(report.budget.openaiReservedUsd <= LIMITS.openaiUsd);
    assert(report.embeddings.length > 0 && report.embeddings.every(e => e.status === 200 && e.usage.total_tokens > 0));
    assert.equal(report.embeddings.length, report.budget.embeddingCalls);
    assert.equal(report.embeddings.reduce((n, e) => n + e.inputs, 0), report.budget.embeddingInputs);
    for (const e of report.embeddings) {
        assert(e.usage.total_tokens <= e.reservedTokens); reconstructed.embedding(e.inputs, e.reservedTokens);
    }
    assert(Math.abs(reconstructed.state.openaiReservedUsd - report.budget.openaiReservedUsd) < 1e-9);
    assert.equal(reconstructed.state.embeddingTokens, report.budget.embeddingTokens);
    const runs = [...new Set(report.generations.map(g => g.run))];
    assert.deepEqual(runs, report.continuation ? [0, 1] : [0]);
    const spacing = runs.map(run => ({ run, ...summarizeProviderSpacing(report.generations.filter(g => g.run === run), report.providerSpacing) }));
    if (report.continuation) assert(Date.parse(report.startedAt) - Date.parse(report.continuation.priorFinishedAt) >= 15000);
    assert.deepEqual(spacing, report.spacing);
    const cost = records => records.reduce((sum, r) => {
        const judge = r.model === report.judge, u = r.usage, cached = u.prompt_tokens_details?.cached_tokens || 0;
        return sum + ((u.prompt_tokens - cached) * (judge ? 2.5 : .4) + cached * (judge ? 1.25 : .1) + u.completion_tokens * (judge ? 10 : 1.6)) / 1e6;
    }, 0);
    return { rows: report.rows.map(r => ({ id: r.id, mode: r.mode, correct: r.judge.correct, promptTokens: r.usage.prompt_tokens, completionTokens: r.usage.completion_tokens })),
        automaticSummaries: report.summaries.reduce((n, s) => n + s.calls, 0), attempts: attempts.length,
        spacing, openaiUsageCostUsd: { answers: cost(report.generations.filter(g => !g.stage.endsWith('/judge') && !g.stage.endsWith('/summary-replay'))),
            summaries: cost(report.generations.filter(g => g.stage.endsWith('/summary-replay'))),
            judges: cost(report.generations.filter(g => g.stage.endsWith('/judge'))),
            nativeEmbeddings: report.embeddings.reduce((n, e) => n + e.usage.total_tokens * .02 / 1e6, 0) },
        costBoundary: 'Returned usage at recorded prices; excludes unreported failed-attempt charges, LambdaDB usage and taxes. Reservations are separate.' };
}

export function validateContinuation(report, previous) {
    assert.equal(previous.passed, false); assert.equal(previous.cleanup, true);
    assert.equal(previous.failure.stage, 'eeda8a6d_abs/32768/vectors');
    assert.equal(previous.rows.length, 5); assert.equal(previous.generations.length, 60);
    assert.deepEqual(report.continuation.failure, previous.failure);
    assert.deepEqual(report.continuation.errors, previous.errors);
    assert.equal(report.continuation.priorFinishedAt, previous.finishedAt);
    assert.deepEqual(report.rows.slice(0, 5), previous.rows, 'Previously successful observations cannot change');
    assert.deepEqual(report.generations.slice(0, 60), previous.generations.map(g => ({ ...g, run: 0 })), 'Previously successful calls cannot change');
    assert.deepEqual(report.embeddings, previous.embeddings, 'No native reindexing in recovery');
    assert.deepEqual(report.summaries[0], previous.summaries[0]);
    assert.deepEqual(report.cleanupResults.native, previous.cleanupResults.native);
    assert.deepEqual(report.cleanupResults.remote.slice(0, 2), previous.cleanupResults.remote);
}

// CLI rechecks producer/source provenance before writing a derived summary.
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
    const { readFile, writeFile } = await import('node:fs/promises');
    const { sha } = await import('./benchmark-audit.mjs');
    const { recordedSource } = await import('./recorded-source.mjs');
    const [input, output] = process.argv.slice(2);
    assert(input && process.argv.length <= 4, 'Usage: benchmark-live-results.mjs <report.json> [new-summary.json]');
    const bytes = await readFile(input), report = JSON.parse(bytes);
    const planBytes = await readFile(new URL('../docs/benchmarks/pilot-design-v1.json', import.meta.url));
    assert.equal(report.planSha256, sha(planBytes));
    assert.equal(report.preflightSha256, sha(await readFile(new URL('../docs/benchmarks/host-preflight-v1.json', import.meta.url))));
    validateProvenance(report, JSON.parse(planBytes));
    if (report.continuation) {
        const priorBytes = await readFile(new URL('../docs/benchmarks/live-pilot-interrupted-v1.json', import.meta.url));
        assert.equal(report.continuation.reportSha256, sha(priorBytes));
        const prior = JSON.parse(priorBytes);
        validateProvenance(prior, JSON.parse(planBytes), { initial: true });
        validateContinuation(report, prior);
    }
    const result = { reportSha256: sha(bytes), ...validateLivePilot(report, JSON.parse(planBytes)) };
    const text = JSON.stringify(result, null, 2) + '\n';
    if (output) await writeFile(output, text, { flag: 'wx' });
    else console.log(text);
}
