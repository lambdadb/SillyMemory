import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROVIDER_SPACING } from '../scripts/provider-spacing.mjs';
import { NATURAL_RETRY } from '../scripts/provider-retry.mjs';
import { verifyNaturalPlan } from '../scripts/natural-eval.mjs';
import { hash, loadNaturalFixture, naturalCases, naturalSchedule } from '../scripts/natural-dialogue.mjs';
import { summarizeNatural, blindNaturalReview, scoreNaturalAnnotations } from '../scripts/natural-summary.mjs';

function reportFixture(version) {
    const fixture = loadNaturalFixture(version), cases = new Map(naturalCases(fixture).map(c => [c.id, c]));
    const rows = naturalSchedule(fixture).map((sample, index) => ({ ...sample, chatId: `chat-${index}`, language: cases.get(sample.case).language, kind: cases.get(sample.case).kind, answer: 'Synthetic answer, deliberately ungraded.', memoryTokens: 0, requiredEvidence: cases.get(sample.case).rubric.requiredEvidence.map(e => ({ message: e.message, inMemory: false, inPrompt: true })), supersededEvidence: cases.get(sample.case).rubric.supersededEvidence.map(e => ({ message: e.message, inMemory: false, inPrompt: true })), baselineTruncated: false, syncMs: 1, retrievalMs: sample.mode === 'on' ? 2 : null, generationMs: 3, usage: { prompt_tokens: 100, completion_tokens: 10 } }));
    const sourceSha256 = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`test-file-${i}`, 'a'.repeat(64)]));
    return { sillyTavern: '06bde939fb1e9c4c8d8641d810f0a916b5bce127', passed: true, cleanupComplete: true, nativeCleanupComplete: true, model: fixture.generation.model, hostContextTokens: fixture.settings.context, providerCalls: rows.length, initialSourceSha256: sourceSha256, sourceSha256: structuredClone(sourceSha256), evaluation: { version: fixture.version, complete: true, fixtureHash: hash(fixture), planSha256: 'b'.repeat(64), settings: fixture.settings, generation: fixture.generation, rows }, generations: rows.map(row => ({ naturalSampleId: row.id, upstreamStatus: 200, attempts: [{ status: 200 }], finishReason: 'stop', providerAnswer: row.answer, answer: row.answer, requestOptions: { temperature: 0, model: fixture.generation.model }, maxOutputTokens: 256 })), lambdaRequests: [{ stage: 'cleanup', method: 'GET', path: '/collections/synthetic-owned', status: 404 }] };
}

