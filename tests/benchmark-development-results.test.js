import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDevelopmentReport, producers } from '../scripts/benchmark-development-results.mjs';
const read = name => JSON.parse(readFileSync(new URL(`../docs/benchmarks/${name}`, import.meta.url)));
test('recorded 70-row host fixture has a complete matrix and provenance', () => {
    const result = validateDevelopmentReport(read('development-preflight-v1.json'), read('development-plan-v1.json'));
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
        const report = read('development-preflight-v1.json'); change(report);
        assert.throws(() => validateDevelopmentReport(report, plan));
    }
});
test('CLI rejects a changed plan hash before accepting recorded host evidence', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { execFileSync } = await import('node:child_process');
    const directory = await mkdtemp(tmpdir() + '/sm-development-report-');
    try {
        const report = read('development-preflight-v1.json'); report.planSha256 = '0'.repeat(64);
        const target = directory + '/changed.json'; await writeFile(target, JSON.stringify(report));
        assert.throws(() => execFileSync(process.execPath, [new URL('../scripts/benchmark-development-results.mjs', import.meta.url).pathname, target], { stdio: 'pipe' }), e => e.status !== 0);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('interrupted native-boundary failure stays distinct from the successful fixture', async () => {
    const { recordedSource } = await import('../scripts/recorded-source.mjs');
    const r = read('development-preflight-interrupted-v1.json');
    assert.equal(r.passed, false); assert.equal(r.cleanup, true); assert.equal(r.rows.length, 63);
    assert.equal(r.traffic.completions, 723);
    assert.deepEqual(r.errors, ['Native vector call outside its arm']);
    assert.equal(r.failure.stage, 'gpt4_7a0daae1/32768/summary');
    assert.deepEqual(Object.keys(r.sourceSha256ByFile).sort(), producers.filter(p => p !== 'scripts/benchmark-native-barrier.mjs').sort());
    for (const [file, hash] of Object.entries(r.sourceSha256ByFile)) recordedSource(file, hash);
    assert.throws(() => validateDevelopmentReport(r, read('development-plan-v1.json')));
});
