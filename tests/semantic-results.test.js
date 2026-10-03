import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLong, longSchedule, hostSource, sourceHashes, semanticPromptEvidence, sha } from '../scripts/semantic-long.mjs';
import { summarizeSemantic, semanticReviewPacket } from '../scripts/semantic-results.mjs';
import { PROVIDER_SPACING } from '../scripts/provider-spacing.mjs';

// Generated entirely from synthetic inputs; never presented as a provider run.
function syntheticReport() {
    const fixture = loadLong(), hashes = sourceHashes(), rows = [], generations = [];
    for (const [index, sample] of longSchedule(fixture).entries()) {
        const item = fixture.cases.find(c => c.id === sample.case), source = hostSource(item);
        const messages = [{ role: 'system', content: fixture.generation.instruction },
            ...source.slice(-7).map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })),
            { role: 'user', content: item.question }];
        const prompt = messages.map(m => m.content).join('\n'), answer = `Synthetic answer ${index}`;
        rows.push({ ...sample, index, chatId: `synthetic-${index}`, language: item.language, shape: item.shape,
            answer, sourceTokens: 2000, memoryTokens: 0, passages: [], effectiveBudget: sample.mode === 'on' ? 320 : null,
            sourceHash: sha(JSON.stringify(source.map(m => ({ text: m.mes, user: m.is_user, name: m.name })))),
            sourceMessagesPresent: source.filter(m => prompt.includes(m.mes.trim())).length,
            coverage: semanticPromptEvidence(item, [], messages) });
        generations.push({ semanticSampleId: sample.id, upstreamStatus: 200, finishReason: 'stop', providerAnswer: answer,
            answer, model: fixture.generation.model, requestOptions: { temperature: 0 }, maxOutputTokens: 256, messages,
            attempts: [{ status: 200, upstreamStartedMs: index * 15000, spacingWaitMs: 0 }] });
    }
    return { passed: true, cleanupComplete: true, nativeCleanupComplete: true, embeddingMode: 'managed',
        sillyTavern: '06bde939fb1e9c4c8d8641d810f0a916b5bce127', hostContextTokens: fixture.settings.context,
        model: fixture.generation.model, sourceSha256: hashes, initialSourceSha256: { ...hashes },
        evaluation: { version: fixture.version, complete: true, fixtureSha256: sha(JSON.stringify(fixture)),
            settings: fixture.settings, generation: fixture.generation, rows }, generations, providerCalls: generations.length,
        providerSpacing: PROVIDER_SPACING, lambdaRequests: [{ status: 200 }], checks: ['synthetic-only'] };
}

test('current validator preserves incomplete recall as ungraded evidence rather than a quality pass', () => {
    const report = syntheticReport(), result = summarizeSemantic(report);
    assert.equal(result.answerQuality, null);
    assert.equal(result.groups[1].completeInMemory, 0);
    const review = semanticReviewPacket(report);
    assert.equal(review.packet.rows.length, 64);
    assert(review.packet.rows.every(row => row.grade === null));
    assert.equal(new Set(review.key.map(row => row.sample)).size, 64);
});

test('current evidence validator rejects omitted samples, altered answers, lost prompt content, bad provenance and unfinished cleanup', () => {
    const original = syntheticReport();
    for (const mutate of [
        r => r.evaluation.rows.pop(), r => r.generations.pop(),
        r => { r.generations[0].providerAnswer = 'changed'; },
        r => { r.generations[0].messages.pop(); },
        r => { r.evaluation.rows[0].sourceHash = 'changed'; },
        r => { r.sourceSha256['src/memory.js'] = '0'.repeat(64); },
        r => { r.evaluation.rows[0].chatId = r.evaluation.rows[1].chatId; },
        r => { r.evaluation.rows[1].memoryTokens = 321; },
        r => { r.generations[1].attempts[0].upstreamStartedMs = 1; },
        r => { r.providerCalls++; }, r => { r.cleanupComplete = false; },
        r => { r.nativeCleanupComplete = false; }, r => { r.embeddingMode = 'direct-experimental'; },
    ]) {
        const changed = structuredClone(original); mutate(changed);
        assert.throws(() => summarizeSemantic(changed));
    }
});
