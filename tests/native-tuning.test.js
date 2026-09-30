import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTuningPlan, tuningSchedule } from '../scripts/native-tuning-plan.mjs';
import { loadLong } from '../scripts/semantic-long.mjs';
import { threeModeNative } from '../scripts/three-mode-plan.mjs';

test('native tuning changes only Insert# and balances each setting within every case', () => {
    const fixture = loadLong(), schedule = tuningSchedule(fixture.cases);
    assert.equal(schedule.length, 64); assert.equal(new Set(schedule.map(row => row.id)).size, 64);
    for (const item of fixture.cases) {
        const first = schedule.filter(row => row.case === item.id && row.repetition === 1);
        const second = schedule.filter(row => row.case === item.id && row.repetition === 2);
        assert.deepEqual(first.map(row => row.insert).sort((a,b) => a-b), [3,10]);
        assert.deepEqual(first.map(row => row.insert), second.map(row => row.insert).reverse());
    }
    assert(schedule.every(row => row.mode === 'vectors'));
    const plan = buildTuningPlan(text => text.length / 2);
    assert.deepEqual(plan.cases, fixture.cases); assert.deepEqual(plan.settings, fixture.settings);
    assert.deepEqual(plan.generation, fixture.generation); assert.deepEqual(plan.nativeSettings, threeModeNative);
    assert.equal(plan.transportProtocol.maxCalls, 72);
});
