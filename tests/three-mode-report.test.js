import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeThreeModes, scoreThreeModes, threeModeReviewPacket } from '../scripts/three-mode-results.mjs';
import { sha } from '../scripts/semantic-long.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../docs/results/${name}.json`, import.meta.url)));
test('complete live three-mode record revalidates evidence separately from provisional answers', () => {
    const report = read('three-mode-v1-raw');
    assert.deepEqual(summarizeThreeModes(report), read('three-mode-v1-summary'));
    assert.deepEqual(threeModeReviewPacket(report), read('three-mode-v1-review'));
    assert.deepEqual(scoreThreeModes(report, read('three-mode-v1-assistant-annotations')), read('three-mode-v1-assistant-score'));
    const planBytes = readFileSync(new URL('../docs/results/three-mode-v1-plan.json', import.meta.url));
    assert.equal(sha(planBytes), report.evaluation.planSha256);
});

test('comparison verifier rejects missing samples, native delivery, cleanup and changed answers', () => {
    for (const change of [
        r => r.evaluation.rows.pop(),
        r => { r.generations[2].messages = []; },
        r => { r.nativeCleanup = []; },
        r => { r.generations[0].providerAnswer = 'invented'; },
        r => { r.evaluation.rows.find(row => row.mode === 'vectors').nativeQuery.request.collectionId = 'another-chat'; },
        r => { r.lambdaRequests = r.lambdaRequests.filter(row => row.status !== 404); },
    ]) {
        const report = read('three-mode-v1-raw'); change(report);
        assert.throws(() => summarizeThreeModes(report));
    }
});

test('semantic annotations cannot rewrite captured answers or omit unfavorable samples', () => {
    const report = read('three-mode-v1-raw');
    const changed = read('three-mode-v1-assistant-annotations'); changed.rows[0].answer = 'rewritten';
    assert.throws(() => scoreThreeModes(report, changed));
    const missing = read('three-mode-v1-assistant-annotations'); missing.rows.pop();
    assert.throws(() => scoreThreeModes(report, missing));
});
