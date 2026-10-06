import { collectionResponse, documentResponse, rerankedResponse, accepted } from './helpers/lambdadb-responses.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LambdaClient, connectionConfig, scopeFilter } from '../src/client.js';
import { runTransportGate } from '../src/gate.js';
const config = { endpoint: 'https://region.example.test', project: 'synthetic' };
const owner = 'a'.repeat(32), scope = 'b'.repeat(64);
test('direct CORS preserves auth/body and query scope without host credentials', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'secret-test-only', { headers: () => ({ 'X-CSRF-Token': 'csrf' }), fetcher: async (url, init) => {
        calls.push({ url, init }); return url.endsWith('/query') ? Response.json(rerankedResponse()) : accepted();
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
    assert.equal(body.query.bayesian[0].knn.queryText, 'compass'); assert.deepEqual(body.query.bayesian[0].knn.filter, scopeFilter(owner, scope));
    assert.deepEqual(body.query.bayesian[1].bool[0], { ...scopeFilter(owner, scope), occur: 'filter' });
    assert.deepEqual(body.query.bayesian[1].bool[1], { queryString: { query: 'compass', defaultField: 'text', skipSyntax: true }, occur: 'must' });
    assert.deepEqual(body.rerank, { provider: 'typesafe', model: 'jev-1.13.0', queryText: 'compass', fields: ['text'], candidateSize: 30, onFailure: 'error' });
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
        calls.push(init.method); return Response.json({ collection: collectionResponse({ tags: { owner: 'someoneelse' } }), ...documentResponse(), isDocsInline: false, docsUrl: 'https://untrusted.test' });
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
        const client = new LambdaClient(config, 'test-key', { timeoutMs: 10, fetcher: async (_, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); } }), { headers: { 'Content-Type': 'application/json' } }) });
        await assert.rejects(client.get('test'), e => e.code === 'timeout');
    } finally { clearTimeout(keeper); }
});

test('versioned read/write operations select a direct branch and preserve safe transport', async () => {
    const requests = [];
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (url, init) => {
        requests.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
        return /\/docs\/(upsert|delete)$/.test(url) ? accepted() : Response.json(url.endsWith('/query') ? rerankedResponse([], 'memory') : documentResponse([], 'memory'));
    } });
    await client.upsert('memory', [{ id: 'doc' }], undefined, 'chat_child');
    await client.deleteIds('memory', ['doc'], undefined, 'chat_child');
    await client.search('memory', owner, scope, 'query', undefined, 'chat_child');
    await client.fetchDocs('memory', ['doc'], 'chat_child', false);
    await client.listDocs('memory', 'chat_child');
    assert(requests.slice(0, 2).every(r => r.body.branch === 'chat_child'));
    assert.deepEqual(requests[2].body.ref, { kind: 'branch', name: 'chat_child' });
    assert.equal(requests[2].body.consistentRead, true);
    assert.equal(requests[3].body.consistentRead, false);
    assert.equal(new URL(requests[4].url).searchParams.get('refName'), 'chat_child');
    assert(requests.every(r => r.init.credentials === 'omit' && !Object.hasOwn(r.init.headers, 'X-CSRF-Token')));
    await assert.rejects(client.deleteBranch('memory', 'main'), /default branch/);
    assert.throws(() => client.upsert('memory', [], undefined, '../other'), /Invalid memory branch/);
});

test('SDK validates responses and never exposes malformed payloads or response bodies', async () => {
    for (const payload of ['private-invalid-json', JSON.stringify({ collection: { secret: 'private-invalid-shape' } })]) {
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => new Response(payload, { headers: { 'Content-Type': 'application/json' } }) });
        await assert.rejects(client.get('test'), error => error.code === 'validation' && !JSON.stringify(error).includes('private') && !error.cause);
    }
});

test('SDK retries stay disabled for reads and writes, including ambiguous failures', async () => {
    for (const status of [429, 503]) {
        let count = 0;
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => { count++; return new Response('private', { status }); } });
        await assert.rejects(client.get('test'), error => error.status === status);
        await assert.rejects(client.upsert('test', [{ id: 'one' }]), error => error.status === status);
        assert.equal(count, 2);
    }
});

