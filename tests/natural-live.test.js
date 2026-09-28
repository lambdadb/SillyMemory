import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyNaturalPlan } from '../scripts/natural-eval.mjs';
import { hash, loadNaturalFixture, naturalCases, naturalSchedule } from '../scripts/natural-dialogue.mjs';
import { summarizeNatural, blindNaturalReview, scoreNaturalAnnotations } from '../scripts/natural-summary.mjs';

function reportFixture() {
    const fixture = loadNaturalFixture(), cases = new Map(naturalCases().map(c => [c.id, c]));
    const rows = naturalSchedule().map((sample, index) => ({ ...sample, chatId: `chat-${index}`, language: cases.get(sample.case).language, kind: cases.get(sample.case).kind, answer: 'Synthetic answer, deliberately ungraded.', memoryTokens: 0, requiredEvidence: cases.get(sample.case).rubric.requiredEvidence.map(e => ({ message: e.message, inMemory: false, inPrompt: true })), supersededEvidence: cases.get(sample.case).rubric.supersededEvidence.map(e => ({ message: e.message, inMemory: false, inPrompt: true })), baselineTruncated: false, syncMs: 1, retrievalMs: sample.mode === 'on' ? 2 : null, generationMs: 3, usage: { prompt_tokens: 100, completion_tokens: 10 } }));
    const sourceSha256 = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`test-file-${i}`, 'a'.repeat(64)]));
    return { sillyTavern: '06bde939fb1e9c4c8d8641d810f0a916b5bce127', passed: true, cleanupComplete: true, nativeCleanupComplete: true, model: fixture.generation.model, hostContextTokens: fixture.settings.context, providerCalls: 64, initialSourceSha256: sourceSha256, sourceSha256: structuredClone(sourceSha256), evaluation: { version: fixture.version, complete: true, fixtureHash: hash(fixture), planSha256: 'b'.repeat(64), settings: fixture.settings, generation: fixture.generation, rows }, generations: rows.map(row => ({ naturalSampleId: row.id, upstreamStatus: 200, attempts: [{ status: 200 }], finishReason: 'stop', providerAnswer: row.answer, answer: row.answer, requestOptions: { temperature: 0, model: fixture.generation.model }, maxOutputTokens: 256 })), lambdaRequests: [{ stage: 'cleanup', method: 'GET', path: '/collections/synthetic-owned', status: 404 }] };
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