test('natural live adapter accepts a freshly frozen plan and rejects source, oracle and schedule tampering', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sm-natural-plan-'));
    try {
        const filename = path.join(dir, 'plan.json');
        const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/natural-dialogue.mjs', import.meta.url)), '--output', filename], { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        const original = JSON.parse(await readFile(filename));
        assert.equal((await verifyNaturalPlan(filename)).plan.schedule.length, 64);
        for (const mutate of [p => { p.sourceSha256['index.js'] = 'wrong'; }, p => { p.cases[0].rubric.answerRule = 'changed'; }, p => { p.schedule.reverse(); }]) {
            const plan = structuredClone(original); mutate(plan); await writeFile(filename, JSON.stringify(plan));
            await assert.rejects(verifyNaturalPlan(filename));
        }
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('natural aggregation rejects failed, partial, retried, duplicated, mismatched and mutated runs', () => {
    for (const mutate of [
        r => { r.passed = false; }, r => { r.failure = { reason: 'late secret audit' }; },
        r => { r.incomplete = true; }, r => { r.cleanupComplete = false; },
        r => { r.evaluation.complete = false; }, r => { r.evaluation.rows.pop(); },
        r => { r.providerCalls++; }, r => { r.generations[0].attempts.push({ status: 503 }); },
        r => { r.evaluation.rows[1].chatId = r.evaluation.rows[0].chatId; },
        r => { r.evaluation.rows.reverse(); }, r => { r.generations[0].providerAnswer = 'different'; },
        r => { r.generations[0].answer = 'different saved answer'; },
        r => { r.generations[0].finishReason = 'length'; },
        r => { r.evaluation.rows[0].memoryTokens = 801; },
        r => { r.sourceSha256['test-file-0'] = 'modified'; },
        r => { r.lambdaRequests[0].status = null; },
    ]) { const report = reportFixture(); mutate(report); assert.throws(() => summarizeNatural(report)); }
});

test('natural summary separates retrieval, usage, timing and pending human correctness', () => {
    const summary = summarizeNatural(reportFixture());
    assert.equal(summary.samples, 64); assert.equal(summary.semanticQualityGate, null);
    assert.equal(summary.managedEmbeddingUsage, null); assert.equal(summary.managedEmbeddingCost, null);
    assert.deepEqual(summary.providerUsage, { promptTokens: 6400, completionTokens: 640 });
    const off = summary.groups.find(g => g.mode === 'off' && !g.language);
    assert.equal(off.retrievalMs, null); assert.equal(off.allRequiredInMemory, 0);
    assert.equal(off.allRequiredInPrompt, 24);
    const missing = reportFixture(); missing.evaluation.rows[0].usage = null;
    assert.equal(summarizeNatural(missing).providerUsage, null);
    assert.equal(summary.providerSpacing.verified, false);
});

test('new natural reports must prove spacing for every actual provider send', () => {
    const report = reportFixture(); report.providerSpacing = PROVIDER_SPACING;
    report.initialSourceSha256['scripts/provider-spacing.mjs'] = 'a'.repeat(64);
    report.sourceSha256['scripts/provider-spacing.mjs'] = 'a'.repeat(64);
    for (const [i, generation] of report.generations.entries()) Object.assign(generation.attempts[0], { upstreamStartedMs: i * 15000, spacingWaitMs: 0 });
    assert.equal(summarizeNatural(report).providerSpacing.verified, true);
    delete report.providerSpacing;
    assert.throws(() => summarizeNatural(report), /Missing provider spacing protocol/);
    report.providerSpacing = PROVIDER_SPACING;
    report.generations[5].attempts[0].upstreamStartedMs--;
    assert.throws(() => summarizeNatural(report), /less than 15 seconds/);
});

test('semantic pairs preserve case and repetition across shuffled annotations and report losses', () => {
    const report = reportFixture(), { packet, key } = blindNaturalReview(report);
    packet.reviewer = 'Synthetic pair test'; packet.reviewerType = 'assistant';
    for (const record of packet.records) {
        record.outcome = record.rubric.requiredEvidence.length ? 'correct' : 'unknown-handled';
        record.unsupportedAssertion = false; record.rationale = 'Synthetic pair annotation.';
    }
    const set = (id, change) => Object.assign(packet.records.find(record => record.reviewId === key.records.find(k => k.sampleId === id).reviewId), change);
    set('en-workshop-return/r1/on', { unsupportedAssertion: true });
    set('en-workshop-return/r2/off', { outcome: 'partial' });
    set('en-observatory-unknown/r1/on', { outcome: 'incorrect', unsupportedAssertion: true });
    set('ko-workshop-return/r1/off', { outcome: 'incorrect' });
    set('ko-workshop-return/r1/on', { outcome: 'partial' }); // Both fail strict gate; no invented ordinal score.
    const result = scoreNaturalAnnotations(report, packet, key);
    assert.equal(result.semanticQualityGate, null);
    assert.equal(result.paired.length, 32);
    assert.equal(new Set(result.paired.map(p => `${p.case}/${p.repetition}`)).size, 32);
    assert.deepEqual(result.pairedSummary, { improved: 1, tied: 29, regressed: 2 });
    const loss = result.paired.find(p => p.case === 'en-workshop-return' && p.repetition === 1);
    assert.equal(loss.strictPassDelta, -1); assert.equal(loss.on.outcome, 'correct'); assert.equal(loss.on.unsupportedAssertion, true);
    const bothFail = result.paired.find(p => p.case === 'ko-workshop-return' && p.repetition === 1);
    assert.equal(bothFail.comparison, 'tied'); assert.equal(bothFail.off.outcome, 'incorrect'); assert.equal(bothFail.on.outcome, 'partial');
    packet.records.reverse(); key.records.reverse();
    assert.deepEqual(scoreNaturalAnnotations(report, packet, key).paired, result.paired);
    packet.reviewerType = 'human';
    assert.equal(scoreNaturalAnnotations(report, packet, key).semanticQualityGate, false);
});

test('blind review has no mode, repetition, retrieval evidence or automatic grades, and maps every answer once', () => {
    const report = reportFixture(), { packet, key } = blindNaturalReview(report);
    assert.equal(packet.records.length, 64); assert.equal(packet.reportHash, key.reportHash);
    assert.equal(new Set(key.records.map(r => r.sampleId)).size, 64);
    for (const record of packet.records) {
        assert.deepEqual(Object.keys(record).sort(), ['answer', 'outcome', 'question', 'rationale', 'reviewId', 'rubric', 'source', 'unsupportedAssertion'].sort());
        assert.equal(record.outcome, null); assert.equal(record.unsupportedAssertion, null);
        const sampleId = key.records.find(k => k.reviewId === record.reviewId).sampleId;
        assert.equal(record.answer, report.evaluation.rows.find(r => r.id === sampleId).answer);
    }
});


test('semantic import binds every annotation to its exact answer and distinguishes assistant from human review', () => {
    const report = reportFixture(), { packet, key } = blindNaturalReview(report);
    packet.reviewer = 'Test reviewer'; packet.reviewerType = 'assistant';
    assert.throws(() => scoreNaturalAnnotations(report, packet, key), /annotation/);
    for (const record of packet.records) {
        record.outcome = record.rubric.requiredEvidence.length ? 'correct' : 'unknown-handled';
        record.unsupportedAssertion = false; record.rationale = 'Test annotation, not an assessment of this synthetic answer.';
    }
    const assistant = scoreNaturalAnnotations(report, packet, key);
    assert.equal(assistant.semanticQualityGate, null); assert.equal(assistant.provisionalAssistantGate, true);
    packet.reviewerType = 'human'; assert.equal(scoreNaturalAnnotations(report, packet, key).semanticQualityGate, true);
    const answerable = packet.records.find(r => r.rubric.requiredEvidence.length);
    const savedAnswer = answerable.answer; answerable.answer = 'Changed';
    assert.throws(() => scoreNaturalAnnotations(report, packet, key), /answer changed/); answerable.answer = savedAnswer;
    key.records[0].sampleId = key.records[1].sampleId;
    assert.throws(() => scoreNaturalAnnotations(report, packet, key));
});


test('review CLIs export and import annotations without overwriting existing evidence', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sm-natural-cli-'));
    try {
        const reportFile = path.join(dir, 'report.json'), reviewDir = path.join(dir, 'review');
        await writeFile(reportFile, JSON.stringify(reportFixture()));
        const script = name => fileURLToPath(new URL(`../scripts/${name}.mjs`, import.meta.url));
        const exportArgs = [script('natural-summary'), reportFile, '--output-dir', reviewDir];
        assert.equal(spawnSync(process.execPath, exportArgs).status, 0);
        assert.notEqual(spawnSync(process.execPath, exportArgs).status, 0);
        const packetFile = path.join(reviewDir, 'blind-review.json'), packet = JSON.parse(await readFile(packetFile));
        packet.reviewer = 'Synthetic test reviewer'; packet.reviewerType = 'assistant';
        for (const r of packet.records) { r.outcome = r.rubric.requiredEvidence.length ? 'correct' : 'unknown-handled'; r.unsupportedAssertion = false; r.rationale = 'Synthetic test annotation.'; }
        await writeFile(packetFile, JSON.stringify(packet));
        const output = path.join(dir, 'score.json'), args = [script('natural-score'), reportFile, packetFile, path.join(reviewDir, 'review-key.json'), '--output', output];
        const imported = spawnSync(process.execPath, args, { encoding: 'utf8' }); assert.equal(imported.status, 0, imported.stderr);
        const result = await readFile(output, 'utf8'); assert.equal(JSON.parse(result).semanticQualityGate, null);
        assert.notEqual(spawnSync(process.execPath, args).status, 0); assert.equal(await readFile(output, 'utf8'), result);
    } finally { await rm(dir, { recursive: true, force: true }); }
});


test('amended reports expose first-attempt failures and accept only bounded same-request server retries', () => {
    const report = reportFixture(); report.transportProtocol = structuredClone(NATURAL_RETRY);
    for (const file of ['scripts/provider-retry.mjs', 'docs/natural-dialogue-retry.md']) { report.initialSourceSha256[file] = 'a'.repeat(64); report.sourceSha256[file] = 'a'.repeat(64); }
    for (const generation of report.generations) generation.attempts = [{ number: 1, status: 200, requestSha256: 'b'.repeat(64), elapsedMs: 10 }];
    report.generations[0].attempts[0].number = 2;
    report.generations[0].attempts.unshift({ number: 1, status: 500, requestSha256: 'b'.repeat(64), elapsedMs: 10, retryWaitMs: 15000 });
    report.providerCalls++;
    const summary = summarizeNatural(report);
    assert.equal(summary.firstAttemptFailures, 1); assert.equal(summary.recoveredSamples, 1); assert.equal(summary.extraAttempts, 1); assert.equal(summary.failedAttemptUsage, null);
    for (const mutate of [
        r => { r.generations[0].attempts[0].status = 429; },
        r => { r.generations[0].attempts[1].requestSha256 = 'c'.repeat(64); },
        r => { r.generations[0].attempts[0].retryWaitMs = 1; },
        r => { r.transportProtocol.maxRetriesPerRun = 100; },
        r => { r.providerCalls = 64; },
        r => { delete r.initialSourceSha256['docs/natural-dialogue-retry.md']; },
    ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => summarizeNatural(changed)); }
});

test('speaker fixture freezes 24 samples and uses its own oracle for paired review', async () => {
    const version = 'speaker-attribution-v1', fixture = loadNaturalFixture(version);
    assert.equal(naturalSchedule(fixture).length, 24);
    const originals = new Map(naturalCases().map(c => [c.id, c]));
    for (const item of naturalCases(fixture).slice(0, 2)) assert.deepEqual(item, originals.get(item.id));
    const report = reportFixture(version), { packet, key } = blindNaturalReview(report);
    assert.equal(packet.records.length, 24);
    packet.reviewer = 'Synthetic speaker test'; packet.reviewerType = 'assistant';
    for (const r of packet.records) { r.outcome = 'correct'; r.unsupportedAssertion = false; r.rationale = 'Synthetic annotation, not live quality.'; }
    const score = scoreNaturalAnnotations(report, packet, key);
    assert.equal(score.paired.length, 12); assert.equal(score.semanticQualityGate, null);
    assert.equal(score.provisionalAssistantGate, true);
    const dir = await mkdtemp(path.join(tmpdir(), 'sm-speaker-plan-'));
    try {
        const filename = path.join(dir, 'plan.json');
        const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/natural-dialogue.mjs', import.meta.url)), '--output', filename, '--fixture', version], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal((await verifyNaturalPlan(filename)).plan.version, version);
        const plan = JSON.parse(await readFile(filename)); plan.version = 'natural-dialogue-v1';
        await writeFile(filename, JSON.stringify(plan)); await assert.rejects(verifyNaturalPlan(filename));
        assert.throws(() => loadNaturalFixture('../../arbitrary'), /Unknown evaluation/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});
