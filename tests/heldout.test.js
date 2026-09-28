import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { heldoutCases, answerEvidence } from '../scripts/heldout-fixture.mjs';
import { challengeCases } from '../scripts/recall-challenges.mjs';
test('held-out cases counterbalance both referents and keep unique facts outside recent memory', () => {
    const cases = heldoutCases();
    assert.equal(createHash('sha256').update(JSON.stringify(cases)).digest('hex'), '961182cc341b14f58c8b1060c0a4cc8297a6d4c8bea57b238383e8824b1e93d9');
    assert.equal(cases.length, 12); assert.equal(new Set(cases.map(c => c.id)).size, 12);
    assert.deepEqual(cases, heldoutCases());
    for (let i = 0; i < cases.length; i += 2) {
        const [a, b] = cases.slice(i, i + 2);
        assert.equal(a.label, b.otherLabel); assert.equal(a.otherLabel, b.label);
        assert.deepEqual(a.source.slice(0, -4), b.source.slice(0, -4));
        for (const c of [a, b]) {
            assert.equal(c.source.filter(m => m.mes.includes(c.label)).length, 1);
            assert(!c.source.slice(-12).some(m => m.mes.includes(c.label)));
            assert(!challengeCases().some(old => old.label === c.label));
            assert.equal(c.type, c.kind === 'continue' ? 'continue' : 'normal');
        }
    }
});
test('answer evidence separates strict format and code presence without accepting competing codes', () => {
    assert.deepEqual(answerEvidence('PLUM-326입니다.', 'PLUM-326'), { strictCorrect: false, expectedCodeOnly: true, codes: ['PLUM-326'] });
    assert(answerEvidence('PLUM-326.', 'PLUM-326').strictCorrect);
    for (const answer of ['UNKNOWN', 'PLUM-3260', 'MOSS-815', 'PLUM-326 or MOSS-815']) assert(!answerEvidence(answer, 'PLUM-326').expectedCodeOnly);
});
