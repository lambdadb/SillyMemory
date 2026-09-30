import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { summarizeSemantic } from '../scripts/semantic-results.mjs';
import { scoreSemantic } from '../scripts/semantic-score.mjs';

const read = file => JSON.parse(readFileSync(new URL(`../docs/results/${file}.json`, import.meta.url)));
test('complete managed recall keeps full source coverage separate from remaining answer failures', () => {
    const report = read('managed-packed-baseline-v1');
    const review = name => read(`managed-packed-baseline-review-v1/${name}`);
    assert.equal(report.embeddingMode, 'managed');
    assert.deepEqual(summarizeSemantic(report), review('summary'));
    const score = scoreSemantic(report, review('packet'), review('key'), review('assistant-annotations'));
    assert.deepEqual(score, review('assistant-score'));
    assert.equal(score.provisional, true);
    assert.deepEqual(score.groups.map(group => group.strictPasses), [4, 30]);
    assert.equal(report.providerCalls, 64);
    assert.equal(report.lambdaRequests.filter(request => request.failed).length, 0);
    const known = report.evaluation.rows.filter(row => row.mode === 'on' && row.coverage.prompt.completeEvidence !== null);
    assert.equal(known.length, 28); assert(known.every(row => row.coverage.prompt.completeEvidence));
    const failures = score.rows.filter(row => row.mode === 'on' && !row.strictPass);
    assert.equal(failures.length, 2); assert(failures.every(row => row.case === 'long-ko-quotation' && row.grade === 'partial'));
    for (const request of report.lambdaRequests.filter(request => request.method === 'DELETE')) {
        assert(report.lambdaRequests.some(r => r.method === 'GET' && r.path === request.path && r.status === 404));
    }
});

test('rejected guidance pilots retain the tested runtime and never become product-quality passes', () => {
    const report = read('recall-guide-pilots-v1');
    assert.match(report.decision, /Rejected/); assert.equal(report.provisional, true);
    assert.equal(report.pilots.length, 3);
    for (const pilot of report.pilots) {
        assert(pilot.passedIntegrity && pilot.cleanupComplete);
        assert.equal(pilot.embeddingMode, 'managed'); assert.equal(pilot.providerCalls, 4);
        assert.equal(pilot.rows.length, 4);
        const on = pilot.rows.filter(row => row.mode === 'on');
        assert(on.every(row => row.completeEvidence && row.memoryTokens <= 320));
        assert(on.some(row => row.grade !== 'correct'));
        for (const [source, archive] of [['index.js', 'index'], ['src/memory.js', 'memory'], ['src/delivery.js', 'delivery'], ['src/recall.js', `recall-v${pilot.attempt}`]]) {
            const bytes = readFileSync(new URL(`fixtures/recall-guidance-candidate/${archive}.txt`, import.meta.url));
            assert.equal(createHash('sha256').update(bytes).digest('hex'), pilot.sourceSha256[source]);
        }
    }
    assert(!readFileSync(new URL('../index.js', import.meta.url), 'utf8').includes('preparedGuidance'));
});

test('candidate installation evidence covers a real version update and published-tag rollback', () => {
    const report = read('install-0.2.0-v1');
    assert.equal(report.passed, true); assert.equal(report.checks.length, 20);
    assert.equal(report.initialVersion, '0.1.0'); assert.equal(report.updatedVersion, '0.2.0');
    assert.equal(report.rollbackTag, 'v0.1.0'); assert.equal(report.rollbackSha, report.mainSha);
    assert.notEqual(report.updateSha, report.mainSha);
    assert.equal(report.localProfileRemoved, true); assert.equal(report.proxyRequests, 0);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.api, [{ operation: 'install', status: 200 }, { operation: 'update', status: 200 }]);
});
