import { collectionResponse, documentResponse, rerankedResponse, accepted } from './helpers/lambdadb-responses.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LambdaClient, connectionConfig, scopeFilter, ANALYZERS, analyzerList, sameAnalyzers, collectionAnalyzers, schema, privateSchema } from '../src/client.js';
import { embeddingIdentity } from '../src/embedding.js';
import { runTransportGate } from '../src/gate.js';
import { readFileSync } from 'node:fs';
const config = { endpoint: 'https://region.example.test', project: 'synthetic' };
const owner = 'a'.repeat(32), scope = 'b'.repeat(64);
test('collection indexes expose source context to reranking without changing embedding input', async () => {
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (_url, init) => {
        const { indexConfigs } = JSON.parse(init.body);
        assert.deepEqual(indexConfigs.role, { type: 'keyword' });
        assert.deepEqual(indexConfigs.conversationTimeContext, { type: 'keyword' });
        assert.deepEqual(indexConfigs.conversationTimestamp, { type: 'datetime' });
        assert.equal(indexConfigs.embedding.embedding.sourceField, 'text');
        assert.deepEqual(indexConfigs.text, { type: 'text', analyzers: ['english'] });
        return Response.json({ collection: collectionResponse() }, { status: 201 });
    } });
    await client.create('synthetic_context', owner, scope);
});
test('text analyzers are normalized before a create request and match the pinned SDK', async () => {
    const sdk = readFileSync(new URL('../vendor/lambdadb.js', import.meta.url), 'utf8').match(/\{Standard:"standard"(?:,[A-Za-z]+:"[a-z]+")+\}/g);
    assert.equal(sdk.length, 1);
    assert.deepEqual([...ANALYZERS].sort(), Object.values(JSON.parse(sdk[0].replace(/([A-Za-z]+):/g, '"$1":'))).sort());
    assert.deepEqual(analyzerList([' Korean', 'english', 'korean']), ['korean', 'english']);
    for (const value of [[], undefined, 'english', ['english', 'klingon']]) assert.throws(() => analyzerList(value), /text analyzer/);
    assert.equal(sameAnalyzers(['korean', 'english'], ['english', 'korean']), true);
    assert.equal(sameAnalyzers(['english'], ['english', 'korean']), false);
    assert.deepEqual(collectionAnalyzers({ collection: collectionResponse() }), ['standard']);
    assert.deepEqual(collectionAnalyzers({ collection: collectionResponse({ indexConfigs: { text: { type: 'text', analyzers: ['english', 'korean'] } } }) }), ['english', 'korean']);
    let requests = 0;
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (_url, init) => {
        requests++;
        assert.deepEqual(JSON.parse(init.body).indexConfigs.text, { type: 'text', analyzers: ['korean', 'english'] });
        return Response.json({ collection: collectionResponse() }, { status: 201 });
    } });
    assert.throws(() => client.create('synthetic_context', owner, scope, ['english', 'klingon']), /Unsupported text analyzer: klingon/);
    assert.equal(requests, 0);
    await client.create('synthetic_context', owner, scope, ['Korean', 'english', 'korean']);
    assert.equal(requests, 1);
});
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
    assert.equal(body.size, 50); assert.equal(body.query.bayesian[0].knn.k, 200);
    assert.equal(body.query.bayesian[0].knn.queryText, 'compass'); assert.deepEqual(body.query.bayesian[0].knn.filter, scopeFilter(owner, scope));
    assert.deepEqual(body.query.bayesian[1].bool[0], { ...scopeFilter(owner, scope), occur: 'filter' });
    assert.deepEqual(body.query.bayesian[1].bool[1], { queryString: { query: 'compass', defaultField: 'text', skipSyntax: true }, occur: 'must' });
    assert.deepEqual(body.rerank, { provider: 'typesafe', model: 'jev-1.13.0', queryText: 'compass', fields: ['role', 'conversationTimeContext', 'text'], candidateSize: 200, onFailure: 'error' });
    assert.equal(body.consistentRead, true); assert.deepEqual(body.ref, { kind: 'branch', name: 'main' });
    assert.ok(!JSON.stringify(client).includes('secret-test-only'));
    client.forget(); await assert.rejects(client.get('test'), /Not connected\. Use Connect to LambdaDB/);
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

