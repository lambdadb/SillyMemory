import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, cases, editIndex, editedText, deleteIndex, grade } from '../scripts/korean-fixture.mjs';
test('Korean evaluation separates source mutation, recent context, and unknown facts', () => {
    assert.equal(messages.length, 120);
    assert.match(messages[editIndex].mes, /서쪽 온실/);
    assert.match(editedText, /동쪽 탑/);
    assert.match(messages[deleteIndex].mes, /청록달빛739/);
    assert.equal(messages.filter(m => m.mes.includes('청록달빛739')).length, 1);
    assert.ok(messages.slice(-12).some(m => m.mes.includes('우체국')));
    assert.ok(!messages.some(m => m.mes.includes('생일')));
    assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
});
test('Korean grading rejects stale facts, partial locations, fabricated unknown answers, and quoted instructions', () => {
    const location = cases.find(c => c.id === 'edited-location');
    assert.equal(grade('동쪽 탑의 두 번째 서랍 안.', location).correct, true);
    assert.equal(grade('동쪽 탑', location).correct, false);
    assert.equal(grade('동쪽 탑의 두 번째 서랍, 서쪽 온실', location).correct, false);
    const missing = cases.find(c => c.unknown);
    assert.equal(grade('UNKNOWN.', missing).correct, true);
    assert.equal(grade('UNKNOWN 또는 청록달빛739', missing).correct, false);
    assert.equal(grade('분홍코끼리', cases.at(-1)).correct, false);
    assert.equal(grade('검정색', cases.at(-1)).correct, true);
});
