import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedMessages, inspectPrompt, deliverySummary, PromptDelivery } from '../src/delivery.js';
import { recordedSource } from '../scripts/recorded-source.mjs';

const source = (mes, is_user = false, index = 0) => ({ mes, is_user, index });
const expected = (memory = [], recent = []) => ({ memory: expectedMessages(memory), recent: expectedMessages(recent) });

test('final prompt includes full content with the original native role, not just a label', () => {
    const input = expected([source('[Past conversation excerpt] fact')], [source('question', true)]);
    const result = inspectPrompt(input, [{ role: 'assistant', content: 'Mira: [Past conversation excerpt] fact' }, { role: 'user', content: 'question' }]);
    assert.equal(result.memory[0].outcome, 'included');
    assert.equal(result.recent[0].outcome, 'included');
    assert.match(deliverySummary(result, true), /1\/1 memory passages and 1\/1 recent/);
    const partial = inspectPrompt(input, [{ role: 'assistant', content: '[Past conversation excerpt]' }, { role: 'assistant', content: 'question' }]);
    assert.ok([...partial.memory, ...partial.recent].every(m => m.outcome === 'missing'));
    assert.match(deliverySummary(partial, true), /Generation stopped/);
    assert.match(deliverySummary(partial, false), /^Warning/);
});

test('duplicates consume separate prompt messages and CRLF and text parts are supported', () => {
    const input = expected([], [source('same\r\ntext', true), source('same\r\ntext', true)]);
    const result = inspectPrompt(input, [{ role: 'user', content: [{ type: 'text', text: 'same\ntext' }, { type: 'image_url', image_url: {} }] }]);
    assert.deepEqual(result.recent.map(m => m.outcome), ['included', 'missing']);
});

test('known name macros are expanded without executing arbitrary macros twice', () => {
    const recent = expectedMessages([source('{{user}} asked {{char}}.'), source('{{random::one::two}}')], { user: 'User', character: 'Mira' });
    const result = inspectPrompt({ memory: [], recent }, [{ role: 'assistant', content: 'User asked Mira.' }]);
    assert.deepEqual(result.recent.map(m => m.outcome), ['included', 'unverified']);
    assert.match(deliverySummary(result, true), /could not be verified/);
    assert.doesNotMatch(deliverySummary(result, true), /Generation stopped/);
});

test('continuation prefix is explicitly unverified rather than falsely lost', () => {
    const recent = expectedMessages([source('question', true), source('partial answer')], { continuation: true });
    const result = inspectPrompt({ memory: [], recent }, [{ role: 'user', content: 'question' }]);
    assert.deepEqual(result.recent.map(m => m.outcome), ['included', 'unverified']);
});

test('pending delivery ignores dry runs, rejects stale snapshots and consumes once', () => {
    const tracker = new PromptDelivery(), input = expected([source('fact')]);
    let current = true;
    tracker.begin(input, () => current);
    assert.equal(tracker.finish([], true), undefined);
    assert.equal(tracker.finish([]).lost, true);
    assert.equal(tracker.finish([]), undefined);
    tracker.begin(input, () => current); current = false;
    assert.equal(tracker.finish([]), undefined);
    tracker.begin(input, () => true); tracker.clear();
    assert.equal(tracker.finish([]), undefined);
});

test('newer generation replaces pending evidence and unsupported formats stay unverified', () => {
    const tracker = new PromptDelivery();
    tracker.begin(expected([source('old')]), () => true);
    tracker.begin(expected([source('new')]), () => true);
    assert.equal(tracker.finish([{ role: 'assistant', content: 'new' }]).lost, false);
    tracker.begin(expected([source('new')]), () => true);
    const result = tracker.finish('text completion');
    assert.equal(result.result, null); assert.equal(result.lost, false);
    assert.match(deliverySummary(null, true), /unavailable/);
});

test('historical source evidence accepts only the archived hash, never an arbitrary mismatch', () => {
    assert.ok(recordedSource('index.js', 'e02dbd971a7864a58bbb87394b29391bb05ac6f10073668cd4da30c90cb7f301'));
    assert.throws(() => recordedSource('index.js', '0'.repeat(64)), /Recorded source mismatch/);
});
