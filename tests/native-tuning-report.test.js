import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeThreeModes, scoreThreeModes, threeModeReviewPacket } from '../scripts/three-mode-results.mjs';
import { loadLong, sha } from '../scripts/semantic-long.mjs';

const read = suffix => JSON.parse(readFileSync(new URL(`../docs/results/native-tuning-v1-${suffix}.json`, import.meta.url)));
test('paired native tuning evidence and provisional grades reproduce from all 64 answers', () => {
    const report = read('raw');
    assert.deepEqual(summarizeThreeModes(report), read('summary'));
    assert.deepEqual(threeModeReviewPacket(report), read('review'));
    assert.deepEqual(scoreThreeModes(report, read('assistant-annotations')), read('assistant-score'));
    assert.equal(sha(readFileSync(new URL('../docs/results/native-tuning-v1-plan.json', import.meta.url))), report.evaluation.planSha256);
    // Check exact tail roles/order independently of substring-based source coverage.
    for (const row of report.evaluation.rows) {
        const item = loadLong().cases.find(item => item.id === row.case);
        assert.deepEqual(report.generations[row.index].messages.slice(-8, -1), item.messages.slice(-7).map(message => ({ role: message.role, content: message.text })), row.id);
        assert.equal(report.generations[row.index].messages.at(-1).content, item.question);
    }
});

test('tuning verifier rejects unbalanced settings, wrong queries, lost evidence and cleanup', () => {
    for (const change of [
        report => report.evaluation.rows.pop(),
        report => { report.evaluation.rows[0].insert = 10; },
        report => { report.evaluation.rows[0].nativeQuery.request.topK = 10; },
        report => { report.evaluation.rows[0].nativeQuery.request.collectionId = 'foreign-chat'; },
        report => { report.generations[0].messages = []; },
        report => { report.generations[0].providerAnswer = 'rewritten'; },
        report => { report.nativeCleanup.pop(); },
        report => { report.lambdaRequests.push({ method: 'GET', path: '/collections/foreign', status: 200 }); },
        report => { report.evaluation.rows[0].recentPreserved = false; },
    ]) {
        const report = read('raw'); change(report);
        assert.throws(() => summarizeThreeModes(report));
    }
});

test('native tuning annotations cannot change answers or exclude failures', () => {
    const report = read('raw'), changed = read('assistant-annotations');
    changed.rows[0].answer = 'rewritten';
    assert.throws(() => scoreThreeModes(report, changed));
    const missing = read('assistant-annotations'); missing.rows.pop();
    assert.throws(() => scoreThreeModes(report, missing));
});
