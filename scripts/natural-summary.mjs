// Integrity/measurement summary and blinded human-review packet; no lexical grading.
import assert from 'node:assert/strict';
import { CANDIDATE_MODES, candidateEvidence } from './context-candidate.mjs';
import { ABLATION_MODES, ablationPromptEvidence } from './actor-ablation.mjs';
import { actorPromptEvidence } from './actor-perspective.mjs';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NATURAL_RETRY } from './provider-retry.mjs';
import { summarizeProviderSpacing } from './provider-spacing.mjs';
import { hash, loadNaturalFixture, naturalCases, naturalSchedule } from './natural-dialogue.mjs';

const distribution = values => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), n = sorted.length;
    return n ? { n, median: (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2, min: sorted[0], max: sorted[n - 1] } : null;
};
export function summarizeNatural(report) {
    assert(report.passed === true && !report.failure && !report.incomplete, 'A successful complete integrity report is required');
    assert(report.cleanupComplete === true && report.nativeCleanupComplete === true, 'Verified cleanup is required');
    const evaluation = report.evaluation, fixture = loadNaturalFixture(evaluation?.version), schedule = naturalSchedule(fixture), cases = new Map(naturalCases(fixture).map(item => [item.id, item]));
    assert.equal(report.sillyTavern, '06bde939fb1e9c4c8d8641d810f0a916b5bce127', 'Wrong host revision');
    assert.equal(evaluation?.version, fixture.version, 'Wrong evaluation version');
    assert(evaluation?.complete === true, 'Incomplete natural evaluation');
    assert.equal(evaluation.fixtureHash, hash(fixture), 'Fixture mismatch');
    assert.deepEqual(evaluation.settings, fixture.settings); assert.deepEqual(evaluation.generation, fixture.generation);
    assert.equal(evaluation.rows.length, schedule.length); assert.equal(report.generations.length, schedule.length);
    const retryEnabled = report.transportProtocol != null;
    if (retryEnabled) {
        assert.deepEqual(report.transportProtocol, NATURAL_RETRY, 'Unknown retry protocol');
        for (const file of ['scripts/provider-retry.mjs', 'docs/natural-dialogue-retry.md']) assert(/^[a-f0-9]{64}$/.test(report.initialSourceSha256?.[file]), 'Missing retry source identity');
    }
    const attemptCount = report.generations.reduce((count, generation) => count + generation.attempts.length, 0);
    assert.equal(report.providerCalls, attemptCount, 'Provider ledger mismatch');
    assert(attemptCount >= schedule.length && attemptCount <= schedule.length + (retryEnabled ? NATURAL_RETRY.maxRetriesPerRun : 0), 'Retry run bound exceeded');
    assert.equal(report.model, fixture.generation.model); assert.equal(report.hostContextTokens, fixture.settings.context);
    assert(report.initialSourceSha256 && Object.keys(report.initialSourceSha256).length >= 11, 'Missing initial source identity');
    for (const [file, digest] of Object.entries(report.initialSourceSha256)) assert.equal(report.sourceSha256[file], digest, 'Source changed during execution');
    assert.equal(new Set(evaluation.rows.map(row => row.chatId)).size, schedule.length, 'Chat identities must be isolated');
    for (const [i, sample] of schedule.entries()) {
        const row = evaluation.rows[i], generation = report.generations[i];
        const item = cases.get(sample.case);
        assert.equal(row.language, item.language); assert.equal(row.kind, item.kind);
        assert.deepEqual(row.requiredEvidence.map(e => e.message), item.rubric.requiredEvidence.map(e => e.message));
        assert.deepEqual(row.supersededEvidence.map(e => e.message), item.rubric.supersededEvidence.map(e => e.message));
        for (const key of ['id', 'case', 'repetition', 'mode']) assert.equal(row[key], sample[key], 'Wrong sample order or identity');
        assert.equal(generation.naturalSampleId, row.id); assert.equal(generation.upstreamStatus, 200);
        assert(generation.attempts.length >= 1 && generation.attempts.length <= (retryEnabled ? 1 + NATURAL_RETRY.maxRetriesPerSample : 1), 'Sample retry bound exceeded');
        assert.equal(generation.attempts.at(-1).status, 200, 'Last attempt must succeed');
        for (const [j, attempt] of generation.attempts.entries()) {
            if (retryEnabled) {
                assert.equal(attempt.number, j + 1); assert(!attempt.failure);
                assert(/^[a-f0-9]{64}$/.test(attempt.requestSha256));
                assert.equal(attempt.requestSha256, generation.attempts[0].requestSha256, 'Retry request body changed');
                assert(Number.isFinite(attempt.elapsedMs) && attempt.elapsedMs >= 0);
            }
            if (j < generation.attempts.length - 1) {
                assert(retryEnabled && NATURAL_RETRY.statuses.includes(attempt.status), 'Ineligible retry');
                assert(attempt.retryWaitMs >= NATURAL_RETRY.baseDelayMs * 2 ** j && attempt.retryWaitMs <= NATURAL_RETRY.maxDelayMs, 'Invalid retry delay');
            }
        }
        if (['long-dialogue-v1', 'assistant-fallback-v1'].includes(fixture.version)) {
            assert(row.sourceTokens > fixture.settings.context, 'Long source must exceed host context');
            if (row.mode === 'off') assert(row.baselineTruncated && Number.isInteger(row.sourceMessagesPresent) && row.sourceMessagesPresent >= 0 && row.sourceMessagesPresent < item.input.source.length, 'Long baseline must prove actual truncation');
        }
        if (fixture.version === 'actor-perspective-v1') {
            assert.deepEqual(row.actorEvidence, actorPromptEvidence(item, row.mode, generation.messages), 'Actor prompt evidence changed');
        }
        if (fixture.version === 'actor-candidate-v1') {
            assert.deepEqual(row.candidateEvidence, candidateEvidence(item, fixture, row.mode, row.candidateSelection, generation.messages));
            assert.deepEqual(row.requiredEvidence, row.candidateEvidence.requiredEvidence);
            assert.deepEqual(row.supersededEvidence, row.candidateEvidence.supersededEvidence);
            assert.equal(row.sourceHash, hash(item.input.source.map(m => ({ text: m.mes, user: m.is_user, name: m.name }))));
            assert.equal(row.memoryTokens, row.candidateSelection.tokens);
            assert.equal(row.selectionHash, hash(row.candidateSelection));
            assert.equal(row.cohort, fixture.candidate.cohorts[item.id]);
        }
        if (fixture.version === 'actor-ablation-v1') {
            assert.deepEqual(row.ablationEvidence, ablationPromptEvidence(item, fixture, row.mode, generation.messages));
            assert.equal(row.selectionHash, hash(fixture.ablation.selections[item.id]), 'Frozen selection changed');
            assert.equal(row.memoryTokens, fixture.ablation.selections[item.id].labelledTokens);
        }
        assert.equal(generation.finishReason, 'stop');
        assert.equal(generation.providerAnswer.trim(), row.answer.trim(), 'Provider answer mismatch');
        assert.equal(generation.answer.trim(), row.answer.trim(), 'Saved host answer mismatch');
        assert(Number.isFinite(row.memoryTokens) && row.memoryTokens >= 0 && row.memoryTokens <= fixture.settings.budget);
        assert.equal(generation.requestOptions.temperature, fixture.generation.temperature);
        assert.equal(generation.requestOptions.model, fixture.generation.model);
        assert.equal(generation.maxOutputTokens, fixture.settings.maxOutputTokens);
    }
    if (report.initialSourceSha256['scripts/provider-spacing.mjs']) assert(report.providerSpacing, 'Missing provider spacing protocol');
    const providerSpacing = summarizeProviderSpacing(report.generations, report.providerSpacing);
    if (report.providerSpacing) assert(/^[a-f0-9]{64}$/.test(report.initialSourceSha256['scripts/provider-spacing.mjs']), 'Missing spacing source identity');
    const metrics = rows => ({ samples: rows.length, answerable: rows.filter(row => row.kind !== 'unknown').length, allRequiredInMemory: rows.filter(row => row.requiredEvidence.length && row.requiredEvidence.every(e => e.inMemory)).length, allRequiredInPrompt: rows.filter(row => row.requiredEvidence.length && row.requiredEvidence.every(e => e.inPrompt)).length, oldWithoutCorrection: rows.filter(row => row.kind === 'correction' && row.supersededEvidence.some(e => e.inMemory) && !row.requiredEvidence.every(e => e.inMemory)).length, baselineTruncated: rows.filter(row => row.baselineTruncated).length, memoryTokens: distribution(rows.map(row => row.memoryTokens)), promptTokens: distribution(rows.map(row => row.usage?.prompt_tokens)), syncMs: distribution(rows.map(row => row.syncMs)), retrievalMs: distribution(rows.map(row => row.retrievalMs)), generationMs: distribution(rows.map(row => row.generationMs)) });
    const groups = [];
    for (const mode of (evaluation.version === 'actor-candidate-v1' ? CANDIDATE_MODES : evaluation.version === 'actor-ablation-v1' ? ABLATION_MODES : ['off', 'on'])) {
        groups.push({ mode, ...metrics(evaluation.rows.filter(row => row.mode === mode)) });
        for (const language of ['en', 'ko']) for (const kind of ['return', 'correction', 'reference', 'unknown']) groups.push({ mode, language, kind, ...metrics(evaluation.rows.filter(row => row.mode === mode && row.language === language && row.kind === kind)) });
    }
    const requests = report.lambdaRequests;
    assert(Array.isArray(requests) && requests.length > 0, 'Missing LambdaDB request evidence');
    const requestCounts = {};
    for (const request of requests) {
        assert(request.status || request.failed, 'Unfinished LambdaDB request');
        const operation = request.path.replace(/\/collections\/[^/]+/, '/collections/:collection');
        const key = `${request.stage === 'cleanup' ? 'cleanup' : request.stage.endsWith('/prepare') ? 'initial-sync' : request.stage.startsWith('natural/') ? 'generation' : 'setup'} ${request.method} ${operation} ${request.status || 'failed'}`;
        requestCounts[key] = (requestCounts[key] || 0) + 1;
    }
    const usageComplete = evaluation.rows.every(row => Number.isFinite(row.usage?.prompt_tokens) && Number.isFinite(row.usage?.completion_tokens));
    return { version: fixture.version, integrityPassed: true, providerSpacing, reportHash: hash(report), fixtureHash: evaluation.fixtureHash, planSha256: evaluation.planSha256, samples: schedule.length, providerAttempts: report.providerCalls, transportProtocol: report.transportProtocol ?? null, firstAttemptFailures: report.generations.filter(g => g.attempts[0].status !== 200).length, recoveredSamples: report.generations.filter(g => g.attempts.length > 1).length, extraAttempts: attemptCount - schedule.length, failedAttemptUsage: attemptCount > schedule.length ? null : { attempts: 0 }, groups, requestCounts, providerUsage: usageComplete ? { promptTokens: evaluation.rows.reduce((n, row) => n + row.usage.prompt_tokens, 0), completionTokens: evaluation.rows.reduce((n, row) => n + row.usage.completion_tokens, 0) } : null, managedEmbeddingUsage: null, managedEmbeddingCost: null, semanticQualityGate: null, scoringStatus: 'Pending blinded human semantic review; retrieval is not answer correctness' };
}

