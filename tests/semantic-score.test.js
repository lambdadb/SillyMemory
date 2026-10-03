import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLong, longSchedule } from '../scripts/semantic-long.mjs';
import { scoreAnnotations } from '../scripts/semantic-score.mjs';
function fixture() {
    const f = loadLong(), schedule = longSchedule(f);
    const packet = { version: f.version, reportSha256: 'a'.repeat(64), reviewer: null, reviewerType: null, rows: schedule.map((sample, i) => {
        const item = f.cases.find(c => c.id === sample.case);
        return { id: `review-${i}`, question: item.question, source: item.messages.slice(0, 2), expected: item.expected, evidence: item.evidence, answer: `Synthetic response ${i}`, grade: null, rationale: null };
    }) };
    const key = schedule.map((sample, i) => ({ id: `review-${i}`, sample: sample.id }));
    const annotations = structuredClone(packet); annotations.reviewer = 'Unit fixture'; annotations.reviewerType = 'assistant';
    annotations.rows.forEach((row, i) => { row.grade = row.expected.type === 'abstain' || schedule[i].mode === 'off' ? 'abstained' : 'correct'; row.rationale = 'Synthetic test annotation; not actual grading.'; });
    return { packet, key, annotations };
}
test('semantic annotations retain provisional identity and paired strict outcomes without equating abstention with every pass', () => {
    const { packet, key, annotations } = fixture();
    annotations.rows.reverse(); key.reverse();
    const result = scoreAnnotations(packet, key, annotations);
    assert.equal(result.provisional, true); assert.equal(result.independentHumanReview, null);
    assert.deepEqual(result.groups.map(g => g.strictPasses), [4, 32]);
    assert.deepEqual(result.groups.map(g => g.unknownHandled), [4, 4]);
    assert.deepEqual(result.pairs, { improved: 28, tied: 4, regressed: 0 });
});
test('semantic scoring rejects changed rubrics, duplicate mappings, unfilled grades and unsupported unknown passes', () => {
    const mutations = [
        x => { x.annotations.rows[0].expected.answerRule += ' altered'; },
        x => { x.key[0].sample = x.key[1].sample; },
        x => { x.key[0].id = x.key[1].id; },
        x => { x.annotations.rows[0].grade = null; },
        x => { x.annotations.rows[0].rationale = ' '; },
        x => { x.annotations.rows.find(r => r.expected.type === 'abstain').grade = 'correct'; },
        x => { x.annotations.reportSha256 = 'b'.repeat(64); },
        x => { x.packet.rows[0].grade = 'incorrect'; },
        x => { x.key[0].sample = 'foreign'; },
    ];
    for (const mutate of mutations) { const x = fixture(); mutate(x); assert.throws(() => scoreAnnotations(x.packet, x.key, x.annotations)); }
});
