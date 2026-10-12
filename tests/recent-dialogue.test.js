import test from 'node:test';
import assert from 'node:assert/strict';
import { retentionStart } from '../src/context.js';
import { retrievalQueries } from '../src/memory.js';

const messages = Array.from({ length: 9 }, (_, index) => ({ index, user: index % 2 === 0, text: `Message ${index}`, eligible: true }));

test('recent retention counts the active input and never includes replacement replies', () => {
    assert.equal(retentionStart(messages, 6), 2);
    assert.equal(retentionStart(messages, 0), 0);
    assert.equal(retentionStart(messages, 3), 0);
    assert.equal(retentionStart(messages, 7), 3);
    for (const anchor of [-1, 9, 1.5]) assert.throws(() => retentionStart(messages, anchor), /boundary/);
});

test('blank and ineligible messages cannot consume recent dialogue slots', () => {
    const source = structuredClone(messages);
    source[5].eligible = false; source[3].text = '  ';
    assert.equal(retentionStart(source, 6), 0);
});

test('retention leaves current and complete pending search text unchanged', () => {
    assert.deepEqual(retrievalQueries({ messages }, 'normal', { retainedStart: 4 }), ['Message 8']);
    assert.deepEqual(retrievalQueries({ messages }, 'normal', { retainedStart: 0, requestStart: 6 }), [
        'User: Message 6\n\nAssistant: Message 7\n\nUser: Message 8',
    ]);
});
