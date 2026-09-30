import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeSemantic } from '../scripts/semantic-results.mjs';
import { scoreSemantic } from '../scripts/semantic-score.mjs';
const read = file => JSON.parse(readFileSync(new URL(`../docs/results/${file}`, import.meta.url)));
const report = read('semantic-direct-v1.json');
const review = file => read(`semantic-direct-review-v1/${file}.json`);

test('complete direct cohort replays delivery, separate annotations and verified cleanup without becoming managed evidence', () => {
    const summary = summarizeSemantic(report);
    assert.deepEqual(summary, review('summary'));
    assert.match(summary.kind, /temporary direct embeddings/);
    const score = scoreSemantic(report, review('packet'), review('key'), review('assistant-annotations'));
    assert.deepEqual(score, review('assistant-score'));
    assert.equal(score.provisional, true); assert.equal(score.independentHumanReview, null);
    assert.deepEqual(score.groups.map(g => g.strictPasses), [4, 30]);
    assert.equal(report.directEmbeddings.length, 162);
    assert.deepEqual(report.directEmbeddings.filter(r => r.kind === 'upsert').reduce((counts, row) => { counts[row.inputCount] = (counts[row.inputCount] || 0) + 1; return counts; }, {}), { 1: 33, 2: 32, 50: 32 });
    for (const deleted of report.lambdaRequests.filter(r => r.method === 'DELETE')) assert(report.lambdaRequests.some(r => r.path === deleted.path && r.method === 'GET' && r.status === 404));
    assert(report.checks.includes('real keys are absent from browser and persisted host settings'));
});

test('both partial quotation answers have the missing signature in candidates but not in selected memory', () => {
    const failures = report.evaluation.rows.filter(r => r.mode === 'on' && r.coverage.prompt.completeEvidence === false);
    assert.equal(failures.length, 2);
    for (const row of failures) {
        assert.equal(row.case, 'long-ko-quotation');
        assert.deepEqual(row.coverage.prompt.missing, ['signature']);
        assert.deepEqual(row.passages.map(p => p.message), [1, 2, 27, 42]);
        assert.equal(row.memoryTokens, 295); assert.equal(row.effectiveBudget, 320);
        for (const query of row.queries) {
            const signature = query.hits.find(p => p.message === 0);
            assert(signature?.text.includes('해솔의 서명'));
            assert.equal(query.hits.indexOf(signature) + 1, query.query.includes('산호색') ? 9 : 15);
        }
        assert(!row.answer.includes('해솔')); assert(row.answer.includes('수요일'));
    }
});
