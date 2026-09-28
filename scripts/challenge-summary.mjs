import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { challengeCases, challengeVersion, challengeSettings, gradeChallenge } from './recall-challenges.mjs';
import { heldoutCases, heldoutVersion, heldoutSettings, answerEvidence } from './heldout-fixture.mjs';
import { injectionEvidence } from './comparison-summary.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function summarizeChallenges(reports, { partial = false, heldout = false } = {}) {
    const cases = heldout ? heldoutCases() : challengeCases();
    const settings = heldout ? heldoutSettings : challengeSettings;
    const version = heldout ? heldoutVersion : challengeVersion;
    const samples = cases.flatMap((item, i) => (i % 2 ? ['on', 'off'] : ['off', 'on']).map(mode => ({ item, mode })));
    assert(reports.length, 'Reports required');
    const rows = [], seen = new Set(); let hashes, configuration;
    for (const report of reports) {
        assert(report.passed === true && !report.failure, 'Report must pass all integrity checks before aggregation');
        assert(report.cleanupComplete && report.nativeCleanupComplete, 'Cleanup must be verified');
        assert.equal(report.evaluation?.version, version);
        assert.equal(report.evaluation.fixtureHash, hash(cases), 'Fixture mismatch');
        assert.deepEqual(report.evaluation.settings, settings);
        const config = { model: report.model, host: report.sillyTavern, context: report.hostContextTokens, output: report.maxOutputTokens, reasoningEffort: report.reasoningEffort, excludedParameters: report.excludedParameters };
        assert.equal(config.model, 'gpt-4.1-mini-2025-04-14'); assert.equal(config.context, settings.context);
        assert.equal(config.host, '06bde939fb1e9c4c8d8641d810f0a916b5bce127'); assert.equal(config.output, 256);
        assert.equal(report.generator, 'live compatible model');
        const source = Object.fromEntries(['index.js', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/status.js', 'scripts/recall-challenges.mjs', 'scripts/challenge-eval.mjs', 'scripts/generation-smoke.mjs', 'scripts/generation-cleanup.mjs', ...(heldout ? ['scripts/heldout-fixture.mjs'] : [])].map(f => { assert(report.sourceSha256?.[f], `Missing hash: ${f}`); return [f, report.sourceSha256[f]]; }));
        if (hashes) { assert.deepEqual(source, hashes, 'Mixed runtime or evaluation source'); assert.deepEqual(config, configuration, 'Mixed configuration'); }
        hashes = source; configuration = config;
        for (const row of report.evaluation.rows) {
            assert(Number.isInteger(row.index) && samples[row.index], 'Invalid sample index');
            assert(!seen.has(row.index), 'Duplicate sample'); seen.add(row.index);
            const { item, mode } = samples[row.index];
            assert.equal(row.case, item.id); assert.equal(row.mode, mode); assert.equal(row.label, item.label);
            assert.equal(row.type, item.type); assert.equal(row.kind, item.kind);
            assert(Number.isFinite(row.sourceTokens) && (item.kind === 'overflow' ? row.sourceTokens > settings.context : row.sourceTokens < settings.context - 1000), 'Invalid context boundary');
            assert.equal(row.sourceHash, hash(item.source.map(m => ({ text: m.mes, user: m.is_user, name: m.name }))));
            assert.equal(row.correct, gradeChallenge(row.answer, item.label), 'Incorrect grading');
            if (heldout) assert.deepEqual(row.answerEvidence, answerEvidence(row.answer, item.label), 'Incorrect code evidence');
            const matches = report.generations.filter(g => g.stage === `challenge/${item.id}/${mode}`);
            assert.equal(matches.length, 1, 'Missing or duplicate generation'); const g = matches[0];
            assert.equal(g.upstreamStatus, 200); assert.equal(g.finishReason, 'stop'); assert.deepEqual(g.challenge, row);
            assert.equal(g.providerAnswer.trim(), row.answer.trim(), 'Provider answer mismatch');
            const evidence = injectionEvidence(g, mode === 'on' ? 'sillymemory' : 'off');
            const injected = Boolean(evidence?.injected);
            assert.equal(row.injected, injected); assert.equal(row.memoryTokens, evidence?.memoryTokens || 0);
            const prompt = g.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
            assert.equal(row.targetInPrompt, prompt.includes(item.label));
            assert.equal(row.targetInMemory, injected && g.memoryInspection.includes(item.label));
            assert.equal(row.sourceMessagesPresent, item.source.filter(m => prompt.includes(m.mes.trim())).length);
            assert(item.source.slice(-11).every(m => prompt.includes(m.mes.trim())), 'Recent source missing');
            if (mode === 'off') assert(item.kind === 'overflow' ? row.sourceMessagesPresent < item.source.length : row.sourceMessagesPresent === item.source.length, 'Invalid baseline inclusion');
            assert(Number.isFinite(row.promptTokens) && row.promptTokens > 0 && row.promptTokens === g.providerUsage?.prompt_tokens, 'Missing provider token evidence');
            for (const suffix of ['identical source restored', 'intended context boundary verified', 'original source preserved', 'recent source retained']) assert(report.checks.includes(`${item.id}/${mode}: ${suffix}`), 'Missing integrity check');
            rows.push(row);
        }
    }
    rows.sort((a, b) => a.index - b.index);
    if (!partial) assert.equal(rows.length, samples.length, 'Incomplete evaluation');
    const metrics = subset => ({ ...(heldout ? { expectedCodeOnly: subset.filter(r => r.answerEvidence.expectedCodeOnly).length } : {}), total: subset.length, correct: subset.filter(r => r.correct).length, injected: subset.filter(r => r.injected).length, correctInjected: subset.filter(r => r.injected && r.correct).length, targetInPrompt: subset.filter(r => r.targetInPrompt).length, targetInMemory: subset.filter(r => r.targetInMemory).length });
    return { version, complete: rows.length === samples.length, completedSamples: rows.length, missingSamples: samples.map((_, i) => i).filter(i => !seen.has(i)), sourceHashes: hashes, configuration, summary: Object.fromEntries(['off','on'].map(mode => [mode, metrics(rows.filter(r => r.mode === mode))])), rows, limits: 'One synthetic answer per case/mode; strict label grading; overflow baseline is truncated; no ANN ground truth or statistical superiority claim.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2), partial = args.includes('--partial'), heldout = args.includes('--heldout');
    if (heldout) args.splice(args.indexOf('--heldout'), 1);
    if (partial) args.splice(args.indexOf('--partial'), 1);
    const at = args.indexOf('--output'); assert(at >= 0 && args[at + 1], 'Specify --output');
    const output = args[at + 1]; args.splice(at, 2); assert(!args.includes(output), 'Do not overwrite input');
    const inputs = await Promise.all(args.map(async file => { const raw = await readFile(file, 'utf8'); return { file, sha256: createHash('sha256').update(raw).digest('hex'), report: JSON.parse(raw) }; }));
    const summary = summarizeChallenges(inputs.map(i => i.report), { partial, heldout });
    await writeFile(output, JSON.stringify({ ...summary, inputs: inputs.map(({ report, ...identity }) => identity) }, null, 2));
    console.log(JSON.stringify({ complete: summary.complete, completedSamples: summary.completedSamples, summary: summary.summary }));
}