test('SDK retries stay disabled for ambiguous failures such as HTTP 503', async () => {
    let count = 0;
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => { count++; return new Response('private', { status: 503 }); } });
    await assert.rejects(client.get('test'), error => error.status === 503);
    await assert.rejects(client.upsert('test', [{ id: 'one' }]), error => error.status === 503);
    assert.equal(count, 2);
});

const limited = (retryAfter = '0') => new Response('private', { status: 429, headers: { 'Retry-After': retryAfter } });
test('HTTP 429 retries reads and writes at most twice, then fails with the same status and no body', async () => {
    let count = 0;
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => { count++; return limited(); } });
    await assert.rejects(client.get('test'), error => error.status === 429 && !JSON.stringify(error).includes('private'));
    await assert.rejects(client.upsert('test', [{ id: 'one' }]), error => error.status === 429);
    assert.equal(count, 6);
    count = 0;
    const recovering = new LambdaClient(config, 'test-key', { fetcher: async () => ++count < 3 ? limited() : Response.json({ collection: collectionResponse() }) });
    assert.equal((await recovering.get('test')).collection.collectionName, 'test');
    assert.equal(count, 3);
});

test('a 429 retry waits for Retry-After or a short backoff, and is not attempted past the call deadline', async () => {
    const ok = () => Response.json({ collection: collectionResponse() });
    for (const [name, response] of [['Retry-After seconds', () => limited('1')], ['default backoff', () => new Response(null, { status: 429 })]]) {
        let count = 0; const started = performance.now();
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => ++count === 1 ? response() : ok() });
        await client.get('test');
        assert.equal(count, 2); assert(performance.now() - started >= 900, name);
    }
    let count = 0;
    const dated = new LambdaClient(config, 'test-key', { fetcher: async () => ++count === 1 ? limited(new Date(Date.now() - 60000).toUTCString()) : ok() });
    await dated.get('test'); assert.equal(count, 2);
    for (const response of [() => limited('30'), () => new Response(null, { status: 429 })]) {
        count = 0;
        const short = new LambdaClient(config, 'test-key', { timeoutMs: 500, fetcher: async () => { count++; return response(); } });
        await assert.rejects(short.get('test'), error => error.status === 429 && error.code !== 'timeout');
        assert.equal(count, 1);
    }
});

test('cancellation or forget during a 429 wait stops the retry with the canceled code', async () => {
    let count = 0; const controller = new AbortController();
    const fetcher = async () => { count++; return limited('5'); };
    const client = new LambdaClient(config, 'test-key', { fetcher });
    const pending = client.get('test', controller.signal);
    await new Promise(resolve => setTimeout(resolve, 50)); controller.abort();
    await assert.rejects(pending, error => error.code === 'canceled');
    assert.equal(count, 1);
    const session = new LambdaClient(config, 'test-key', { fetcher });
    const held = session.get('test');
    await new Promise(resolve => setTimeout(resolve, 50)); session.forget();
    await assert.rejects(held, error => error.code === 'canceled');
    assert.equal(count, 2);
});

test('forget cancels an in-flight SDK request and prevents later authentication', async () => {
    let started; const ready = new Promise(resolve => { started = resolve; }); let calls = 0;
    const client = new LambdaClient(config, 'test-key', { fetcher: async (_, { signal }) => {
        calls++; started(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    } });
    const pending = client.get('test'); await ready; client.forget();
    await assert.rejects(pending, error => error.code === 'canceled');
    await assert.rejects(client.get('test'), /Not connected\. Use Connect to LambdaDB/);
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
        r => { r.rerank.provider = 'different-provider'; }, r => { r.rerank.model = 'different-model'; },
        r => { r.rerank.scoredCount = 0; }, r => { r.rerank.candidateCount = 201; r.rerank.scoredCount = 201; },
        r => { delete r.docs[0].retrievalScore; }]) {
        const response = rerankedResponse([{ id: 'one' }]); change(response);
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => Response.json(response) });
        await assert.rejects(client.search('test', owner, scope, 'What happened?', undefined, 'chat_child'), e => e.code === 'validation');
    }
    for (const key of ['provider', 'model']) {
        const response = rerankedResponse(); response.rerank[key] = 'different';
        const client = new LambdaClient(config, 'test-key', { fetcher: async () => Response.json(response) });
        await assert.rejects(client.search('test', owner, scope, 'What happened?', undefined, 'chat_child'), e => e.code === 'validation');
    }
    const client = new LambdaClient(config, 'test-key', { fetcher: async () => Response.json(rerankedResponse([{ id: 'one' }])) });
    assert.deepEqual(await client.search('test', owner, scope, 'What happened?', undefined, 'chat_child'), [{ id: 'one' }]);
});


