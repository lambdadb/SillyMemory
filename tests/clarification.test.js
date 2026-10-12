import test from 'node:test';
import assert from 'node:assert/strict';
import { ClarificationRequest, pendingRequestStart, decodeReply, recoverPendingReplies, conflictsWithReplyProtocol, isReplyTarget } from '../src/clarification.js';
import { retrievalQueries, capture } from '../src/memory.js';
const user = mes => ({ mes, is_user: true, name: 'User' });
const assistant = mes => ({ mes, is_user: false, name: 'Character', extra: {} });
test('the reply protocol binds only to the actual native plain-user target', () => {
    assert.equal(isReplyTarget([user('Question')], 0), true);
    assert.equal(isReplyTarget([user('Question')], 0, 'regenerate'), true);
    assert.equal(isReplyTarget([user('Question'), assistant('Old reply')], 0, 'swipe'), true);
    assert.equal(isReplyTarget([user('Question'), assistant('Old reply')], 0), false);
    for (const input of [user(''), { ...user('File question'), extra: { file: {} } },
        { ...user('Image question'), extra: { media: [{}] } }, { ...user('Tool question'), extra: { tool_invocations: [{}] } }]) {
        const chat = [user('Old question'), assistant('Old reply'), input];
        assert.equal(isReplyTarget(chat, 0), false); assert.equal(isReplyTarget(chat, 2), false);
    }
    assert.equal(isReplyTarget([user('Question'), { mes: 'System', is_system: true }], 0), false);
});
test('custom request conflicts match all native YAML merge and exclusion shapes', () => {
    for (const [included, excluded] of [[[{ response_format: {} }], []], [{}, 'json_schema'], [{}, { messages: true }], [{}, ['stream']], [{ n: 2 }, []]]) {
        assert.equal(conflictsWithReplyProtocol(included, excluded), true);
    }
    assert.equal(conflictsWithReplyProtocol([{ temperature: 0 }], ['frequency_penalty']), false);
});
async function reply(chat, status, text = 'Which visit do you mean?') {
    const request = new ClarificationRequest(), anchor = chat.length - 1;
    await request.prepare(chat, anchor, 'a');
    request.configure({}, chat, 'a');
    chat.push(assistant(JSON.stringify({ reply: text, request_status: status })));
    await request.finish(chat, 'a', anchor + 1);
    return request;
}
test('discarding an older failed attempt preserves the newer request for configuration', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest();
    const older = await request.prepare(chat, 0, 'a');
    const newer = await request.prepare(chat, 0, 'a');
    request.discard(older);
    assert.equal(request.current, newer); assert.equal(request.configure({}, chat, 'a'), true);
    request.discard(newer); assert.equal(request.current, null);
});
test('an invalidated asynchronous preparation cannot replace a newer request', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest(); let olderValid = true;
    const rejected = assert.rejects(request.prepare(chat, 0, 'a', () => olderValid), /Chat changed/);
    olderValid = false;
    const newer = await request.prepare(chat, 0, 'a');
    await rejected; assert.equal(request.current, newer); assert.equal(request.configure({}, chat, 'a'), true);
});
test('pending dialogue survives reload, includes both roles and closes on either terminal status', async () => {
    for (const terminal of ['answered', 'insufficient_evidence']) {
        let chat = [user('Where was it?')];
        await reply(chat, 'needs_clarification');
        chat = JSON.parse(JSON.stringify(chat)); chat.push(user('The museum.'));
        assert.equal(await pendingRequestStart(chat, 2), 0);
        const snapshot = { messages: chat.map((m, index) => ({ index, text: m.mes, user: m.is_user, eligible: true })) };
        assert.deepEqual(retrievalQueries(snapshot, 'normal', { requestStart: 0 }), ['User: Where was it?\n\nAssistant: Which visit do you mean?\n\nUser: The museum.']);
        await reply(chat, terminal, terminal === 'answered' ? 'At the city museum. Would you like directions?' : 'The available excerpts do not establish the place.');
        chat.push(user('Thanks.')); assert.equal(await pendingRequestStart(chat, 4), 4);
    }
});
test('insufficient evidence never opens a clarification span', async () => {
    const chat = [user('What is my account number?')];
    await reply(chat, 'insufficient_evidence', 'I cannot establish that from the available evidence.');
    chat.push(user('Another question.')); assert.equal(await pendingRequestStart(chat, 2), 2);
});
test('edits, deletions, changed swipes and modified prior metadata invalidate saved boundaries', async () => {
    const original = [user('Where?')]; await reply(original, 'needs_clarification');
    original.push(user('The museum.')); await reply(original, 'needs_clarification', 'Which museum visit?'); original.push(user('Last Friday.'));
    assert.equal(await pendingRequestStart(original, 4), 0);
    for (const mutate of [c => c[0].mes = 'When?', c => c[1].mes = 'Edited answer', c => c[1].swipe_id = 1,
        c => c[1].extra.sillymemoryRequest.status = 'answered', c => c.splice(0, 1)]) {
        const chat = structuredClone(original); mutate(chat); assert.equal(await pendingRequestStart(chat, chat.length - 1), chat.length - 1);
    }
});
test('selected swipe state can be restored without using an unselected response', async () => {
    const chat = [user('Where?')]; await reply(chat, 'needs_clarification');
    const pending = structuredClone(chat[1]);
    chat[1] = assistant('At home.'); chat[1].swipe_id = 1;
    chat.push(user('The party.')); assert.equal(await pendingRequestStart(chat, 2), 2);
    chat[1] = pending; assert.equal(await pendingRequestStart(chat, 2), 0);
});
test('invalid and interrupted responses preserve unknown state rather than falsely closing it', async () => {
    const chat = [user('Where?')]; await reply(chat, 'needs_clarification'); chat.push(user('The museum.'));
    const request = new ClarificationRequest(); await request.prepare(chat, 2, 'a'); request.configure({}, chat, 'a');
    chat.push(assistant('{"reply":"Part')); request.cancel();
    const decoded = await request.finish(chat, 'a', 3);
    assert.equal(decoded.status, 'unknown'); assert.equal(decoded.incomplete, true); assert.doesNotMatch(chat[3].mes, /"reply"/);
    chat.push(user('Try again.')); assert.equal(await pendingRequestStart(chat, 4), 0);
    const ctx = { chat, characterId: 0, characters: [{ avatar: 'a.png' }], getCurrentChatId: () => 'chat' };
    assert.equal(capture(ctx).messages[3].eligible, false);
    assert.equal(capture(ctx).messages[3].protocolIncomplete, true);
});
test('a foreign chat or mismatched source cannot adopt a pending provider result', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest(); await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
    const other = [user('Other question'), assistant('Other answer')];
    assert.equal(await request.finish(other, 'b', 1), null); assert.equal(other[1].mes, 'Other answer');
    chat[0].mes = 'Edited'; chat.push(assistant('{"reply":"Which event?","request_status":"needs_clarification"}'));
    await request.finish(chat, 'a', 1); assert.equal(chat[1].extra.sillymemoryRequest.root, null);
});
test('a deleted streaming reply cannot be adopted by deferred completion recovery', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest();
    await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
    chat.push(assistant('{"reply":"unfinished')); request.streaming(chat, 'a');
    chat.pop(); request.cancel();
    assert.equal(await request.finish(chat, 'a', 1), null);
    assert.deepEqual(chat, [user('Where?')]);
});
test('source changes during completion validation leave the reply and recovery marker untouched', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest();
    await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
    chat.push(assistant('{"reply":"Which event?","request_status":"needs_clarification"}')); request.streaming(chat, 'a');
    const original = structuredClone(chat[1]);
    const completion = request.finish(chat, 'a', 1);
    chat[0].mes = 'Edited question.';
    const decoded = await completion;
    assert.equal(decoded, null); assert.deepEqual(chat[1], original);
    assert.deepEqual(await recoverPendingReplies(chat), [1]);
    assert.equal(chat[1].extra.sillymemoryRequest.status, 'unknown');
    assert.equal(chat[1].extra.sillymemoryRequest.root, null);
});
test('ownership loss during completion validation cannot mutate a reply', async () => {
    for (const streaming of [false, true]) {
        const chat = [user('Where?')], request = new ClarificationRequest();
        await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
        const raw = '{"reply":"Which event?","request_status":"needs_clarification"}';
        chat.push(assistant(raw)); if (streaming) request.streaming(chat, 'a');
        let owned = true;
        const completion = request.finish(chat, 'a', 1, () => owned);
        owned = false;
        assert.equal(await completion, null);
        assert.equal(chat[1].mes, raw); assert.equal(chat[1].extra.sillymemoryRequest, undefined);
        assert.equal(chat[1].extra.sillymemoryPending.root, 0);
        assert.deepEqual(await recoverPendingReplies(chat), [1]);
        chat.push(user('The museum.')); assert.equal(await pendingRequestStart(chat, 2), 0);
    }
});
test('schema, tools and multiple-reply conflicts are rejected without overwriting settings', async () => {
    for (const data of [{ json_schema: { name: 'other' } }, { response_format: { type: 'json_object' } }, { tools: [{}] }, { n: 2 }]) {
        const chat = [user('Where?')], request = new ClarificationRequest(); await request.prepare(chat, 0, 'a');
        const before = structuredClone(data); assert.throws(() => request.configure(data, chat, 'a'), /requires one reply/); assert.deepEqual(data, before);
    }
});
test('malformed status and provider refusal remain unknown; valid optional questions remain answered', () => {
    assert.equal(decodeReply('{"reply":"Hello?","request_status":true}').status, 'unknown');
    assert.deepEqual(decodeReply('I cannot help with that.'), { reply: 'I cannot help with that.', status: 'unknown', incomplete: false });
    assert.equal(decodeReply('{"reply":"At home. Anything else?","request_status":"answered"}').status, 'answered');
});
test('a saved in-flight reply is excluded from indexing and recovered on a fresh chat instance', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest();
    await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a'); chat.push(assistant('{"reply":"unfinished'));
    assert.equal(request.streaming(chat, 'a'), 1);
    const restored = JSON.parse(JSON.stringify(chat));
    const ctx = { chat: restored, characterId: 0, characters: [{ avatar: 'a.png' }], getCurrentChatId: () => 'a' };
    assert.equal(capture(ctx).messages[1].eligible, false);
    assert.deepEqual(await recoverPendingReplies(restored), [1]);
    assert.equal(restored[1].extra.sillymemoryRequest.status, 'unknown');
    assert.equal(restored[1].extra.sillymemoryPending, undefined);
    restored.push(user('The museum.')); assert.equal(await pendingRequestStart(restored, 2), 0);
    const ordinary = [user('Where?'), assistant('{"reply":"quoted JSON"}')];
    assert.deepEqual(await recoverPendingReplies(ordinary), []); assert.equal(ordinary[1].mes, '{"reply":"quoted JSON"}');
});
test('stale owned markers after insertion, root deletion or malformed positions become visible incomplete state', async () => {
    for (const change of [c => c.unshift(user('Inserted')), c => c.shift(), c => c[1].extra.sillymemoryPending.root = 99]) {
        const chat = [user('Where?')], request = new ClarificationRequest();
        await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
        chat.push(assistant('{"reply":"unfinished')); request.streaming(chat, 'a'); change(chat);
        const index = chat.findIndex(m => m.extra?.sillymemoryPending);
        assert.deepEqual(await recoverPendingReplies(chat), [index]);
        assert.match(chat[index].mes, /Please regenerate/); assert.equal(chat[index].extra.sillymemoryPending, undefined);
        assert.equal(chat[index].extra.sillymemoryRequest.root, null); assert.equal(chat[index].extra.sillymemoryRequest.status, 'unknown');
        assert.equal(chat[index].extra.sillymemoryRequest.incomplete, true);
    }
});
test('a shifted stream cannot mark or decode another assistant at its old slot', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest();
    await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
    chat.push(assistant('{"reply":"unfinished')); request.streaming(chat, 'a');
    const other = assistant('Unrelated answer'); chat.splice(1, 0, other);
    assert.equal(request.streaming(chat, 'a'), null); assert.equal(await request.finish(chat, 'a', 1), null);
    assert.deepEqual(other, assistant('Unrelated answer')); assert.deepEqual(await recoverPendingReplies(chat), [2]);
});
test('re-authored user text clears stale reply controls without being decoded', async () => {
    const chat = [user('Where?')], request = new ClarificationRequest();
    await request.prepare(chat, 0, 'a'); request.configure({}, chat, 'a');
    chat.push(assistant('{"reply":"unfinished')); request.streaming(chat, 'a');
    chat[1].mes = 'New authored input.'; chat[1].is_user = true;
    assert.deepEqual(await recoverPendingReplies(chat), [1]); assert.equal(chat[1].mes, 'New authored input.');
    assert.equal(chat[1].extra.sillymemoryPending, undefined); assert.equal(chat[1].extra.sillymemoryRequest, undefined);
});
