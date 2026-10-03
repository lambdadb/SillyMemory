import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadLong, validateLong, hostSource, sha } from './semantic-long.mjs';
import { tuningVersion, tuningSchedule, tuningFiles, tuningRetry } from './native-tuning-plan.mjs';
import { threeModeSchedule, threeModeVersion, threeModeNative, threeModeRetry, threeModeFiles } from './three-mode-plan.mjs';
import { threeModeEvidence } from './three-mode-native.mjs';
import { verifySource } from './verify-source.mjs';
import { summarizeProviderSpacing } from './provider-spacing.mjs';
import { verifySourcePresence } from './semantic-results.mjs';

export const median = values => { const sorted = [...values].sort((a,b) => a-b), i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i-1]+sorted[i])/2; };
export function summarizeThreeModes(report) {
    assert(report.passed && !report.failure && !report.incomplete && report.cleanupComplete && report.nativeCleanupComplete, 'Complete successful run required');
    const fixture = validateLong(loadLong()), evaluation = report.evaluation, tuning = evaluation.version === tuningVersion;
    const schedule = tuning ? tuningSchedule(fixture.cases) : threeModeSchedule(fixture.cases);
    const protocol = tuning ? tuningRetry : threeModeRetry, files = tuning ? tuningFiles : threeModeFiles, nativeCount = tuning ? 64 : 32;
    assert.equal(evaluation.version, tuning ? tuningVersion : threeModeVersion); assert(evaluation.complete);
    assert.equal(evaluation.fixtureSha256, sha(JSON.stringify(fixture)));
    assert.deepEqual(evaluation.settings, fixture.settings); assert.deepEqual(evaluation.generation, fixture.generation);
    assert.deepEqual(evaluation.nativeSettings, threeModeNative); assert.deepEqual(report.transportProtocol, protocol);
    assert.equal(report.sillyTavern, '06bde939fb1e9c4c8d8641d810f0a916b5bce127');
    assert.equal(report.hostContextTokens, 1536); assert.equal(report.embeddingMode, tuning ? 'native-openai' : 'managed'); assert.equal(report.model, fixture.generation.model);
    for (const file of files) { assert.equal(report.sourceSha256[file], report.initialSourceSha256[file], `Changed input: ${file}`); verifySource(file, report.sourceSha256[file]); }
    for (const [file, hash] of Object.entries(report.initialSourceSha256)) assert.equal(report.sourceSha256[file], hash, `Changed input: ${file}`);
    for (const [file, hash] of Object.entries(report.sourceSha256)) verifySource(file, hash);
    assert.equal(evaluation.rows.length, schedule.length); assert.equal(report.generations.length, schedule.length);
    assert.equal(evaluation.preparation.length, schedule.length); assert.equal(new Set(evaluation.rows.map(row => row.chatId)).size, schedule.length);
    let calls = 0;
    for (const [index, sample] of schedule.entries()) {
        const row = evaluation.rows[index], generation = report.generations[index], item = fixture.cases.find(item => item.id === sample.case), preparation = evaluation.preparation[index];
        for (const key of ['id', 'case', 'repetition', 'mode', ...(tuning ? ['insert'] : [])]) assert.equal(row[key], sample[key]);
        assert.equal(row.index, index); assert.equal(preparation.id, row.id); assert.equal(generation.semanticSampleId, row.id);
        assert.equal(generation.upstreamStatus, 200); assert.equal(generation.finishReason, 'stop');
        assert.equal(generation.providerAnswer.trim(), row.answer.trim()); assert.equal(generation.answer.trim(), row.answer.trim());
        assert.equal(generation.model, fixture.generation.model); assert.equal(generation.requestOptions.temperature, 0); assert.equal(generation.maxOutputTokens, 256);
        assert(generation.attempts.length >= 1 && generation.attempts.length <= 3);
        for (const [i, attempt] of generation.attempts.entries()) {
            assert(!attempt.failure); assert.equal(attempt.number, i+1); assert.match(attempt.requestSha256, /^[a-f0-9]{64}$/); assert.equal(attempt.requestSha256, generation.attempts[0].requestSha256);
            if (i === generation.attempts.length - 1) assert.equal(attempt.status, 200);
            else { assert(threeModeRetry.statuses.includes(attempt.status)); assert(attempt.retryWaitMs >= threeModeRetry.baseDelayMs*2**i && attempt.retryWaitMs <= threeModeRetry.maxDelayMs); }
        }
        calls += generation.attempts.length;
        const source = hostSource(item), prompt = generation.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
        assert.equal(row.sourceHash, sha(JSON.stringify(source.map(m => ({ text: m.mes, user: m.is_user, name: m.name })))));
        assert(row.sourceTokens > fixture.settings.context); verifySourcePresence(row, source, prompt);
        assert.deepEqual(row.coverage, threeModeEvidence(item, row, generation.messages));
        assert(prompt.includes(item.question) && prompt.includes(fixture.generation.instruction));
        const recentPreserved = source.slice(-(fixture.settings.recent-1)).every(m => prompt.includes(m.mes.trim()));
        if (tuning) assert.equal(row.recentPreserved, recentPreserved); else assert(recentPreserved);
        assert(Number.isFinite(row.memoryTokens) && row.memoryTokens >= 0);
        assert.deepEqual(row.usage, generation.providerUsage);
        for (const value of [row.usage.prompt_tokens, row.usage.completion_tokens, row.usage.prompt_tokens_details.cached_tokens, generation.generationMs, preparation.syncMs]) assert(Number.isFinite(value) && value >= 0);
        if (row.mode === 'on') { assert.equal(row.effectiveBudget, 320); assert(row.memoryTokens <= 320); assert(!row.nativePrompt); assert(row.queries.length >= 1); }
        else { assert.equal(row.effectiveBudget, null); assert.equal(row.passages.length, 0); assert.equal(row.queries.length, 0); }
        if (row.mode === 'off') { assert.equal(row.memoryTokens, 0); assert(!row.nativePrompt); }
        if (row.mode === 'vectors') {
            assert.equal(row.nativeQuery.status, 200); assert.equal(row.nativeQuery.request.collectionId, row.chatId);
            assert.equal(row.nativeQuery.request.topK, tuning ? sample.insert : threeModeNative.insert);
            assert.equal(row.nativeQuery.request.threshold, threeModeNative.score_threshold);
            assert.equal(row.nativeQuery.request.source, threeModeNative.source);
            assert.equal(row.nativeQuery.request.model, threeModeNative.vllm_model);
            assert(row.nativeQuery.request.searchText.includes(item.question));
            assert.equal(preparation.nativeIndex.collectionId, row.chatId); assert.deepEqual(preparation.nativeIndex.hashes, preparation.nativeIndex.expected);
            assert(preparation.nativeIndex.hashes.length > 0);
            assert(report.nativeCleanup.some(c => c.collectionId === row.chatId && c.purgeStatus === 200 && c.listStatus === 200 && c.remaining.length === 0));
        }
    }
    assert.equal(calls, report.providerCalls); assert(calls <= protocol.maxCalls); assert(calls - schedule.length <= 8);
    assert.equal(report.nativeCleanup.length, nativeCount); assert.equal(report.vectorQueries.length, nativeCount);
    assert(report.embeddings.length > 0 && report.embeddings.length <= 800 && report.embeddings.every(r => r.status === 200 && !r.failed && r.inputs <= 5));
    const spacing = summarizeProviderSpacing(report.generations, report.providerSpacing); assert(spacing.verified);
    const deletes = report.lambdaRequests.map((r,i) => ({ ...r, index: i })).filter(r => r.method === 'DELETE' && /^\/collections\/[^/]+$/.test(r.path));
    assert.equal(new Set(deletes.map(r => r.path)).size, tuning ? 0 : 2);
    if (tuning) assert.equal(report.lambdaRequests.length, 0);
    for (const request of deletes) assert(request.status >= 200 && request.status < 300 && report.lambdaRequests.slice(request.index+1).some(r => r.method === 'GET' && r.path === request.path && r.status === 404));
    const groups = (tuning ? ['insert-3','insert-10'] : ['off','vectors','on']).map(mode => {
        const rows = evaluation.rows.filter(row => (tuning ? `insert-${row.insert}` : row.mode) === mode), known = rows.filter(row => row.coverage.prompt.completeEvidence !== null);
        return { mode, samples: rows.length, known: known.length, completeInMemory: known.filter(row => row.coverage.memory.completeEvidence).length, completeInPrompt: known.filter(row => row.coverage.prompt.completeEvidence).length,
            medianPromptTokens: median(rows.map(row => row.usage.prompt_tokens)), medianCachedTokens: median(rows.map(row => row.usage.prompt_tokens_details.cached_tokens)),
            medianGenerationMs: median(rows.map(row => report.generations[row.index].generationMs)), medianSyncMs: median(rows.map(row => evaluation.preparation[row.index].syncMs)), maxMemoryTokens: Math.max(...rows.map(row => row.memoryTokens)) };
    });
    return { version: evaluation.version, groups, providerCalls: calls, retries: calls - schedule.length, spacing, checks: report.checks.length, lambdaFailures: report.lambdaRequests.filter(r => r.failed || r.status >= 500).length, nativeEmbeddingCalls: report.embeddings.length, nativeEmbeddingTokens: report.embeddings.reduce((n,r) => n+(r.usage?.total_tokens || 0),0), cleanupComplete: true, answerQuality: null, totalCost: null };
}
export function threeModeReviewPacket(report) {
    const fixture = loadLong();
    return { version: report.evaluation.version, reportSha256: sha(JSON.stringify(report)), reviewerType: null, reviewer: null, rows: report.evaluation.rows.map(row => {
        const item = fixture.cases.find(item => item.id === row.case);
        return { id: sha(row.id), question: item.question, source: item.messages.slice(0,2), expected: item.expected, evidence: item.evidence, answer: row.answer, grade: null, rationale: null };
    }).sort((a,b) => a.id.localeCompare(b.id)) };
}
export function scoreThreeModes(report, annotations) {
    const summary = summarizeThreeModes(report), packet = threeModeReviewPacket(report);
    assert.equal(annotations.version, packet.version); assert.equal(annotations.reportSha256, packet.reportSha256);
    assert(['assistant','human'].includes(annotations.reviewerType)); assert(annotations.reviewer);
    const grades = new Map(annotations.rows.map(row => [row.id,row])); assert.equal(grades.size, packet.rows.length); assert.equal(annotations.rows.length, packet.rows.length);
    for (const original of packet.rows) {
        const row = grades.get(original.id); assert(row); const { grade, rationale, ...content } = row;
        assert.deepEqual(content, (({ grade, rationale, ...rest }) => rest)(original));
        assert(['correct','partial','incorrect','abstained'].includes(grade)); assert(typeof rationale === 'string' && rationale.trim());
        if (original.expected.type === 'abstain') assert(['abstained','incorrect'].includes(grade));
    }
    const fixture = loadLong(), rows = report.evaluation.rows.map(row => {
        const annotation = grades.get(sha(row.id)), unknown = fixture.cases.find(item => item.id === row.case).expected.type === 'abstain';
        return { id: row.id, case: row.case, repetition: row.repetition, mode: row.insert === undefined ? row.mode : `insert-${row.insert}`, unknown, grade: annotation.grade, rationale: annotation.rationale, strictPass: annotation.grade === (unknown ? 'abstained' : 'correct') };
    });
    return { ...summary, provisional: annotations.reviewerType === 'assistant', reviewer: annotations.reviewer, groups: summary.groups.map(group => ({ ...group, strictPasses: rows.filter(row => row.mode === group.mode && row.strictPass).length })), rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [input, output] = process.argv.slice(2); assert(input && output && process.argv.length === 4);
    const report = JSON.parse(readFileSync(input)); const summary = summarizeThreeModes(report);
    writeFileSync(output, JSON.stringify(summary,null,2)+'\n', { flag: 'wx' });
    writeFileSync(output.replace(/\.json$/, '')+'-review.json', JSON.stringify(threeModeReviewPacket(report),null,2)+'\n', { flag: 'wx' });
    console.log(JSON.stringify(summary));
}
