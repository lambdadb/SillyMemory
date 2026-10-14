import test from 'node:test';
import assert from 'node:assert/strict';
import { retentionStart, retentionAnchor } from '../src/context.js';
import { retrievalQueries, archiveBoundary, documents } from '../src/memory.js';

const messages = Array.from({ length: 9 }, (_, index) => ({ index, user: index % 2 === 0, text: `Message ${index}`, eligible: true }));

test('recent retention counts the active input and never includes replacement replies', () => {
    assert.equal(retentionStart(messages, 6), 2);
    assert.equal(retentionStart(messages, 0), 0);
    assert.equal(retentionStart(messages, 3), 0);
    assert.equal(retentionStart(messages, 7), 3);
    for (const anchor of [-1, 9, 1.5]) assert.throws(() => retentionStart(messages, anchor), /boundary/);
});

test('current-message search preserves roles, skips special source and excludes replacement answers', () => {
    const source = [
        { user: true, text: 'Older question' },
        { user: false, text: 'The playlist is called Project P.' },
        { user: false, text: 'Private attachment text', eligible: false },
        { user: false, text: '  ' },
        { user: true, text: 'What was its original name?' },
        { user: false, text: 'Superseded replacement answer' },
    ];
    const expected = 'User: What was its original name?';
    for (const type of ['normal', 'regenerate', 'swipe']) {
        assert.deepEqual(retrievalQueries({ messages: source }, type), [expected]);
    }
    assert.deepEqual(retrievalQueries({ messages: source }, 'continue'), [
        'Assistant: Superseded replacement answer',
    ]);
    assert.deepEqual(retrievalQueries({ messages: source }, 'impersonate'), ['Assistant: Superseded replacement answer']);
});

test('ordinary storage contains only completed messages outside the five-message window; checkpoints keep all', async () => {
    const snapshot = { chat: 'synthetic', character: 'test.png', memory: { story: 'synthetic' }, messages: structuredClone(messages) };
    const config = { chunkChars: 800, archiveBefore: archiveBoundary(snapshot) };
    assert.equal(config.archiveBefore, 4);
    assert.deepEqual((await documents(snapshot, 'owner', config)).docs.map(d => d.message), [0, 1, 2, 3]);
    assert.deepEqual((await documents(snapshot, 'owner', { chunkChars: 800 })).docs.map(d => d.message), [0, 1, 2, 3, 4, 5, 6, 7]);
    snapshot.messages.push({ index: 9, user: false, text: 'Replacement answer', eligible: true });
    assert.equal(archiveBoundary(snapshot, 'regenerate'), 4);
    assert.equal(archiveBoundary(snapshot, 'swipe'), 4);
    assert.equal(archiveBoundary(snapshot), 4);
    assert.equal(archiveBoundary({ messages: [] }), 0);
    for (const archiveBefore of [-1, 11, 1.5]) await assert.rejects(documents(snapshot, 'owner', { ...config, archiveBefore }), /boundary/);
});

test('blank and ineligible messages cannot consume recent dialogue slots', () => {
    const source = structuredClone(messages);
    source[5].eligible = false; source[3].text = '  ';
    assert.equal(retentionStart(source, 6), 0);
});

test('pair-aligned retention is five at a new user input and six after its reply', () => {
    for (let length = 5; length <= 9; length++) {
        const snapshot = { messages: messages.slice(0, length) };
        assert.equal(archiveBoundary(snapshot), length % 2 ? length - 5 : Math.max(0, length - 6));
    }
    const snapshot = { messages: [...messages, { user: false, eligible: true, text: 'Replacement' }] };
    for (const type of ['regenerate', 'swipe']) assert.equal(archiveBoundary(snapshot, type), 4);
    for (const type of ['continue', 'impersonate']) assert.equal(archiveBoundary(snapshot, type), 4);
});

test('only adjacent eligible user/assistant messages form an archival pair', () => {
    const source = structuredClone(messages.slice(0, 8));
    assert.equal(archiveBoundary({ messages: source }), 2);
    source[2].eligible = false;
    assert.equal(archiveBoundary({ messages: source }), 3, 'an ineligible input cannot form an indexed pair');
    // A greeting or consecutive assistant turn is not paired with a remote user.
    source[2].eligible = true; source[2].user = false;
    assert.equal(archiveBoundary({ messages: source }), 3);
    source[2].user = true; source[2].text = '';
    assert.equal(archiveBoundary({ messages: source }), 3);
    const greeting = [{ user: false, text: 'Greeting', eligible: true }];
    assert.equal(archiveBoundary({ messages: greeting }), 0);
    assert.equal(archiveBoundary({ messages: [...greeting, ...messages.slice(0, 6)] }), 1,
        'a standalone greeting can be archived without splitting the first user/reply pair');
});

test('ineligible and blank active inputs retain the preceding answer without changing query eligibility', () => {
    for (const active of [{ user: true, text: 'Attached input', eligible: false }, { user: true, text: '', eligible: true }]) {
        const source = [...messages.slice(0, 8), active, { user: false, text: 'Replacement reply', eligible: true }];
        assert.equal(retentionAnchor(source.slice(0, -1), 'normal'), 8);
        assert.equal(retentionAnchor(source, 'regenerate'), 8);
        assert.equal(retentionAnchor(source, 'swipe'), 8);
        assert.equal(retentionStart(source, 8), 3);
        assert.deepEqual(retrievalQueries({ messages: source }), ['User: Message 6']);
        assert.equal(retentionAnchor(source, 'continue'), 9);
        assert.equal(retentionAnchor(source, 'impersonate'), 9);
    }
    assert.equal(retentionAnchor([]), -1);
    assert.equal(retentionAnchor(messages.slice(0, 8), 'normal'), 7);
});
