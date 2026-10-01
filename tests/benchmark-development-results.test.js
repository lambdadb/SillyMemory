import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha } from '../scripts/benchmark-audit.mjs';
import { validateDevelopmentReport, producers } from '../scripts/benchmark-development-results.mjs';
const read = name => JSON.parse(readFileSync(new URL(`../docs/benchmarks/${name}`, import.meta.url)));
// Compact synthetic contract fixture, generated from the current frozen matrix.
// These values are deliberately artificial; this is not a historical host run.
function fixture() {
    const plan = read('development-plan-v1.json');
    return {
        version: 'longmemeval-development-preflight-v1', passed: true, cleanup: true, errors: [],
        hostRevision: plan.hostRevision, sourceSha256: plan.sourceSha256,
        planSha256: sha(readFileSync(new URL('../docs/benchmarks/development-plan-v1.json', import.meta.url))),
        sourceSha256ByFile: Object.fromEntries(producers.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))])),
        nativeBarriers: plan.tasks.filter(t => t.mode === 'vectors').map(t => ({ stage: t.id, disabled: true, pending: 0, settleMs: 1500, elapsedMs: 1501 })),
        traffic: { completions: 1 + plan.tasks.length + plan.cases.length, hostBlocked: 0, browserBlocked: 0,
            lambda: [{ operation: 'docs/upsert', count: 1 }] },
        summaries: plan.cases.map(c => ({ id: c.id, context: 32768, calls: 1,
            steps: [{ outputCap: 1024, triggerMessage: 10, storedAt: 9 }] })),
        rows: plan.tasks.map(t => {
            const c = plan.cases.find(c => c.id === t.caseId);
            const retained = t.context === 131072 ? c.sourceMessages : 1;
            return { id: c.id, context: t.context, mode: t.mode, inputSha256: c.inputSha256,
                sourceMessages: c.sourceMessages, nonemptyMessages: c.sourceMessages,
                sourcePreserved: true, questionDelivered: true, hostPromptBudget: t.context - plan.generator.maxOutputTokens,
                hostPromptTokens: 100, nativeSourceIndexes: Array.from({ length: retained }, (_, i) => i),
                exactNativeRoleMessages: retained,
                ...(t.mode === 'sillymemory' ? { retrieval: { queries: [{}], selected: [{}], preparedMessages: 1,
                    deliveredMessages: 1, memoryTokens: 10, memoryBudget: 800, uniqueValidCandidates: 1, unselectedValidCandidates: [] } } : {}),
            };
        }),
    };
}
test('synthetic report exercises the full matrix and current producer contract', () => {
    const result = validateDevelopmentReport(fixture(), read('development-plan-v1.json'));
    assert.equal(result.rows, 70); assert.equal(result.externalProviderCalls, 0);
});
test('missing producers, source drift, duplicate rows and false delivery fail validation', () => {
    const plan = read('development-plan-v1.json');
    for (const change of [
        r => { r.sourceSha256ByFile = {}; },
        r => { r.sourceSha256 = '0'.repeat(64); },
        r => { r.sourceSha256ByFile['src/memory.js'] = '0'.repeat(64); },
        r => { r.rows[1] = structuredClone(r.rows[0]); },
        r => { r.rows.pop(); },
        r => { r.rows.find(x => x.mode === 'sillymemory').retrieval.deliveredMessages = 0; },
        r => { r.traffic.completions--; },
        r => { r.traffic.lambda.find(x => x.operation === 'docs/upsert').count = 51; },
        r => { r.cleanup = false; },
        r => { r.nativeBarriers[0].pending = 1; },
    ]) {
        const report = fixture(); change(report);
        assert.throws(() => validateDevelopmentReport(report, plan));
    }
});
test('CLI accepts the current synthetic contract and rejects a changed plan hash', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { execFileSync } = await import('node:child_process');
    const directory = await mkdtemp(tmpdir() + '/sm-development-report-');
    try {
        const report = fixture(), target = directory + '/synthetic.json';
        await writeFile(target, JSON.stringify(report));
        const result = JSON.parse(execFileSync(process.execPath, [new URL('../scripts/benchmark-development-results.mjs', import.meta.url).pathname, target], { encoding: 'utf8' }));
        assert.equal(result.rows, 70);
        report.planSha256 = '0'.repeat(64); await writeFile(target, JSON.stringify(report));
        assert.throws(() => execFileSync(process.execPath, [new URL('../scripts/benchmark-development-results.mjs', import.meta.url).pathname, target], { stdio: 'pipe' }), e => e.status !== 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an interrupted synthetic run is rejected even when cleanup succeeded', () => {
    const r = fixture(); r.passed = false; r.rows.pop();
    r.errors = ['Native vector call outside its arm']; r.failure = { stage: 'fixture-summary' };
    assert.throws(() => validateDevelopmentReport(r, read('development-plan-v1.json')));
});
