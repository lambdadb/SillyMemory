import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callbackChannel, connectWithLambdaDB } from '../src/app-connect.js';

const api = 'https://api.example.test', issuer = 'https://auth.example.test/';
const callback = 'https://tavern.example.test/scripts/extensions/third-party/SillyMemory/oauth-callback.html';
const project = '11111111-1111-4111-8111-111111111111', connection = '22222222-2222-4222-8222-222222222222';
const metadata = {
    issuer, authorization_endpoint: `${issuer}oauth2/auth`, token_endpoint: `${issuer}oauth2/token`,
    registration_endpoint: `${issuer}oauth2/register`, revocation_endpoint: `${issuer}oauth2/revoke`,
};
const issued = { connection_id: connection, endpoint: 'https://region.example.test', project_id: project, project_name: 'story', key_id: 'key-1', api_key: 'synthetic-key' };

// Routes fetch by method and path; the handler may override any route.
function fixture(t, overrides = {}) {
    const before = globalThis.fetch, calls = [];
    const routes = {
        'GET /.well-known/oauth-protected-resource': () => [200, { resource: api, authorization_servers: [issuer], lambdadb_console_url: 'https://app.example.test' }],
        'GET /.well-known/openid-configuration': () => [200, metadata],
        'POST /oauth2/register': () => [201, { client_id: 'registered-client-1' }],
        'POST /project-connections': () => [201, { connection_id: connection, expires_at: '2026-11-03T00:15:00Z' }],
        'POST /oauth2/token': () => [200, { access_token: 'setup-token', token_type: 'bearer', expires_in: 900, scope: 'connection:read connection:issue' }],
        [`GET /project-connections/${connection}`]: () => [200, { connection_id: connection, status: 'ready', project_id: project }],
        [`POST /project-connections/${connection}/key`]: () => [201, issued],
        'POST /oauth2/revoke': () => [200, null],
        ...overrides,
    };
    globalThis.fetch = async (url, options = {}) => {
        const target = new URL(url), key = `${options.method ?? 'GET'} ${target.pathname}`;
        calls.push({ key, url, ...options });
        const route = routes[key];
        assert.ok(route, `Unexpected request ${key}`);
        const [status, body] = route(options);
        return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    };
    t.after(() => { globalThis.fetch = before; });
    return calls;
}
// Stands in for the callback page: replies on the attempt's channel once the popup navigates.
function browser(reply = (state) => ({ state, code: 'auth-code' })) {
    const channels = new Map();
    const popup = { set location(_) {}, get location() {
        return { set href(url) {
            const state = new URL(url).searchParams.get('state');
            popup.opened = new URL(url);
            queueMicrotask(() => channels.get(callbackChannel(state))?.onmessage?.({ data: reply(state) }));
        } };
    } };
    const openChannel = name => { const channel = { close() { channels.delete(name); } }; channels.set(name, channel); return channel; };
    return { popup, openChannel };
}
const memory = (saved = null) => ({ saved, read() { return this.saved; }, write(value) { this.saved = value; } });
const options = extra => ({ signal: new AbortController().signal, apiOrigin: api, callback, clients: memory(), beforeIssue() {}, ...browser(), ...extra });

test('Connect registers once, binds the connection, saves recovery only before issuance, and discards the setup token', async t => {
    const calls = fixture(t), clients = memory(), order = [];
    const { popup, openChannel } = browser();
    const result = await connectWithLambdaDB(options({ popup, openChannel, clients, projectId: project,
        beforeIssue: r => { order.push(['issue', r]); assert.ok(popup.opened); assert.ok(!calls.some(c => c.key.endsWith('/key'))); } }));
    assert.deepEqual(result, { endpoint: 'https://region.example.test', project: 'story', projectId: project, key: 'synthetic-key', keyId: 'key-1' });
    assert.deepEqual(order, [['issue', { connectionId: connection, projectId: project }]]);
    assert.deepEqual(clients.saved, { issuer, callback, clientId: 'registered-client-1' });
    const register = JSON.parse(calls.find(c => c.key === 'POST /oauth2/register').body);
    assert.deepEqual(register.redirect_uris, [callback]);
    assert.equal(register.token_endpoint_auth_method, 'none');
    assert.deepEqual(JSON.parse(calls.find(c => c.key === 'POST /project-connections').body), { client_id: 'registered-client-1', project_id: project });
    const q = popup.opened.searchParams;
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.equal(q.get('connection_id'), connection);
    assert.equal(q.get('redirect_uri'), callback);
    assert.equal(q.get('audience'), api);
    const exchange = new URLSearchParams(calls.find(c => c.key === 'POST /oauth2/token').body);
    assert.equal(exchange.get('code'), 'auth-code');
    assert.ok(exchange.get('code_verifier').length >= 43);
    const key = calls.find(c => c.key.endsWith('/key'));
    assert.equal(key.body, undefined, 'the issuance claim takes an empty body');
    assert.equal(key.headers.Authorization, 'Bearer setup-token');
    assert.equal(new URLSearchParams(calls.at(-1).body).get('token'), 'setup-token');
    for (const call of calls) { assert.equal(call.credentials, 'omit'); assert.equal(call.redirect, 'error'); }
});

