import test from 'node:test';
import assert from 'node:assert/strict';
import { connectThroughConsole } from '../src/app-connect.js';

const project = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222', org = '33333333-3333-4333-8333-333333333333';
const start = { device_code: 'a'.repeat(64), user_code: 'ABCDE-FG234', verification_uri: 'https://app.lambdadb.ai/auth/connect', expires_in: 900, interval: 5 };
const approved = { status: 'approved', request_id: request, project_id: project, organization_id: org };
function fixture(t, responses) {
    const before = globalThis.fetch, calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, ...options });
        const value = responses.shift();
        if (value instanceof Error) throw value;
        assert.ok(value, 'Unexpected request');
        return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    };
    t.after(() => { globalThis.fetch = before; });
    return calls;
}
const options = extra => ({ signal: new AbortController().signal, popup: null, onLink() {}, onStatus() {}, beforeRedeem() {}, wait: async () => {}, ...extra });
test('connection saves recovery identity before one-time redemption and never forwards host credentials', async t => {
    const calls = fixture(t, [start, approved, { endpoint: 'https://region.example.test', project: 'story', credentials: { api_key: 'synthetic-key', key: { key_id: 'key-id' } } }]);
    let saved = false;
    const result = await connectThroughConsole(options({ projectId: project, beforeRedeem: data => {
        assert.equal(calls.length, 2); assert.deepEqual(data, { requestId: request, projectId: project, organizationId: org }); saved = true;
    } }));
    assert.equal(saved, true); assert.equal(result.projectId, project); assert.equal(result.key, 'synthetic-key');
    for (const call of calls) { assert.equal(call.credentials, 'omit'); assert.equal(call.redirect, 'error'); assert.ok(!call.url.includes(start.device_code)); assert.deepEqual(call.headers, { 'Content-Type': 'application/json' }); }
    assert.equal(calls.filter(c => c.url.endsWith('/redeem')).length, 1);
});
test('a region request terminates without credential redemption or recovery mutation', async t => {
    const calls = fixture(t, [start, { status: 'region_requested', project_id: project }]);
    let message;
    const result = await connectThroughConsole(options({ beforeRedeem() { assert.fail('region request cannot redeem'); }, onStatus: text => { message = text; } }));
    assert.equal(result, null); assert.match(message, /Region requested/); assert.equal(calls.length, 2);
});
test('unexpected approval origin and changed pinned targets cannot issue credentials', async t => {
    const calls = fixture(t, [{ ...start, verification_uri: 'https://unexpected.example/auth/connect' }]);
    await assert.rejects(connectThroughConsole(options()), /Unexpected LambdaDB/); assert.equal(calls.length, 1);
});
test('a failed recovery save stops before issuing a key', async t => {
    const calls = fixture(t, [start, approved]);
    await assert.rejects(connectThroughConsole(options({ beforeRedeem() { throw new Error('storage blocked'); } })), /storage blocked/);
    assert.equal(calls.length, 2);
});
test('lost key delivery is never automatically redeemed again', async t => {
    const calls = fixture(t, [start, approved, new Error('synthetic lost response')]);
    await assert.rejects(connectThroughConsole(options()), /could not be confirmed/);
    assert.equal(calls.filter(c => c.url.endsWith('/redeem')).length, 1);
});
test('a different pinned project is rejected before redemption', async t => {
    const calls = fixture(t, [start, { ...approved, project_id: org }]);
    await assert.rejects(connectThroughConsole(options({ projectId: project })), /identity/);
    assert.equal(calls.length, 2);
});
test('cancel ends local waiting and notifies the matching Backend request without host credentials', async t => {
    const calls = fixture(t, [start, { status: 'canceled' }]);
    const controller = new AbortController();
    await assert.rejects(connectThroughConsole(options({ signal: controller.signal, wait: async () => {
        controller.abort(new DOMException('Canceled', 'AbortError')); controller.signal.throwIfAborted();
    } })), error => error.name === 'AbortError');
    assert.ok(calls[1].url.endsWith('/cancel'));
    assert.equal(calls[1].credentials, 'omit');
    assert.equal(JSON.parse(calls[1].body).device_code, start.device_code);
});
