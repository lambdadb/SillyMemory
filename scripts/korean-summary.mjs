// Combine completed, non-overlapping Korean samples from one model only.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cases, grade, version } from './korean-fixture.mjs';
const allowPartial = process.argv.includes('--allow-partial');
const args = process.argv.slice(2).filter(arg => arg !== '--allow-partial');
const outputIndex = args.indexOf('--output');
let outputPath = 'artifacts/korean-evaluation-summary.json';
if (outputIndex !== -1) {
    assert(args[outputIndex + 1] && !args[outputIndex + 1].startsWith('--'), 'Provide a path after --output');
    outputPath = args[outputIndex + 1]; args.splice(outputIndex, 2);
}
const paths = args;
assert(!paths.includes(outputPath), 'Output must not overwrite an input report');
assert(paths.length > 0, 'Provide report paths to combine');
const segments = [], rows = [], seen = new Set(); let configuration, sourceHashes;
const sha = content => createHash('sha256').update(content).digest('hex');
for (const path of paths) {
    const text = await readFile(path, 'utf8'); const report = JSON.parse(text);
    assert(report.cleanupComplete, 'Every input run must confirm cleanup');
    const config = { model: report.model, host: report.sillyTavern, hostContextTokens: report.hostContextTokens, maxOutputTokens: report.maxOutputTokens, reasoningEffort: report.reasoningEffort, excludedParameters: report.excludedParameters };
    const hashes = Object.fromEntries(['index.js', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/context.js', 'scripts/korean-fixture.mjs', ...(report.sourceSha256?.['src/status.js'] ? ['src/status.js'] : [])].map(file => {
        assert(report.sourceSha256?.[file], `Missing source hash: ${file}`); return [file, report.sourceSha256[file]];
    }));
    if (configuration) { assert.deepEqual(config, configuration, 'Cannot combine different host/model settings'); assert.deepEqual(hashes, sourceHashes, 'Cannot combine different runtime or fixture sources'); }
    configuration = config; sourceHashes = hashes;
    let samples = 0;
    for (const generation of report.generations) {
        const row = generation.evaluation; if (!row) continue;
        const item = cases.find(item => item.id === row.case);
        assert(item && ['on', 'off'].includes(row.mode), 'Unknown case or mode');
        const id = `${row.case}/${row.mode}`; assert(!seen.has(id), 'Duplicate sample: no silent replacement'); seen.add(id);
        assert.equal(generation.upstreamStatus, 200); assert.equal(generation.finishReason, 'stop');
        assert.equal(generation.providerAnswer.trim(), row.answer.trim());
        assert.equal(row.question, item.question); assert.equal(generation.answer, row.answer);
        assert.equal(row.correct, grade(row.answer, item).correct);
        assert.deepEqual(row.forbiddenAnswerMatches, grade(row.answer, item).forbiddenAnswerMatches);
        assert.equal(row.promptTokens, generation.providerUsage?.prompt_tokens);
        assert.equal(row.generationMs, generation.generationMs); assert.equal(row.providerMs, generation.responseMs);
        assert.equal(generation.requestOptions.model, configuration.model);
        assert.equal(generation.requestOptions.temperature, 0);
        const names = [
            `${id}: identical uncontaminated source restored`, `${id}: original conversation preserved by generation`,
            `${id}: edited/deleted source text absent from outgoing prompt`,
            `${id}: ${row.mode === 'off' ? 'full source fits the baseline context' : 'recent complete messages retained'}`,
        ];
        for (const name of names) assert(report.checks.includes(name), `Missing integrity check: ${name}`);
        if (row.injected) assert(row.memoryTokens <= 800);
        assert(Number.isFinite(row.promptTokens) && Number.isFinite(row.generationMs), 'Missing measured usage or duration');
        rows.push({ ...row, segment: path }); samples++;
    }
    segments.push({ path, sha256: sha(text), samples, completedAt: report.time, failure: report.failure || null, sourceSha256: report.sourceSha256 });
}
const complete = rows.length === cases.length * 2;
assert(complete || allowPartial, 'Incomplete comparison: require both modes for all eight questions');
const missing = cases.flatMap(item => ['off', 'on'].filter(mode => !seen.has(`${item.id}/${mode}`)).map(mode => ({ case: item.id, mode })));
const pairedCases = cases.filter(item => ['off', 'on'].every(mode => seen.has(`${item.id}/${mode}`))).map(item => item.id);
assert(pairedCases.length > 0, 'No complete question pairs to compare');
for (const [file, hash] of Object.entries(sourceHashes)) assert.equal(sha(await readFile(file)), hash, 'Current runtime/fixture differs from evaluated inputs');
const median = values => { const sorted = values.toSorted((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const summary = Object.fromEntries(['off', 'on'].map(mode => {
    const values = rows.filter(r => r.mode === mode && pairedCases.includes(r.case));
    return [mode, { correct: values.filter(r => r.correct).length, total: values.length, forbiddenAnswers: values.filter(r => r.forbiddenAnswerMatches.length).length, medianPromptTokens: median(values.map(r => r.promptTokens)), medianGenerationMs: median(values.map(r => r.generationMs)), medianProviderMs: median(values.map(r => r.providerMs)), maxMemoryTokens: Math.max(...values.map(r => r.memoryTokens)), injected: values.filter(r => r.injected).length }];
}));
const result = { time: new Date().toISOString(), version, configuration, complete, missing, pairedCases, segments, summary, rows, limits: 'One synthetic dialogue; one sample per case/mode; warm index; latency not controlled for provider load or caching; no cross-model pooling.' };
await writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ complete, missing, pairedCases: pairedCases.length, model: configuration.model, summary }, null, 2));
