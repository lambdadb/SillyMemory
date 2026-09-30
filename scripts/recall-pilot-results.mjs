// Rejected, focused pilots are evidence of an unsuccessful experiment, not a full cohort.
import assert from 'node:assert/strict';
import { loadLong, validateLong, longSchedule, hostSource, semanticPromptEvidence, sourceFiles, sha } from './semantic-long.mjs';
import { recordedSource } from './recorded-source.mjs';
import { verifySourcePresence } from './semantic-results.mjs';
import { summarizeProviderSpacing } from './provider-spacing.mjs';
import { NATURAL_RETRY } from './provider-retry.mjs';

export function verifyRecallPilot(report, planBytes, pilot) {
    const plan = JSON.parse(planBytes), fixture = validateLong(loadLong());
    assert.deepEqual(plan.caseIds, ['long-ko-quotation']);
    const cases = fixture.cases.filter(item => plan.caseIds.includes(item.id));
    const schedule = longSchedule(fixture).filter(sample => plan.caseIds.includes(sample.case));
    assert.deepEqual(plan.cases, cases); assert.deepEqual(plan.schedule, schedule);
    assert.deepEqual(plan.settings, fixture.settings); assert.deepEqual(plan.generation, fixture.generation);
    assert.equal(plan.fixtureSha256, sha(JSON.stringify(fixture)));
    assert.equal(report.evaluation.planSha256, sha(planBytes));
    for (const field of ['version', 'settings', 'generation', 'fixtureSha256']) assert.deepEqual(report.evaluation[field], plan[field]);
    assert(report.passed && !report.failure && !report.incomplete && report.evaluation.complete);
    assert.equal(report.embeddingMode, 'managed');
    assert.equal(report.sillyTavern, '06bde939fb1e9c4c8d8641d810f0a916b5bce127');
    assert.equal(report.model, fixture.generation.model); assert.equal(report.hostContextTokens, fixture.settings.context);
    // Authenticate every recorded input, including the four experimental harness files.
    assert.deepEqual(pilot.sourceSha256, report.sourceSha256);
    for (const file of [...sourceFiles, 'src/recall.js', 'src/delivery.js']) assert(report.initialSourceSha256[file], `Missing initial input: ${file}`);
    for (const hashes of [plan.sourceSha256, report.initialSourceSha256]) for (const [file, hash] of Object.entries(hashes)) assert.equal(report.sourceSha256[file], hash, `Input changed: ${file}`);
    for (const [file, hash] of Object.entries(report.sourceSha256)) recordedSource(file, hash);
    const guidanceSource = recordedSource('src/recall.js', report.sourceSha256['src/recall.js']).toString();
    assert.equal(report.evaluation.rows.length, schedule.length); assert.equal(report.generations.length, schedule.length);
    assert.equal(new Set(report.evaluation.rows.map(row => row.chatId)).size, schedule.length);
    assert.deepEqual(report.transportProtocol, NATURAL_RETRY);
    let calls = 0;
    const rows = schedule.map((sample, index) => {
        const row = report.evaluation.rows[index], generation = report.generations[index], item = cases.find(item => item.id === sample.case);
        for (const key of ['id', 'case', 'repetition', 'mode']) assert.equal(row[key], sample[key]);
        assert.equal(row.index, index); assert.equal(generation.semanticSampleId, sample.id);
        assert.equal(generation.upstreamStatus, 200); assert.equal(generation.finishReason, 'stop');
        assert.equal(generation.providerAnswer.trim(), row.answer.trim()); assert.equal(generation.answer.trim(), row.answer.trim());
        assert.equal(generation.model, plan.generation.model); assert.equal(generation.requestOptions.temperature, 0); assert.equal(generation.maxOutputTokens, 256);
        assert(generation.attempts.length >= 1 && generation.attempts.length <= 3);
        for (const [i, attempt] of generation.attempts.entries()) {
            assert(!attempt.failure); assert.equal(attempt.number, i + 1); assert.match(attempt.requestSha256, /^[a-f0-9]{64}$/);
            assert.equal(attempt.requestSha256, generation.attempts[0].requestSha256);
            if (i === generation.attempts.length - 1) assert.equal(attempt.status, 200);
            else { assert(NATURAL_RETRY.statuses.includes(attempt.status)); assert(attempt.retryWaitMs >= NATURAL_RETRY.baseDelayMs * 2 ** i && attempt.retryWaitMs <= NATURAL_RETRY.maxDelayMs); }
        }
        calls += generation.attempts.length;
        const source = hostSource(item), prompt = generation.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
        assert.equal(row.sourceHash, sha(JSON.stringify(source.map(m => ({ text: m.mes, user: m.is_user, name: m.name })))));
        assert(row.sourceTokens > plan.settings.context); verifySourcePresence(row, source, prompt);
        const coverage = semanticPromptEvidence(item, row.passages, generation.messages);
        assert.deepEqual(row.coverage, coverage);
        assert(prompt.includes(item.question) && prompt.includes(plan.generation.instruction));
        assert(source.slice(-(plan.settings.recent - 1)).every(m => prompt.includes(m.mes.trim())));
        assert(Number.isFinite(row.memoryTokens) && row.memoryTokens >= 0 && row.memoryTokens <= plan.settings.effectiveBudget);
        if (sample.mode === 'on') {
            assert.equal(row.effectiveBudget, 320); assert(row.guidance && guidanceSource.includes(row.guidance));
            assert(generation.messages.some(m => m.role === 'system' && m.content.includes(row.guidance)));
        } else { assert.equal(row.memoryTokens, 0); assert.equal(row.effectiveBudget, null); assert.equal(row.guidance, null); assert.equal(row.passages.length, 0); }
        return { id: row.id, mode: row.mode, guidance: row.guidance, answer: row.answer, memoryTokens: row.memoryTokens, completeEvidence: coverage.prompt.completeEvidence };
    });
    assert.equal(calls, report.providerCalls); assert(calls <= schedule.length + 8);
    assert(summarizeProviderSpacing(report.generations, report.providerSpacing).verified);
    // Require deletion and a subsequent absence check for BOTH synthetic collections.
    const requests = report.lambdaRequests;
    assert(requests.every(r => Number.isInteger(r.status) && !r.failed));
    const deleted = requests.map((r, i) => ({ ...r, index: i })).filter(r => r.method === 'DELETE' && /^\/collections\/(smtest|sillymemory)_[a-f0-9]+$/.test(r.path));
    assert.equal(new Set(deleted.map(r => r.path)).size, 2);
    for (const request of deleted) {
        assert(request.status >= 200 && request.status < 300);
        assert(requests.slice(request.index + 1).some(r => r.method === 'GET' && r.path === request.path && r.status === 404));
    }
    assert(report.cleanupComplete && report.nativeCleanupComplete);
    assert.equal(pilot.passedIntegrity, true); assert.equal(pilot.cleanupComplete, true);
    assert.equal(pilot.embeddingMode, report.embeddingMode); assert.equal(pilot.providerCalls, calls);
    assert.deepEqual(pilot.rows.map(({ grade, ...row }) => row), rows);
    return { samples: rows.length, cleanupVerified: true, sourceInputs: Object.keys(report.sourceSha256).length };
}
