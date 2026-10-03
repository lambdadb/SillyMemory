import test from 'node:test';
import assert from 'node:assert/strict';
import { LambdaClient, connectionConfig, scopeFilter } from '../src/client.js';
import { runTransportGate } from '../src/gate.js';
const config = { endpoint: 'https://region.example.test', project: 'synthetic' };
const owner = 'a'.repeat(32), scope = 'b'.repeat(64);
test('direct CORS preserves auth/body and query scope without host credentials', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'secret-test-only', { headers: () => ({ 'X-CSRF-Token': 'csrf' }), fetcher: async (url, init) => {
        calls.push({ url, init }); return new Response(JSON.stringify({ docs: [], isDocsInline: true }));
    } });
    await client.upsert('test', [{ id: '1', text: 'synthetic' }]);
    await client.search('test', owner, scope, 'compass');
    await client.deleteIds('test', ['1']);
    assert.equal(calls[0].url, 'https://region.example.test/projects/synthetic/collections/test/docs/upsert');
    assert.equal(calls[0].init.headers['x-api-key'], 'secret-test-only');
    for (const { init } of calls) {
        assert.equal(init.credentials, 'omit'); assert.equal(init.mode, 'cors'); assert.equal(init.redirect, 'error');
        assert.deepEqual(Object.keys(init.headers).sort(), ['Content-Type', 'x-api-key']);
    }
    const body = JSON.parse(calls[1].init.body);
    assert.equal(body.query.knn.queryText, 'compass'); assert.deepEqual(body.query.knn.filter, scopeFilter(owner, scope));
    assert.equal(body.consistentRead, true); assert.deepEqual(body.ref, { kind: 'branch', name: 'main' });
    assert.ok(!JSON.stringify(client).includes('secret-test-only'));
    client.forget(); await assert.rejects(client.get('test'), /Enter your API key again/);
});
test('reject unsafe config and no key; response errors never leak body', async () => {
    for (const endpoint of ['http://bad.test', 'https://key@bad.test', 'https://bad.test/path', 'https://bad.test/?key=secret']) assert.throws(() => connectionConfig({ ...config, endpoint }));
    assert.throws(() => new LambdaClient(config, ''));
    for (const status of [401, 403, 404, 429, 500]) {
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => new Response('secret chat or echoed key', { status }) });
        await assert.rejects(client.get('test'), e => e.status === status && !e.message.includes('secret'));
    }
});
test('ownership mismatch blocks deletion; external result URL receives no key', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'test-key', { fetcher: async (url, init) => {
        calls.push(init.method); return new Response(JSON.stringify({ collection: { tags: { owner: 'someoneelse' } }, docs: [], isDocsInline: false, docsUrl: 'https://untrusted.test' }));
    } });
    await assert.rejects(client.deleteOwnedCollection('test', owner), /Ownership/); assert.deepEqual(calls, ['GET']);
    await assert.rejects(client.search('test', owner, scope, 'query'), /external download/); assert.equal(calls.length, 2);
});
test('synthetic gate verifies upsert/query/delete and always attempts collection cleanup', async () => {
    const order = []; let docs = [];
    const client = {
        async create() { order.push('create'); }, async upsert(_, d) { docs = d; order.push('upsert'); },
        async search() { order.push('knn'); return docs; }, async deleteIds() { docs = []; order.push('delete-docs'); },
        async query() { order.push('verify-delete'); return docs; }, async deleteOwnedCollection() { order.push('cleanup'); },
    };
    assert.equal(await runTransportGate(client, owner, 'smtest'), true);
    assert.deepEqual(order, ['create', 'upsert', 'knn', 'delete-docs', 'verify-delete', 'cleanup']);
    client.search = async () => { throw new Error('network'); };
    await assert.rejects(runTransportGate(client, owner, 'smtest')); assert.equal(order.at(-1), 'cleanup');
});

test('direct 400 remains a bad request, independently of HTTP reason text', async () => {
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => new Response('{}', { status: 400, statusText: 'Unauthorized' }) });
    await assert.rejects(client.get('test'), e => e.status === 400);
});

test('CORS rejection cannot falsely confirm deletion and exposes no credentials', async () => {
    let calls = 0;
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => { calls++; throw new TypeError('private endpoint and key'); } });
    await assert.rejects(client.deleteOwnedCollection('test', owner), e => e.status === 0 && e.code === 'network' && e.message.includes('CORS') && !e.message.includes('private'));
    assert.equal(calls, 1);
});

test('readiness polling retries transient statuses and stops at its fixed limit', async () => {
    const { poll } = await import('../src/gate.js');
    let calls = 0;
    await poll(async () => { calls++; if (calls === 1) throw Object.assign(new Error('not ready'), { status: 503 }); if (calls === 2) throw Object.assign(new Error('limited'), { status: 429 }); return calls === 4; }, { attempts: 4, delayMs: 0 });
    assert.equal(calls, 4);
    calls = 0;
    await assert.rejects(poll(async () => { calls++; return false; }, { attempts: 3, delayMs: 0 }), /Timed out waiting for query visibility/);
    assert.equal(calls, 3);
});

test('readiness polling does not retry permanent authentication errors', async () => {
    const { poll } = await import('../src/gate.js');
    let calls = 0;
    await assert.rejects(poll(async () => { calls++; throw Object.assign(new Error('denied'), { status: 401 }); }, { attempts: 3, delayMs: 0 }), e => e.status === 401);
    assert.equal(calls, 1);
});

test('network failure, timeout and explicit cancellation have distinct safe error codes', async () => {
    const network = new LambdaClient(config, 'test-key', { fetcher: async () => { throw new Error('echoed private key'); } });
    await assert.rejects(network.get('test'), e => e.code === 'network' && !e.message.includes('private'));
    // Keep the process alive independently of AbortSignal.timeout's unref timer.
    const keeper = setTimeout(() => {}, 1000);
    try {
        const timeout = new LambdaClient(config, 'test-key', { timeoutMs: 10, fetcher: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
        await assert.rejects(timeout.get('test'), e => e.code === 'timeout');
        const controller = new AbortController(); controller.abort();
        const canceled = new LambdaClient(config, 'test-key', { fetcher: async (_, { signal }) => { signal.throwIfAborted(); } });
        await assert.rejects(canceled.get('test', controller.signal), e => e.code === 'canceled');
    } finally { clearTimeout(keeper); }
});

test('a response-body deadline is reported as timeout instead of invalid JSON', async () => {
    const keeper = setTimeout(() => {}, 1000);
    try {
        const client = new LambdaClient(config, 'test-key', { timeoutMs: 10, fetcher: async (_, { signal }) => ({ ok: true, status: 200, json: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }) });
        await assert.rejects(client.get('test'), e => e.code === 'timeout');
    } finally { clearTimeout(keeper); }
});