export function blindNaturalReview(report) {
    const summary = summarizeNatural(report), cases = new Map(naturalCases(loadNaturalFixture(report.evaluation.version)).map(item => [item.id, item]));
    const records = report.evaluation.rows.map(row => ({ reviewId: randomUUID(), row })).sort((a, b) => a.reviewId.localeCompare(b.reviewId));
    return {
        packet: { version: 'natural-human-review-v1', reportHash: summary.reportHash, reviewer: null, reviewerType: 'human', records: records.map(({ reviewId, row }) => { const item = cases.get(row.case); return { reviewId, question: item.input.question, source: item.input.source.map(m => ({ speaker: m.name, text: m.mes })), rubric: item.rubric, answer: row.answer, outcome: null, unsupportedAssertion: null, rationale: null }; }) },
        key: { reportHash: summary.reportHash, records: records.map(({ reviewId, row }) => ({ reviewId, sampleId: row.id })) },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    const [input, flag, directory] = process.argv.slice(2);
    assert(input && flag === '--output-dir' && directory && process.argv.length === 5, 'Usage: node scripts/natural-summary.mjs report.json --output-dir artifacts/new-review');
    const report = JSON.parse(readFileSync(input, 'utf8')), summary = summarizeNatural(report), { packet, key } = blindNaturalReview(report);
    // An existing directory must not silently overwrite finalized human annotations.
    await mkdir(path.resolve(directory));
    for (const [name, value] of [['summary', summary], ['blind-review', packet], ['review-key', key]]) await writeFile(path.join(directory, `${name}.json`), JSON.stringify(value, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ output: path.resolve(directory), samples: summary.samples, integrityPassed: true, semanticQualityGate: null }));
}

