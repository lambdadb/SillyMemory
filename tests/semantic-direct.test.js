import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectAdapter, directProtocol, inspectVectors } from '../scripts/semantic-direct.mjs';
import { schema } from '../src/client.js';
const vector = n => Array(1536).fill(n);
const payload = count => ({ model: directProtocol.model, data: Array.from({ length: count }, (_, index) => ({ index, embedding: vector(index) })).reverse(), usage: { prompt_tokens: count, total_tokens: count } });
const signal = () => AbortSignal.timeout(15000);

test('actual 50, remainder and incremental batches preserve every source field and input order', async () => {
    const requests = [], rows = [];
    const transform = createDirectAdapter({ key: 'test-only-secret', rows, fetcher: async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/embeddings');
        const body = JSON.parse(init.body); requests.push(body);
        assert.equal(body.dimensions, 1536); assert.equal(body.encoding_format, 'float');
        return Response.json(payload(body.input.length));
    } });
    for (const count of [50, 3, 1]) {
        const body = { branch: 'main', docs: Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, text: `문서 ${i}`, owner: 'a', scope: 'b', revision: 'r', message: i, role: 'user' })) };
        const original = structuredClone(body);
        const result = await transform('/collections/owned/docs/upsert', body, { signal: signal(), requestIndex: requests.length });
        assert.deepEqual(body, original);
        assert.deepEqual(requests.at(-1).input, body.docs.map(doc => doc.text));
        result.docs.forEach((doc, i) => { assert.deepEqual(doc.embedding, vector(i)); delete doc.embedding; });
        assert.deepEqual(result, body);
    }
    assert.equal(requests.length, 3); assert.deepEqual(rows.map(r => r.inputCount), [50, 3, 1]);
    assert(rows.every(r => r.preserved)); assert(!JSON.stringify(rows).includes('test-only-secret'));
});

test('schema/query adaptation leaves ownership, filters, reference and query controls unchanged', async () => {
    const rows = [], inputs = [];
    const transform = createDirectAdapter({ key: 'secret', rows, fetcher: async (_, init) => { inputs.push(JSON.parse(init.body).input); return Response.json(payload(1)); } });
    const create = { collectionName: 'owned', tags: { owner: 'abc', application: 'sillymemory' }, indexConfigs: schema, snapshotRetentionInDays: 1 };
    const result = await transform('/collections', create);
    assert.deepEqual(result.indexConfigs.embedding, { type: 'vector', dimensions: 1536, similarity: 'cosine' });
    result.indexConfigs.embedding = schema.embedding; assert.deepEqual(result, create);
    const query = { size: 30, consistentRead: true, includeVectors: false, ref: { kind: 'branch', name: 'main' }, query: { knn: { field: 'embedding', queryText: '어디?', k: 30, filter: { queryString: { query: 'owner:abc AND scope:def' } } } } };
    const converted = await transform('/collections/owned/query', query, { signal: signal() });
    assert.deepEqual(inputs, [['어디?']]); assert(!Object.hasOwn(converted.query.knn, 'queryText'));
    delete converted.query.knn.queryVector; converted.query.knn.queryText = '어디?'; assert.deepEqual(converted, query);
    const deletion = { ids: ['old'], branch: 'main' };
    assert.deepEqual(await transform('/collections/owned/docs/delete', deletion), deletion); assert.equal(inputs.length, 1);
});

test('invalid/repeated/missing indices and non-finite vectors cannot be written', () => {
    for (const mutate of [p => p.data.pop(), p => { p.data[0].index = 0; }, p => { p.data[0].embedding[0] = NaN; }, p => { p.data[0].embedding.pop(); }, p => { p.model = 'wrong'; }]) {
        const p = payload(2); mutate(p); assert.throws(() => inspectVectors(p, 2));
    }
});

test('provider errors and cancellation do not retry or return transformed data', async () => {
    for (const status of [401, 429, 500]) {
        let calls = 0; const rows = [];
        const transform = createDirectAdapter({ key: 'secret', rows, fetcher: async () => { calls++; return new Response('private provider body', { status }); } });
        await assert.rejects(transform('/collections/owned/docs/upsert', { docs: [{ id: 'x', text: 'input' }] }, { signal: signal() }), /Temporary embedding adapter failed/);
        assert.equal(calls, 1); assert.equal(rows[0].providerStatus, status); assert(!JSON.stringify(rows).includes('private provider body'));
    }
    const controller = new AbortController(); let calls = 0;
    const transform = createDirectAdapter({ key: 'secret', rows: [], fetcher: async () => { calls++; controller.abort(); return Response.json(payload(1)); } });
    await assert.rejects(transform('/collections/owned/docs/upsert', { docs: [{ text: 'input' }] }, { signal: controller.signal }));
    assert.equal(calls, 1);
    await assert.rejects(transform('/collections/owned/docs/upsert', { docs: [{ text: 'input' }] }, { signal: controller.signal }));
    assert.equal(calls, 1);
});