test('bundled SDK sends the 200-candidate search and accepts 50 fully reranked results', async () => {
    const docs = Array.from({ length: 50 }, (_, i) => ({ id: `source-${i}` }));
    const response = rerankedResponse(docs);
    response.rerank.candidateCount = response.rerank.scoredCount = 200;
    let calls = 0;
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (_, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.equal(body.query.bayesian[0].knn.k, 200);
        assert.equal(body.rerank.candidateSize, 200);
        assert.equal(body.size, 50);
        return Response.json(response);
    } });
    assert.deepEqual(await client.search('test', owner, scope, 'Where?'), docs);
    assert.equal(calls, 1);
});

test('bundled SDK rejects rerank resource overflow and size mismatches before transport', async () => {
    let calls = 0;
    const client = new LambdaClient(config, 'synthetic', { fetcher: async () => { calls++; return Response.json(rerankedResponse()); } });
    const query = { knn: { field: 'embedding', queryText: 'Where?', k: 200 } };
    const rerank = { provider: 'typesafe', model: 'jev-1.13.0', queryText: 'Where?', fields: ['text'], candidateSize: 200, onFailure: 'error' };
    for (const options of [{ size: 50, rerank: { ...rerank, candidateSize: 1001 } }, { size: 201, rerank }]) {
        await assert.rejects(client.query('test', query, options), e => e.code === 'validation');
    }
    assert.equal(calls, 0);
});

test('search rejects oversized complete queries without sending a truncated request', () => {
    let calls = 0;
    const client = new LambdaClient(config, 'synthetic', { fetcher: async () => { calls++; return Response.json(rerankedResponse()); } });
    for (const input of ['x'.repeat(8193), '界'.repeat(3000), '🧭'.repeat(3000), 'x'.repeat(8191) + '🧭z']) {
        assert.throws(() => client.search('test', owner, scope, input), error =>
            error.name === 'ConnectionError' && error.code === 'query-limit' && error.message.includes('no search was sent'));
    }
    assert.equal(calls, 0);
});

test('the exact UTF-8 query limit preserves identical vector, lexical and reranker signals', async () => {
    for (const input of ['x'.repeat(8192), 'x'.repeat(8188) + '🧭']) {
        const calls = [];
        const client = new LambdaClient(config, 'synthetic', { fetcher: async (url, init) => {
            calls.push(JSON.parse(init.body)); return Response.json(rerankedResponse());
        } });
        await client.search('test', owner, scope, input, undefined, 'chat_child');
        assert.equal(calls.length, 1);
        const body = calls[0];
        assert.equal(body.query.bayesian[0].knn.queryText, input);
        assert.equal(body.query.bayesian[1].bool[1].queryString.query, input);
        assert.equal(body.rerank.queryText, input);
        assert.equal(Buffer.byteLength(input, 'utf8'), 8192);
        assert.equal(body.query.bayesian[0].knn.k, 200);
        assert.deepEqual(body.ref, { kind: 'branch', name: 'chat_child' });
    }
});


test('message boundary filters both search legs before ranking and rejects invalid bounds without a request', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'synthetic-key', { fetcher: async (_, init) => {
        calls.push(JSON.parse(init.body)); return Response.json(rerankedResponse());
    } });
    await client.search('test', owner, scope, 'Where?', undefined, 'chat_test', 4);
    const filter = { queryString: { query: `owner:${owner} AND scope:${scope} AND message:[0 TO 3]` } };
    assert.deepEqual(calls[0].query.bayesian[0].knn.filter, filter);
    assert.deepEqual(calls[0].query.bayesian[1].bool[0], { ...filter, occur: 'filter' });
    for (const boundary of [0, -1, 1.5, NaN, '4']) assert.throws(() => client.search('test', owner, scope, 'Where?', undefined, 'chat_test', boundary), /boundary/);
    assert.equal(calls.length, 1);
});

