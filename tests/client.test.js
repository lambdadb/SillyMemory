import test from 'node:test';
import assert from 'node:assert/strict';
import { LambdaClient, connectionConfig, scopeFilter } from '../src/client.js';
import { runTransportGate } from '../src/gate.js';
const config = { endpoint: 'https://region.example.test', project: 'synthetic' };
const owner = 'a'.repeat(32), scope = 'b'.repeat(64);
test('proxy contract preserves auth/body, CSRF, main ref and managed knn filter', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'secret-test-only', { headers: () => ({ 'X-CSRF-Token': 'csrf' }), fetcher: async (url, init) => {
        calls.push({ url, init }); return new Response(JSON.stringify({ docs: [], isDocsInline: true }));
    } });
    await client.upsert('test', [{ id: '1', text: 'synthetic' }]);
    await client.search('test', owner, scope, 'compass');
    await client.deleteIds('test', ['1']);
    assert.equal(calls[0].url, '/proxy/https%3A%2F%2Fregion.example.test%2Fprojects%2Fsynthetic%2Fcollections%2Ftest%2Fdocs%2Fupsert');
    assert.equal(calls[0].init.headers['x-api-key'], 'secret-test-only');
    assert.equal(calls[0].init.headers['X-CSRF-Token'], 'csrf');
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

test('pinned proxy 400 Unauthorized is surfaced as an authentication failure', async () => {
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => new Response('{}', { status: 400, statusText: 'Unauthorized' }) });
    await assert.rejects(client.get('test'), e => e.status === 401 && e.message.includes('Authentication failed'));
});

test('disabled proxy 404 cannot falsely confirm collection cleanup', async () => {
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => new Response('CORS proxy is disabled. Enable it in config.yaml or use the --corsProxy flag.', { status: 404 }) });
    await assert.rejects(client.deleteOwnedCollection('test', owner), e => e.status === 0 && e.message.includes('proxy is disabled'));
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
