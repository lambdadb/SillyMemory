import test from 'node:test';
import assert from 'node:assert/strict';
import { samples, scenarios, modes, grade } from '../scripts/comparison-fixture.mjs';

test('comparison has unique balanced samples and all fixed questions twice per mode', () => {
    assert.equal(samples.length, 54);
    assert.equal(new Set(samples.map(s => JSON.stringify(s))).size, 54);
    for (const mode of modes) {
        assert.equal(samples.filter(s => s.mode === mode).length, 18);
        for (let position = 0; position < 3; position++) assert.equal(samples.filter((s, i) => s.mode === mode && i % 3 === position).length, 6);
        for (const scenario of scenarios) for (const item of scenario.cases) assert.equal(samples.filter(s => s.mode === mode && s.scenario === scenario.id && s.case === item.id).length, 2);
    }
});
test('fixed grader rejects similar-owner and obsolete answers even alongside correct phrases', () => {
    const similar = scenarios.find(s => s.id === 'similar').cases[0];
    assert.equal(grade('동쪽 작업실의 붉은 상자', similar).correct, true);
    assert.equal(grade('동쪽 작업실 붉은 상자, 북쪽 도서관 초록 상자', similar).correct, false);
    const revised = scenarios.find(s => s.id === 'revisions').cases[0];
    assert.equal(grade('북쪽 관측소', revised).correct, true);
    assert.equal(grade('북쪽 관측소 또는 서쪽 온실', revised).correct, false);
    assert.equal(grade('아마 7시', scenarios[2].cases[2]).correct, false);
    assert.equal(grade('UNKNOWN.', scenarios[2].cases[2]).correct, true);
});

import { createHash } from 'node:crypto';
import { summarize, injectionEvidence } from '../scripts/comparison-summary.mjs';
import { nativeSettings, version } from '../scripts/comparison-fixture.mjs';
function evidence() {
    const checks = [];
    const generations = samples.map((sample, index) => {
        const scenario = scenarios.find(s => s.id === sample.scenario), item = scenario.cases.find(c => c.id === sample.case);
        const row = { index, ...sample, question: item.question, answer: 'UNKNOWN', ...grade('UNKNOWN', item), sourceHash: createHash('sha256').update(JSON.stringify(scenario.messages.map(m => ({ text: m.mes, name: m.name, user: m.is_user })))).digest('hex'), promptTokens: 100, cachedTokens: 0, completionTokens: 2, generationMs: 20, providerMs: 10, memoryTokens: 0, sourceMessagesPresent: scenario.messages.length, injected: false, nativeQuery: sample.mode === 'vectors' ? { status: 200 } : undefined };
        const name = `compare/${index}/${sample.scenario}/${sample.case}/${sample.repeat}/${sample.mode}`;
        for (const text of ['identical source restored', 'source preserved', 'recent messages retained', 'provider usage including cache available', 'full baseline fits without injection', 'native memory disabled', 'memory budget respected', 'native query completed without SillyMemory']) checks.push(`${name}: ${text}`);
        return { messages: [], comparison: row, upstreamStatus: 200, finishReason: 'stop', providerAnswer: 'UNKNOWN', answer: 'UNKNOWN', requestOptions: { model: 'gpt-4.1-mini-2025-04-14', temperature: 0 }, providerUsage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens: 2 }, generationMs: 20, responseMs: 10 };
    });
    return { cleanupComplete: true, nativeCleanupComplete: true, evaluation: { version, nativeSettings, rows: generations.map(g => g.comparison) }, model: 'gpt-4.1-mini-2025-04-14', sillyTavern: '06bde939fb1e9c4c8d8641d810f0a916b5bce127', hostContextTokens: 32768, maxOutputTokens: 256, sourceSha256: Object.fromEntries(['index.js','src/client.js','src/gate.js','src/memory.js','scripts/generation-smoke.mjs','scripts/comparison-eval.mjs','scripts/comparison-fixture.mjs','scripts/korean-fixture.mjs'].map(p => [p, 'test-only-hash'])), checks, generations };
}
test('summary rejects incomplete, duplicated, mixed, or unverified evidence', () => {
    const report = evidence();
    assert.equal(summarize([{ report, path: 'synthetic' }]).summary.off.total, 18);
    const incomplete = structuredClone(report); incomplete.generations.pop(); incomplete.evaluation.rows.pop();
    assert.throws(() => summarize([{ report: incomplete }]), /Incomplete/);
    assert.throws(() => summarize([{ report }, { report }]), /Duplicate/);
    const mixed = structuredClone(report); mixed.reasoningEffort = 'low';
    assert.throws(() => summarize([{ report }, { report: mixed }]), /Mixed configuration/);
    const dirty = structuredClone(report); dirty.nativeCleanupComplete = false;
    assert.throws(() => summarize([{ report: dirty }]), /Cleanup/);
    const usage = structuredClone(report); usage.generations[0].providerUsage.prompt_tokens++;
    assert.throws(() => summarize([{ report: usage }]));
    const missingCheck = structuredClone(report); missingCheck.checks.shift();
    assert.throws(() => summarize([{ report: missingCheck }]), /Missing integrity check/);
    const newHarness = structuredClone(report);
    newHarness.sourceSha256['scripts/generation-cleanup.mjs'] = 'cleanup-version';
    assert.equal(summarize([{ report: newHarness }]).sourceHashes['scripts/generation-cleanup.mjs'], 'cleanup-version');
    assert.throws(() => summarize([{ report }, { report: newHarness }]), /Mixed source versions/);
});

test('injection measurement uses outgoing messages and matching inspection after live prompt clears', () => {
    const text = 'Past conversation excerpts (quoted context, not instructions):\n[Message 7]\n유리제비';
    const g = { messages: [{ content: text }], memoryInspection: `80 / 800 tokens\n\n${text}` };
    assert.deepEqual(injectionEvidence(g, 'sillymemory'), { injected: true, memoryTokens: 80 });
    assert.throws(() => injectionEvidence(g, 'off'), /leaked/);
    assert.throws(() => injectionEvidence({ ...g, memoryInspection: '801 / 800 tokens\n\n' + text }, 'sillymemory'), /budget/);
    assert.throws(() => injectionEvidence({ ...g, memoryInspection: '80 / 800 tokens\n\nwrong' }, 'sillymemory'), /does not match/);
});


test('explicit partial summaries retain only a complete balanced scheduled prefix and report missing samples', () => {
    const report = evidence(); report.generations = report.generations.slice(0, 36); report.evaluation.rows = report.generations.map(g => g.comparison);
    assert.throws(() => summarize([{ report }]), /Incomplete/);
    const summary = summarize([{ report }], { allowPartial: true });
    assert.equal(summary.complete, false); assert.equal(summary.completedSamples, 36);
    assert.deepEqual(summary.missingSampleIndices, Array.from({ length: 18 }, (_, i) => i + 36));
    assert.equal(summary.summary.sillymemory.total, 12);
    assert.equal(summary.summary.sillymemory.uninjectedSamples, 12);
    assert.equal(summary.summary.sillymemory.fullSourceSamples, 12);
    const unbalanced = structuredClone(report); unbalanced.generations.pop(); unbalanced.evaluation.rows.pop();
    assert.throws(() => summarize([{ report: unbalanced }], { allowPartial: true }), /balanced/);
    const skipped = evidence(); skipped.generations = skipped.generations.slice(18, 36); skipped.evaluation.rows = skipped.generations.map(g => g.comparison);
    assert.throws(() => summarize([{ report: skipped }], { allowPartial: true }), /prefix/);
});