test('a saved installation is reused, and a removed registration is replaced once', async t => {
    let rejected = false;
    const calls = fixture(t, { 'POST /project-connections': options => {
        const body = JSON.parse(options.body);
        if (body.client_id === 'saved-client' && !rejected) { rejected = true; return [400, { error: 'invalid_client' }]; }
        return [201, { connection_id: connection }];
    } });
    const clients = memory({ issuer, callback, clientId: 'saved-client' });
    await connectWithLambdaDB(options({ clients }));
    assert.equal(calls.filter(c => c.key === 'POST /oauth2/register').length, 1);
    assert.equal(clients.saved.clientId, 'registered-client-1');
    const reused = fixture(t);
    await connectWithLambdaDB(options({ clients }));
    assert.equal(reused.filter(c => c.key === 'POST /oauth2/register').length, 0);
});

test('an approval without key issuance fails without a key claim and still discards the setup token', async t => {
    const calls = fixture(t, {
        'POST /oauth2/token': () => [200, { access_token: 'setup-token', token_type: 'bearer', scope: 'connection:read' }],
        [`GET /project-connections/${connection}`]: () => [200, { connection_id: connection, status: 'ready', project_id: project }],
    });
    await assert.rejects(connectWithLambdaDB(options({ beforeIssue() { assert.fail('a read-only approval cannot issue a key'); } })), /did not allow a project key/);
    assert.equal(calls.filter(c => c.key.endsWith('/key')).length, 0);
    assert.equal(calls.at(-1).key, 'POST /oauth2/revoke');
});

test('a denial or a message for another attempt never exchanges a code or saves recovery', async t => {
    const calls = fixture(t);
    const noRecovery = () => assert.fail('an attempt that ends before the key claim has nothing to recover');
    await assert.rejects(connectWithLambdaDB(options({ ...browser(state => ({ state, error: 'access_denied' })), beforeIssue: noRecovery })), /not approved/);
    assert.equal(calls.filter(c => c.key === 'POST /oauth2/token').length, 0);
    const controller = new AbortController();
    const pending = connectWithLambdaDB(options({ ...browser(() => ({ state: 'another-attempt', code: 'stolen' })), signal: controller.signal }));
    setTimeout(() => controller.abort(new DOMException('Connection canceled', 'AbortError')), 50);
    await assert.rejects(pending, /canceled/);
    assert.equal(calls.filter(c => c.key === 'POST /oauth2/token').length, 0);
});

test('provider endpoints off the issuer, a changed pinned project and uncertain delivery cannot issue a key', async t => {
    fixture(t, { 'GET /.well-known/openid-configuration': () => [200, { ...metadata, token_endpoint: 'https://attacker.example/token' }] });
    await assert.rejects(connectWithLambdaDB(options()), /unavailable right now/);
    const moved = fixture(t, { [`GET /project-connections/${connection}`]: () => [200, { connection_id: connection, status: 'ready', project_id: '33333333-3333-4333-8333-333333333333' }] });
    await assert.rejects(connectWithLambdaDB(options({ projectId: project })), /existing project/);
    assert.equal(moved.filter(c => c.key.endsWith('/key')).length, 0);
    fixture(t, { [`POST /project-connections/${connection}/key`]: () => [409, { error: 'issuance_unconfirmed', connection_id: connection }] });
    await assert.rejects(connectWithLambdaDB(options({ projectId: project })), /delivery is uncertain/);
});

test('the callback page posts only state and code on the attempt channel and clears the query', () => {
    const source = readFileSync(new URL('../oauth-callback.js', import.meta.url), 'utf8');
    assert.match(source, /history\.replaceState\(null, '', location\.pathname\)/);
    assert.match(source, /new BroadcastChannel\(`sillymemory-oauth-\$\{state\}`\)/);
    assert.equal(callbackChannel('abc'), 'sillymemory-oauth-abc');
    assert.doesNotMatch(source, /opener|api_key|localStorage/);
});
