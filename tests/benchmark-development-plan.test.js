import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { developmentPlan } from '../scripts/benchmark-development-plan.mjs';
import { adaptLongMemEval, sha } from '../scripts/benchmark-audit.mjs';
const read = name => readFileSync(new URL(`../docs/benchmarks/${name}`, import.meta.url));
test('schedule never adapts held-out data and uses the worst context for all retry reservations', () => {
    const data = Array.from({ length: 14 }, (_, i) => ({ question_id: `case-${i}`, question: 'Who?', question_date: '2023/01/02 (Mon) 12:00', haystack_dates: ['2023/01/01 (Sun) 12:00'], haystack_session_ids: ['session'], haystack_sessions: [[{ role: 'user', content: 'public' }]] }));
    const samples = data.map((r, sourceIndex) => ({ id: r.question_id, sourceIndex, split: 'development', inputSha256: sha(JSON.stringify(adaptLongMemEval(r))) }));
    samples.push({ id: 'held-out', sourceIndex: 14, split: 'evaluation' });
    Object.defineProperty(data, 14, { get() { throw new Error('Held-out touched'); } });
    const pilot = { arms: { off: {}, vectors: {}, summary: {}, sillymemory: {} }, cases: samples.slice(0, 2), generator: {} };
    const plan = developmentPlan({ samples }, data, pilot, {});
    assert.equal(plan.tasks.length, 70); assert.equal(new Set(plan.tasks.map(t => t.id)).size, 70);
    assert.equal(plan.tasks.filter(t => t.reusePilot).length, 8); assert.equal(plan.newAnswers, 62);
    assert.equal(plan.tasks.filter(t => t.context === 131072 && t.mode === 'off').length, 14);
    const required = (48 + plan.maxSummaryCalls) * (32768 * .4 + 1024 * 1.6) / 1e6
        + (14 + 16) * (131072 * .4 + 1024 * 1.6) / 1e6 + 62 * (4096 * 2.5 + 10 * 10) / 1e6 + .1;
    assert.equal(plan.limits.openaiUsd, Math.ceil(required));
    assert.throws(() => developmentPlan({ samples: samples.slice(1) }, data, pilot, {}));
});
test('committed plan binds the frozen split and preserves original pilot inputs', () => {
    const plan = JSON.parse(read('development-plan-v1.json')), selectionBytes = read('selection-v1.json');
    assert.equal(plan.selectionSha256, sha(selectionBytes)); assert.equal(plan.sourceSha256, sha(read('sources-v1.json')));
    assert.equal(plan.pilotPlanSha256, sha(read('pilot-design-v1.json')));
    assert.deepEqual(plan.cases.map(c => c.id), JSON.parse(selectionBytes).samples.filter(s => s.split === 'development').map(s => s.id));
    const pilot = JSON.parse(read('pilot-design-v1.json'));
    for (const old of pilot.cases) assert.equal(plan.cases.find(c => c.id === old.id).inputSha256, old.inputSha256);
    assert.deepEqual(plan.cases.filter(c => c.literalizedMessages.length).map(c => [c.id, c.literalizedMessages]), [['60bf93ed_abs', [220, 224]]]);
});