test('forget cancels an in-flight SDK request and prevents later authentication', async () => {
    let started; const ready = new Promise(resolve => { started = resolve; }); let calls = 0;
    const client = new LambdaClient(config, 'test-key', { fetcher: async (_, { signal }) => {
        calls++; started(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    } });
    const pending = client.get('test'); await ready; client.forget();
    await assert.rejects(pending, error => error.code === 'canceled');
    await assert.rejects(client.get('test'), /Enter your API key again/);
    assert.equal(calls, 1); assert(!JSON.stringify(client).includes('test-key'));
});

test('external downloads are blocked for query, fetch, and list before any storage request', async () => {
    let calls = 0;
    const client = new LambdaClient(config, 'test-key', { fetcher: async url => {
        calls++; assert(url.startsWith(config.endpoint));
        return Response.json({ ...documentResponse(), isDocsInline: false, docsUrl: 'https://storage.example.test/private' });
    } });
    for (const run of [() => client.query('test', {}), () => client.fetchDocs('test', ['one']), () => client.listDocs('test')]) {
        await assert.rejects(run(), /external download/);
    }
    assert.equal(calls, 3);
});

test('SDK diagnostics remain silent even when environment debugging is requested', async () => {
    const old = process.env.LAMBDADB_DEBUG, log = console.log, group = console.group, end = console.groupEnd;
    const logged = []; process.env.LAMBDADB_DEBUG = 'true';
    console.log = console.group = console.groupEnd = (...args) => logged.push(args);
    try {
        const client = new LambdaClient(config, 'synthetic-secret', { fetcher: async () => Response.json({ collection: collectionResponse() }) });
        await client.get('test'); assert.deepEqual(logged, []);
    } finally {
        console.log = log; console.group = group; console.groupEnd = end;
        if (old === undefined) delete process.env.LAMBDADB_DEBUG; else process.env.LAMBDADB_DEBUG = old;
    }
});

test('managed rerank metadata must confirm application or an empty candidate pool', async () => {
    for (const change of [r => { delete r.rerank; }, r => { r.rerank.status = 'fallback'; },
        r => { r.rerank.scoredCount = 0; }, r => { r.rerank.candidateCount = 31; },
        r => { delete r.docs[0].retrievalScore; }]) {
        const response = rerankedResponse([{ id: 'one' }]); change(response);
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => Response.json(response) });
        await assert.rejects(client.search('test', owner, scope, 'What happened?', undefined, 'chat_child'), e => e.code === 'validation');
    }
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => Response.json(rerankedResponse([{ id: 'one' }])) });
    assert.deepEqual(await client.search('test', owner, scope, 'What happened?', undefined, 'chat_child'), [{ id: 'one' }]);
});


test('search bounds every signal to the same whole-code-point 8 KiB UTF-8 prefix', async () => {
    const cases = [
        ['界'.repeat(3000), '界'.repeat(2730)],
        ['🧭'.repeat(3000), '🧭'.repeat(2048)],
        ['x'.repeat(8191) + '🧭z', 'x'.repeat(8191)],
        ['x'.repeat(8188) + '🧭', 'x'.repeat(8188) + '🧭'],
    ];
    for (const [input, expected] of cases) {
        const calls = [];
        const client = new LambdaClient(config, 'synthetic', { fetcher: async (url, init) => {
            calls.push(JSON.parse(init.body)); return Response.json(rerankedResponse());
        } });
        await client.search('test', owner, scope, input, undefined, 'chat_child');
        assert.equal(calls.length, 1, 'The SDK accepts the bounded request');
        const body = calls[0];
        assert.equal(body.query.bayesian[0].knn.queryText, expected);
        assert.equal(body.query.bayesian[1].bool[1].queryString.query, expected);
        assert.equal(body.rerank.queryText, expected);
        assert(Buffer.byteLength(expected, 'utf8') <= 8192);
        assert.equal(body.query.bayesian[0].knn.k, 30);
        assert.deepEqual(body.ref, { kind: 'branch', name: 'chat_child' });
    }
});
