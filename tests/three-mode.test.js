import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLong, sha } from '../scripts/semantic-long.mjs';
import { threeModeSchedule, threeModeNative, threeModeRetry } from '../scripts/three-mode-plan.mjs';
import { nativePromptEvidence } from '../scripts/three-mode-native.mjs';
import { requestWithRetry } from '../scripts/provider-retry.mjs';

test('fixed three-mode schedule contains every source/mode/repetition exactly once', () => {
    const fixture = loadLong(), schedule = threeModeSchedule(fixture.cases);
    assert.equal(schedule.length, 96); assert.equal(new Set(schedule.map(s => s.id)).size, 96);
    for (const item of fixture.cases) for (const repetition of [1,2]) assert.deepEqual(schedule.filter(s => s.case === item.id && s.repetition === repetition).map(s => s.mode).sort(), ['off','on','vectors']);
    assert.equal(threeModeNative.protect, 8); assert.equal(threeModeNative.query, 2);
    assert.equal(threeModeRetry.maxCalls, 104);
});

test('native evidence requires original speaker text and the exact delivered block', () => {
    const item = loadLong().cases.find(c => c.id === 'long-ko-quotation');
    const text = 'Past events:\n' + item.messages.slice(0,2).map(m => `${m.speaker}: ${m.text}`).join('\n\n');
    const good = nativePromptEvidence(item, text, [{ role: 'system', content: text }]);
    assert.equal(good.memory.completeEvidence, true); assert.equal(good.prompt.completeEvidence, true);
    assert.throws(() => nativePromptEvidence(item, text, [{ role: 'system', content: text.slice(20) }]));
    const missing = 'Past events:\n' + `${item.messages[1].speaker}: ${item.messages[1].text}`;
    assert.equal(nativePromptEvidence(item, missing, [{ role: 'system', content: missing }]).prompt.completeEvidence, false);
    const wrongSpeaker = text.replace('User:', 'Wrong speaker:');
    assert.equal(nativePromptEvidence(item, wrongSpeaker, [{ role: 'system', content: wrongSpeaker }]).prompt.completeEvidence, false);
    assert.equal(sha(text).length, 64);
});

test('expanded comparison call bound remains finite and does not alter the default', async () => {
    const send = async () => new Response('{}', { status: 200 });
    await assert.rejects(requestWithRetry({ body: '{}', send, budget: { calls: 72, retries: 0 }, attempts: [] }), /bound exceeded/);
    await requestWithRetry({ body: '{}', send, budget: { calls: 103, retries: 0 }, attempts: [], maxCalls: 104 });
    await assert.rejects(requestWithRetry({ body: '{}', send, budget: { calls: 104, retries: 0 }, attempts: [], maxCalls: 104 }), /bound exceeded/);
    await assert.rejects(requestWithRetry({ body: '{}', send, budget: { calls: 0, retries: 0 }, attempts: [], maxCalls: Infinity }), /Invalid/);
});
