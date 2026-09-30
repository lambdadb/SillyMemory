import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { samples, scenarios, modes, grade, nativeSettings, version } from './comparison-fixture.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHash = scenario => sha(JSON.stringify(scenario.messages.map(m => ({ text: m.mes, name: m.name, user: m.is_user }))));
const median = values => { const sorted = values.toSorted((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
// Generation-end events clear the runtime SillyMemory prompt. The captured
// outgoing provider request and token inspection are the measurement authority.
export function injectionEvidence(g, mode) {
    const prompt = g.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    const injected = prompt.includes('Past conversation excerpt');
    if (mode !== 'sillymemory') { assert(!injected, 'SillyMemory leaked into another mode'); return null; }
    if (!injected) return { injected: false, memoryTokens: 0 };
    const match = /^(\d+) \/ (\d+) tokens\n\n([\s\S]*)$/.exec(g.memoryInspection);
    assert(match && Number(match[1]) > 0 && Number(match[1]) <= 800 && Number(match[2]) === 800, 'Invalid captured injection budget');
    assert(match[3].split(/(?=\[Past conversation excerpt:)/).filter(text => text.trim()).every(text => prompt.includes(text.trim())), 'Inspection does not match actual outgoing memory');
    return { injected: true, memoryTokens: Number(match[1]) };
}
const metrics = rows => ({
    total: rows.length, correct: rows.filter(r => r.correct).length,
    forbiddenAnswers: rows.filter(r => r.forbiddenAnswerMatches.length).length,
    medianPromptTokens: median(rows.map(r => r.promptTokens)),
    totalPromptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
    totalCachedTokens: rows.reduce((s, r) => s + r.cachedTokens, 0),
    totalCompletionTokens: rows.reduce((s, r) => s + r.completionTokens, 0),
    cacheHitSamples: rows.filter(r => r.cachedTokens > 0).length,
    medianGenerationMs: median(rows.map(r => r.generationMs)),
    minGenerationMs: Math.min(...rows.map(r => r.generationMs)),
    maxGenerationMs: Math.max(...rows.map(r => r.generationMs)),
    medianProviderMs: median(rows.map(r => r.providerMs)),
    maxMemoryTokens: Math.max(...rows.map(r => r.memoryTokens)),
    injectedSamples: rows.filter(r => r.injected).length,
    correctInjectedSamples: rows.filter(r => r.injected && r.correct).length,
    uninjectedSamples: rows.filter(r => !r.injected).length,
    correctUninjectedSamples: rows.filter(r => !r.injected && r.correct).length,
    fullSourceSamples: rows.filter(r => r.sourceMessagesPresent === scenarios.find(s => s.id === r.scenario).messages.length).length,
    generationOnlyEstimatedUSD: rows.reduce((s, r) => s + ((r.promptTokens - r.cachedTokens) * 0.40 + r.cachedTokens * 0.10 + r.completionTokens * 1.60) / 1e6, 0),
});
export function summarize(segments, { allowPartial = false } = {}) {
    assert(segments.length > 0, 'Reports required');
    const rows = [], seen = new Set(); let configuration, sourceHashes;
    for (const { report, path } of segments) {
        assert(report.cleanupComplete && report.nativeCleanupComplete, 'Cleanup must be verified');
        assert.equal(report.evaluation?.version, version);
        assert.deepEqual(report.evaluation.nativeSettings, nativeSettings);
        const config = { model: report.model, host: report.sillyTavern, context: report.hostContextTokens, maxOutputTokens: report.maxOutputTokens, reasoningEffort: report.reasoningEffort, excludedParameters: report.excludedParameters };
        assert.equal(config.model, 'gpt-4.1-mini-2025-04-14');
        assert.equal(config.host, '06bde939fb1e9c4c8d8641d810f0a916b5bce127');
        assert.equal(config.context, 32768); assert.equal(config.maxOutputTokens, 256);
        const hashes = Object.fromEntries(['index.js', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/context.js', 'scripts/generation-smoke.mjs', 'scripts/comparison-eval.mjs', 'scripts/comparison-fixture.mjs', 'scripts/korean-fixture.mjs', ...(report.sourceSha256?.['src/status.js'] ? ['src/status.js'] : []), ...(report.sourceSha256?.['scripts/generation-cleanup.mjs'] ? ['scripts/generation-cleanup.mjs'] : [])].map(file => {
            assert(report.sourceSha256?.[file], `Missing source hash: ${file}`); return [file, report.sourceSha256[file]];
        }));
        if (configuration) { assert.deepEqual(config, configuration, 'Mixed configuration'); assert.deepEqual(hashes, sourceHashes, 'Mixed source versions'); }
        configuration = config; sourceHashes = hashes;
        const completed = report.generations.filter(g => g.comparison);
        assert.deepEqual(completed.map(g => g.comparison), report.evaluation.rows, 'Generation/row evidence mismatch');
        for (const g of completed) {
            const r = g.comparison, expected = samples[r.index];
            assert(expected && Number.isInteger(r.index), 'Invalid sample index');
            assert(!seen.has(r.index), 'Duplicate sample'); seen.add(r.index);
            assert.deepEqual({ scenario: r.scenario, case: r.case, repeat: r.repeat, mode: r.mode }, expected, 'Schedule mismatch');
            const scenario = scenarios.find(s => s.id === r.scenario), item = scenario.cases.find(c => c.id === r.case);
            assert.equal(r.sourceHash, sourceHash(scenario)); assert.equal(r.question, item.question);
            assert.equal(g.upstreamStatus, 200); assert.equal(g.finishReason, 'stop');
            assert.equal(g.providerAnswer.trim(), r.answer.trim()); assert.equal(g.answer, r.answer);
            assert.equal(g.requestOptions.model, config.model); assert.equal(g.requestOptions.temperature, 0);
            assert.deepEqual({ correct: r.correct, forbiddenAnswerMatches: r.forbiddenAnswerMatches }, grade(r.answer, item));
            assert.equal(r.promptTokens, g.providerUsage.prompt_tokens);
            assert.equal(r.cachedTokens, g.providerUsage.prompt_tokens_details.cached_tokens);
            assert.equal(r.completionTokens, g.providerUsage.completion_tokens);
            assert.equal(r.generationMs, g.generationMs); assert.equal(r.providerMs, g.responseMs);
            for (const value of [r.promptTokens, r.cachedTokens, r.completionTokens, r.generationMs, r.providerMs, r.memoryTokens]) assert(Number.isFinite(value) && value >= 0, 'Invalid measurement');
            assert(r.cachedTokens <= r.promptTokens);
            const name = `compare/${r.index}/${r.scenario}/${r.case}/${r.repeat}/${r.mode}`;
            for (const check of ['identical source restored', 'source preserved', 'recent messages retained', 'provider usage including cache available']) assert(report.checks.includes(`${name}: ${check}`), `Missing integrity check: ${check}`);
            if (r.mode === 'off') { assert.equal(r.sourceMessagesPresent, scenario.messages.length); assert(!r.injected); assert(report.checks.includes(`${name}: full baseline fits without injection`)); }
            if (r.mode === 'sillymemory') { assert(r.memoryTokens <= 800); assert(report.checks.includes(`${name}: native memory disabled`)); assert(report.checks.includes(`${name}: memory budget respected`)); }
            if (r.mode === 'vectors') { assert.equal(r.nativeQuery?.status, 200); assert(report.checks.includes(`${name}: native query completed without SillyMemory`)); }
            const measured = injectionEvidence(g, r.mode);
            const outgoing = g.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
            if (r.mode === 'vectors' && r.nativePrompt) assert(outgoing.includes(r.nativePrompt.trim()), 'Native injection absent from actual outgoing request');
            if (r.mode !== 'vectors') assert(!outgoing.includes('Past events:'), 'Native injection leaked into another mode');
            const prompt = g.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n').normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase();
            const presentRequiredPhrases = (item.required || []).filter(p => prompt.includes(p.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase()));
            rows.push({ ...r, ...(measured || {}), presentRequiredPhrases, missingRequiredPhrases: (item.required || []).filter(p => !presentRequiredPhrases.includes(p)), rawInjectionMeasurement: { injected: r.injected, memoryTokens: r.memoryTokens }, segment: path });
        }
    }
    rows.sort((a, b) => a.index - b.index);
    if (allowPartial) {
        assert(rows.length > 0 && rows.length % 18 === 0, 'Partial comparison requires complete balanced scenario blocks');
        assert(rows.every((row, index) => row.index === index), 'Partial comparison must preserve the complete scheduled prefix');
    } else assert.equal(rows.length, 54, 'Incomplete comparison: all 54 unique samples required');
    return { measurementNote: 'SillyMemory injection presence/tokens are derived from the saved outgoing request and matching token inspection. The original harness used a cleared post-generation snapshot; newer runs capture the outgoing injection. Raw measurement fields are retained separately in either case.', version, complete: rows.length === samples.length, expectedSamples: samples.length, completedSamples: rows.length, missingSampleIndices: samples.map((_, index) => index).filter(index => !seen.has(index)), configuration, sourceHashes,
        summary: Object.fromEntries(modes.map(mode => [mode, metrics(rows.filter(r => r.mode === mode))])),
        byScenario: Object.fromEntries(scenarios.filter(s => rows.some(r => r.scenario === s.id)).map(s => [s.id, Object.fromEntries(modes.map(mode => [mode, metrics(rows.filter(r => r.mode === mode && r.scenario === s.id))]))])),
        rows, limits: 'Synthetic fixed questions; two repetitions; warm indexes; native retains other old history; strict phrase grader; cache/provider load uncontrolled; estimated generation cost excludes embeddings and LambdaDB.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const allowPartial = args.includes('--partial');
    if (allowPartial) args.splice(args.indexOf('--partial'), 1);
    const at = args.indexOf('--output');
    let output = 'artifacts/comparison-summary.json';
    if (at >= 0) { output = args[at + 1]; assert(output && !output.startsWith('--')); args.splice(at, 2); }
    assert(!args.includes(output), 'Do not overwrite input reports');
    const segments = await Promise.all(args.map(async path => { const raw = await readFile(path, 'utf8'); return { path, sha256: sha(raw), report: JSON.parse(raw) }; }));
    const result = summarize(segments, { allowPartial });
    for (const [file, hash] of Object.entries(result.sourceHashes)) assert.equal(sha(await readFile(file)), hash, `Current source differs: ${file}`);
    const hostSource = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
    assert.equal(execFileSync('git', ['-C', hostSource, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), result.configuration.host);
    execFileSync('git', ['-C', hostSource, 'diff', '--exit-code', 'HEAD', '--', 'public/scripts/tokenizers.js', 'src/endpoints/tokenizers.js'], { stdio: 'pipe' });
    const require = createRequire(path.resolve(hostSource, 'package.json'));
    // Pinned host maps GPT-4.1 to GPT-4o, and counts content-only extension
    // messages with 3 per-message + 3 padding tokens (full=true).
    const tokenizer = require('tiktoken').encoding_for_model('gpt-4o');
    const audited = [];
    try {
        for (const { report } of segments) for (const g of report.generations.filter(g => g.comparison)) {
            const row = result.rows.find(r => r.index === g.comparison.index);
            const text = row.mode === 'sillymemory' && row.injected ? /^(\d+) \/ (\d+) tokens\n\n([\s\S]*)$/.exec(g.memoryInspection)[3] : row.mode === 'vectors' ? row.nativePrompt : '';
            const count = text ? tokenizer.encode(text).length + 6 : 0;
            assert.equal(count, row.memoryTokens, 'Independent pinned-host token recount differs');
            audited.push({ index: row.index, tokens: count });
        }
    } finally { tokenizer.free(); }
    result.tokenAudit = { method: 'Pinned host GPT-4o tiktoken encoding plus 6 content-only extension overhead tokens; independent recount of captured injection text', rows: audited };
    result.segments = segments.map(({ path, sha256, report }) => ({ path, sha256, time: report.time, failure: report.failure || null, setup: report.evaluation.setup, providerCalls: report.providerCalls, embeddingRequests: report.embeddings.length, embeddingTokens: report.embeddings.reduce((s, e) => s + (e.usage?.total_tokens || 0), 0) }));
    await writeFile(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.summary, null, 2));
}
