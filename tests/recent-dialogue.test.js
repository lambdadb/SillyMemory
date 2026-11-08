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

test('a boundary inside a turn bundle moves back to its eligible input', () => {
    const source = structuredClone(messages.slice(0, 8));
    assert.equal(archiveBoundary({ messages: source }), 2);
    source[2].eligible = false;
    assert.equal(archiveBoundary({ messages: source }), 3, 'an ineligible input has no indexed input to align to');
    // Consecutive replies belong to the bundle of the preceding input.
    source[2].eligible = true; source[2].user = false;
    assert.equal(archiveBoundary({ messages: source }), 0);
    source[2].user = true; source[2].text = '';
    assert.equal(archiveBoundary({ messages: source }), 3, 'a blank input has no indexed input to align to');
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

// The previous rule stepped back exactly one message to an adjacent eligible input.
function pairBoundary(snapshot, type) {
    const anchor = retentionAnchor(snapshot.messages, type);
    if (anchor < 0) return 0;
    const start = retentionStart(snapshot.messages, anchor);
    const first = snapshot.messages[start], previous = snapshot.messages[start - 1];
    return first.eligible !== false && first.text.trim() && !first.user
        && previous?.user && previous.eligible !== false && previous.text.trim() ? start - 1 : start;
}

test('alternating single-character chats keep the previous pair boundary', () => {
    for (let length = 1; length <= 10; length++) {
        for (let mask = 0; mask < 3 ** length; mask++) {
            // Each message is eligible, ineligible or blank; roles alternate from the user.
            const source = Array.from({ length }, (_, index) => {
                const kind = Math.floor(mask / 3 ** index) % 3;
                return { index, user: index % 2 === 0, text: kind === 2 ? ' ' : `Message ${index}`, eligible: kind !== 1 };
            });
            for (const type of ['normal', 'regenerate', 'swipe', 'continue', 'impersonate']) {
                assert.equal(archiveBoundary({ messages: source }, type), pairBoundary({ messages: source }, type));
            }
        }
    }
});

const turn = (user, text, name = user ? 'User' : 'Member') => ({ user, text, name, eligible: true });
test('group bundles with several replies archive whole bundles', () => {
    // Two members answer each input.
    const source = [];
    for (let round = 0; round < 4; round++) source.push(turn(true, `Input ${round}`), turn(false, `A ${round}`, 'Alice'), turn(false, `B ${round}`, 'Bob'));
    const at = length => archiveBoundary({ messages: source.slice(0, length) });
    // New input: the five-message window starts inside the previous bundle.
    assert.equal(at(10), 3, 'a new input keeps the whole bundle its window starts in');
    assert.equal(at(11), 6, 'the first reply completes a five-message window at the previous input');
    assert.equal(at(12), 6, 'the second reply keeps the previous bundle instead of splitting it');
    assert.equal(at(7), 0);
    // Every archived boundary is an input or the plain boundary.
    for (let length = 1; length <= source.length; length++) {
        const boundary = at(length);
        assert(boundary === 0 || source[boundary].user, `length ${length} boundary ${boundary}`);
    }
});

test('a current bundle of five or more messages archives every earlier bundle', () => {
    const source = [turn(true, 'Old input'), turn(false, 'Old reply'), turn(true, 'Current input'),
        ...['A', 'B', 'C', 'D', 'E'].map(name => turn(false, `${name} reply`, name))];
    assert.equal(archiveBoundary({ messages: source.slice(0, 6) }), 0, 'a four-message current bundle keeps the previous bundle');
    for (let length = 7; length <= source.length; length++) assert.equal(archiveBoundary({ messages: source.slice(0, length) }), 2);
    // Auto-mode keeps extending the current bundle: the whole run stays recent.
    const auto = [...source, ...Array.from({ length: 6 }, (_, i) => turn(false, `Auto ${i}`, 'A'))];
    assert.equal(archiveBoundary({ messages: auto }), 2);
});

test('fresh group greetings before the first input keep the plain message boundary', () => {
    const greetings = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Finn'].map(name => turn(false, `${name} greeting`, name));
    assert.equal(archiveBoundary({ messages: greetings.slice(0, 5) }), 0);
    assert.equal(archiveBoundary({ messages: greetings }), 1);
    assert.equal(archiveBoundary({ messages: [...greetings, turn(true, 'First input')] }), 2);
    // Greetings before the first input are archived message by message.
    const answered = [...greetings, turn(true, 'First input'), turn(false, 'Alice reply', 'Alice'), turn(false, 'Bob reply', 'Bob')];
    assert.equal(archiveBoundary({ messages: answered }), 4);
    assert.equal(archiveBoundary({ messages: [...answered, turn(false, 'Carol reply', 'Carol')] }), 5);
    assert.equal(archiveBoundary({ messages: answered }, 'swipe'), 3);
    assert.equal(archiveBoundary({ messages: answered }, 'regenerate'), 2);
});

test('a group swipe excludes only the swiped reply and keeps earlier member replies', () => {
    const round = [turn(true, 'Old input'), turn(false, 'Old reply'), turn(true, 'Where is the key?'), turn(false, 'Alice reply', 'Alice'), turn(false, 'Bob reply', 'Bob')];
    assert.equal(retentionAnchor(round, 'swipe'), 3, 'swiping Bob keeps Alice');
    assert.equal(retentionAnchor(round.slice(0, 4), 'swipe'), 2, 'swiping the first reply keeps only its input');
    assert.deepEqual(retrievalQueries({ messages: round }, 'swipe'), ['User: Where is the key?']);
    // Alice stays in the recent window rather than being archived.
    assert.equal(archiveBoundary({ messages: round }, 'swipe'), 0);
    // Regenerate keeps excluding every reply after the latest input from retention.
    assert.equal(retentionAnchor(round.slice(0, 4), 'regenerate'), 2);
    // Group Regenerate deletes the round and generates with type normal.
    assert.equal(retentionAnchor(round.slice(0, 3), 'normal'), 2);
    assert.equal(retentionAnchor([turn(false, 'Greeting')], 'swipe'), 0);
});

test('alternating swipe and regenerate keep the previous latest-input retention', () => {
    const previous = (source, type) => {
        const user = source.findLastIndex(m => m.user);
        return (type === 'regenerate' || type === 'swipe') && user >= 0 ? user : source.length - 1;
    };
    for (let length = 1; length <= messages.length; length++) {
        const chat = messages.slice(0, length);
        // Swipe replaces the final reply; regenerate sees source after the host deleted it.
        if (!chat.at(-1).user) assert.equal(retentionAnchor(chat, 'swipe'), previous(chat, 'swipe'));
        if (chat.at(-1).user) assert.equal(retentionAnchor(chat, 'regenerate'), previous(chat, 'regenerate'));
    }
});