// Import assertions made by a reviewer; never infer semantic labels from text.
export function scoreNaturalAnnotations(report, packet, key) {
    const summary = summarizeNatural(report), cases = new Map(naturalCases(loadNaturalFixture(report.evaluation.version)).map(item => [item.id, item]));
    assert.equal(packet.reportHash, summary.reportHash); assert.equal(key.reportHash, summary.reportHash);
    assert(['human', 'assistant'].includes(packet.reviewerType) && typeof packet.reviewer === 'string' && packet.reviewer.trim(), 'Identify the reviewer and review type');
    const schedule = naturalSchedule(loadNaturalFixture(report.evaluation.version)), count = schedule.length;
    assert.equal(packet.records.length, count); assert.equal(key.records.length, count);
    assert.equal(new Set(key.records.map(r => r.reviewId)).size, count);
    assert.equal(new Set(key.records.map(r => r.sampleId)).size, count);
    assert.equal(new Set(packet.records.map(r => r.reviewId)).size, count);
    const keys = new Map(key.records.map(r => [r.reviewId, r.sampleId])), rows = new Map(report.evaluation.rows.map(r => [r.id, r]));
    const scored = packet.records.map(record => {
        const row = rows.get(keys.get(record.reviewId)); assert(row, 'Unknown review/sample identity');
        const item = cases.get(row.case);
        assert.equal(record.answer, row.answer, 'Reviewed answer changed'); assert.equal(record.question, item.input.question);
        assert.deepEqual(record.rubric, item.rubric); assert.deepEqual(record.source, item.input.source.map(m => ({ speaker: m.name, text: m.mes })));
        assert(['correct', 'partial', 'incorrect', 'abstained', 'unknown-handled'].includes(record.outcome), 'Incomplete or invalid semantic annotation');
        assert.equal(typeof record.unsupportedAssertion, 'boolean'); assert(typeof record.rationale === 'string' && record.rationale.trim(), 'Every score needs a rationale');
        assert(item.kind === 'unknown' ? ['unknown-handled', 'incorrect'].includes(record.outcome) : record.outcome !== 'unknown-handled', 'Outcome incompatible with case kind');
        assert(!(record.outcome === 'unknown-handled' && record.unsupportedAssertion), 'An unsupported guess cannot handle an unknown');
        return { id: row.id, case: row.case, language: row.language, kind: row.kind, mode: row.mode, repetition: row.repetition, outcome: record.outcome, unsupportedAssertion: record.unsupportedAssertion, rationale: record.rationale };
    });
    const pass = r => ['correct', 'unknown-handled'].includes(r.outcome) && !r.unsupportedAssertion;
    const groups = [];
    for (const mode of (report.evaluation.version === 'actor-candidate-v1' ? CANDIDATE_MODES : report.evaluation.version === 'actor-ablation-v1' ? ABLATION_MODES : ['off', 'on'])) for (const language of [null, 'en', 'ko']) for (const kind of language ? ['return', 'correction', 'reference', 'unknown'] : [null]) {
        const rows = scored.filter(r => r.mode === mode && (!language || r.language === language) && (!kind || r.kind === kind));
        groups.push({ mode, language, kind, samples: rows.length, passed: rows.filter(pass).length, outcomes: Object.fromEntries(['correct', 'partial', 'incorrect', 'abstained', 'unknown-handled'].map(outcome => [outcome, rows.filter(r => r.outcome === outcome).length])), unsupportedAssertions: rows.filter(r => r.unsupportedAssertion).length });
    }
    if (['actor-ablation-v1', 'actor-candidate-v1'].includes(report.evaluation.version)) {
        const contrasts = report.evaluation.version === 'actor-candidate-v1' ? [['current', 'raw'], ['raw', 'adjacent'], ['current', 'adjacent']] : [['full-raw', 'full-labelled'], ['sparse-raw', 'sparse-labelled'], ['full-raw', 'sparse-raw'], ['full-labelled', 'sparse-labelled']];
        const paired = contrasts.flatMap(([from, to]) => scored.filter(row => row.mode === from).map(before => {
            const after = scored.find(row => row.case === before.case && row.repetition === before.repetition && row.mode === to);
            assert(after, 'Missing ablation pair');
            const strictPassDelta = Number(pass(after)) - Number(pass(before));
            return { case: before.case, repetition: before.repetition, from, to, beforePassed: pass(before), afterPassed: pass(after), strictPassDelta };
        }));
        return { reportHash: summary.reportHash, reviewer: packet.reviewer, reviewerType: packet.reviewerType, semanticQualityGate: null, provisionalAssistantGate: null, diagnosticOnly: true, paired, groups, rows: scored.sort((a, b) => a.id.localeCompare(b.id)) };
    }
    const byId = new Map(scored.map(row => [row.id, row]));
    const paired = schedule.filter(sample => sample.mode === 'off').map(sample => {
        const off = byId.get(sample.id);
        const on = scored.find(row => row.case === sample.case && row.repetition === sample.repetition && row.mode === 'on');
        assert(off && on, 'Missing paired score');
        const strictPassDelta = Number(pass(on)) - Number(pass(off));
        const outcome = row => ({ id: row.id, outcome: row.outcome, unsupportedAssertion: row.unsupportedAssertion, passed: pass(row) });
        return { case: sample.case, repetition: sample.repetition, language: off.language, kind: off.kind, off: outcome(off), on: outcome(on), strictPassDelta, comparison: strictPassDelta > 0 ? 'improved' : strictPassDelta < 0 ? 'regressed' : 'tied' };
    });
    const pairedSummary = Object.fromEntries(['improved', 'tied', 'regressed'].map(result => [result, paired.filter(pair => pair.comparison === result).length]));
    const gate = scored.filter(r => r.mode === 'on').every(pass);
    return { reportHash: summary.reportHash, reviewer: packet.reviewer, reviewerType: packet.reviewerType, semanticQualityGate: packet.reviewerType === 'human' ? gate : null, provisionalAssistantGate: packet.reviewerType === 'assistant' ? gate : null, pairedSummary, paired, groups, rows: scored.sort((a, b) => a.id.localeCompare(b.id)) };
}