test('connection verification is one bounded read with no mutations or retry on rejected authentication', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (url, init) => { calls.push({ url, init }); return Response.json({ collections: [] }); } });
    await client.checkConnection();
    assert.equal(calls.length, 1); assert.equal(calls[0].init.method, 'GET');
    assert.equal(new URL(calls[0].url).searchParams.get('size'), '1');
    assert.equal(new URL(calls[0].url).pathname, '/projects/synthetic/collections');
    let rejected = 0;
    const denied = new LambdaClient(config, 'synthetic', { fetcher: async () => { rejected++; return new Response('{}', { status: 401 }); } });
    await assert.rejects(denied.checkConnection(), error => error.status === 401); assert.equal(rejected, 1);
    const malformed = new LambdaClient(config, 'synthetic', { fetcher: async () => Response.json({}) });
    await assert.rejects(malformed.checkConnection(), error => error.code === 'validation');
});

test('a private story has no text field and a plain cosine vector field, with identity tags the SDK accepts', async () => {
    const indexes = privateSchema(768);
    assert.deepEqual(indexes.embedding, { type: 'vector', dimensions: 768, similarity: 'cosine' });
    assert.equal(Object.hasOwn(indexes, 'text'), false);
    const { text, embedding, ...metadata } = schema();
    assert.deepEqual(Object.fromEntries(Object.entries(indexes).filter(([k]) => k !== 'embedding')), metadata);
    for (const bad of [0, -1, 1.5, '768', undefined]) assert.throws(() => privateSchema(bad), /dimension/);
    const identity = await embeddingIdentity({ baseUrl: 'http://localhost:11434/v1', model: 'qwen3-embedding:0.6b', queryPrefix: 'Query:', documentPrefix: '', dimensions: 768 });
    const bodies = [];
    // The real SDK validates the create request, including its five-tag and value rules.
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (_url, init) => {
        bodies.push(JSON.parse(init.body));
        return Response.json({ collection: collectionResponse() }, { status: 201 });
    } });
    await client.create('synthetic_context', owner, scope, ['korean'], identity);
    await client.create('synthetic_context', owner, scope, ['korean']);
    assert.deepEqual(bodies[0].indexConfigs, JSON.parse(JSON.stringify(indexes)), 'private ignores text analyzers');
    assert.deepEqual(bodies[0].tags, { application: 'sillymemory', owner, chat: scope, memory_mode: 'private', embedding: identity.tags.embedding });
    assert.deepEqual(bodies[1].tags, { application: 'sillymemory', owner, chat: scope });
    assert.equal(bodies[1].indexConfigs.embedding.managedEmbedding, true);
    assert.equal(JSON.stringify(bodies[1].indexConfigs), JSON.stringify(schema(['korean'])), 'the default create body is unchanged');
});

test('private search is one dense KNN with the same scope, boundary and branch, and no rerank or lexical leg', async () => {
    const calls = [];
    const client = new LambdaClient(config, 'synthetic', { fetcher: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return Response.json(documentResponse([{ id: 'one' }])); } });
    assert.deepEqual(await client.searchVector('test', owner, scope, [0.6, 0.8], undefined, 'chat_child', 4), [{ id: 'one' }]);
    const { url, init, body } = calls[0];
    assert.equal(url, 'https://region.example.test/projects/synthetic/collections/test/query');
    assert.deepEqual(Object.keys(init.headers).sort(), ['Content-Type', 'x-api-key']);
    assert.equal(init.credentials, 'omit');
    assert.deepEqual(body.query, { knn: { field: 'embedding', queryVector: [0.6, 0.8], k: 200, filter: { queryString: { query: `owner:${owner} AND scope:${scope} AND message:[0 TO 3]` } } } });
    assert.equal(body.size, 50); assert.equal(body.consistentRead, true); assert.equal(body.includeVectors, false);
    assert.deepEqual(body.ref, { kind: 'branch', name: 'chat_child' });
    assert.equal(Object.hasOwn(body, 'rerank'), false);
    assert.ok(!init.body.includes('queryText') && !init.body.includes('"text"'));
    for (const vector of [[], [1, NaN], 'x', undefined]) assert.throws(() => client.searchVector('test', owner, scope, vector), /query vector/);
    for (const boundary of [0, 1.5]) assert.throws(() => client.searchVector('test', owner, scope, [1], undefined, 'chat_child', boundary), /boundary/);
    assert.equal(calls.length, 1);
});
