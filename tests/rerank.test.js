import test from 'node:test';
import assert from 'node:assert/strict';
import { rerankInput, rerankSearch } from '../scripts/rerank-query.mjs';
import { rerankCases, gradeRerank, evidenceCoverage, compareCandidateSets, passesExactMatchGate } from '../scripts/rerank-eval.mjs';
const owner = 'a'.repeat(64), scope = 'b'.repeat(64);
test('reranking preserves query depth, branch, consistent reads and identity filter', () => {
    const vector = rerankInput(owner, scope, 'Where now?', 'chat_test', 'vector');
    const rerank = rerankInput(owner, scope, 'Where now?', 'chat_test', 'rerank');
    const { rerank: config, ...retrieval } = rerank;
    assert.deepEqual(retrieval, vector);
    assert.equal(vector.query.knn.k, 30); assert.equal(vector.size, 30);
    assert.equal(vector.consistentRead, true); assert.deepEqual(vector.ref, { kind: 'branch', name: 'chat_test' });
    assert.equal(vector.query.knn.filter.queryString.query, `owner:${owner} AND scope:${scope}`);
    assert.equal(config.candidateSize, 30); assert.equal(config.queryText, 'Where now?');
    assert.deepEqual(config.fields, ['text']); assert.equal(config.onFailure, 'returnOriginal');
    assert(!('criteria' in config)); assert(!('sort' in rerank));
    assert.throws(() => rerankInput(owner, scope, 'x', 'main', 'rerank'));
    assert.throws(() => rerankInput(owner, scope, '界'.repeat(3000), 'chat_test', 'rerank'));
});
test('hook passes cancellation and retains applied scores without treating fallback as applied', async () => {
    const signal = new AbortController().signal, trace = { mode: 'rerank', queries: [] };
    let status = 'applied';
    const client = { inlineDocs: r => r.docs.map(row => row.doc), call: async (operation, actualSignal) => {
        assert.equal(actualSignal, signal);
        return operation({ collection: () => ({ query: async (input, opts) => {
            assert.equal(opts.signal, signal);
            return { docs: [{ doc: { id: 'one', owner, scope, text: 'passage' }, score: 0.7, ...(status === 'applied' ? { retrievalScore: 0.2 } : {}) }], rerank: { status } };
        } }) }, { signal });
    } };
    await rerankSearch(trace).call(client, 'collection', owner, scope, 'question', signal, 'chat_test');
    assert.equal(trace.queries[0].scores[0].retrievalScore, 0.2);
    status = 'fallback';
    await rerankSearch(trace).call(client, 'collection', owner, scope, 'question', signal, 'chat_test');
    assert.equal(trace.queries[1].rerank.status, 'fallback');
    assert.equal(trace.queries[1].scores[0].retrievalScore, undefined);
    client.inlineDocs = () => [{ owner, scope: 'foreign' }];
    await assert.rejects(rerankSearch(trace).call(client, 'collection', owner, scope, 'question', signal, 'chat_test'), /Unfiltered/);
});
test('frozen cases separate retrieval, delivery and answer correctness', () => {
    assert.equal(rerankCases.length, 12); assert.equal(new Set(rerankCases.map(c => c.id)).size, 12);
    for (const item of rerankCases) {
        assert.equal(item.source.length, 44);
        assert(item.evidence.every(text => item.source.some(m => m.mes.includes(text))));
        assert(!item.source.slice(-4).some(m => item.facts.some(f => m.mes.includes(f))));
        assert(gradeRerank(item.answer + '.', item.answer));
        assert(!gradeRerank('Maybe ' + item.answer, item.answer));
    }
    assert.deepEqual(evidenceCoverage([{ text: 'Old state' }], ['Old state', 'Correction']), [true, false]);
    const a = { text: 'one', hits: [{ id: 'a' }, { id: 'b' }] }, b = { text: 'two', hits: [{ id: 'c' }] };
    assert(compareCandidateSets([a, b], [b, { ...a, hits: a.hits.toReversed() }]));
    assert(!compareCandidateSets([a], [{ ...a, hits: [{ id: 'a' }] }]));
});
test('official SDK serializes managed reranking and retains response metadata', async () => {
    const { LambdaClient } = await import('../src/client.js');
    const { documentResponse } = await import('./helpers/lambdadb-responses.js');
    let body;
    const client = new LambdaClient({ endpoint: 'https://memory.example', project: 'project' }, 'test-only', { fetcher: async (_url, init) => {
        body = JSON.parse(init.body);
        const response = documentResponse([{ id: 'one', owner, scope, text: 'The compass is in the cabinet.' }], 'collection');
        response.docs[0].score = 0.9; response.docs[0].retrievalScore = 0.4;
        response.rerank = { status: 'applied', provider: 'typesafe', model: 'jev-1.13.0', candidateCount: 1, scoredCount: 1, took: 20, criteriaVersion: 'default-relevance-v1' };
        return Response.json(response);
    } });
    const trace = { mode: 'rerank', queries: [] };
    await rerankSearch(trace).call(client, 'collection', owner, scope, 'Where?', undefined, 'chat_test');
    assert.deepEqual(body, rerankInput(owner, scope, 'Where?', 'chat_test', 'rerank'));
    assert.equal(trace.queries[0].rerank.criteriaVersion, 'default-relevance-v1');
    assert.equal(trace.queries[0].scores[0].retrievalScore, 0.4);
    client.forget();
});

test('exact-match gain cannot pass when either arm omitted required evidence', () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ mode: i % 2 ? 'rerank' : 'vector', delivered: [true, true], queries: [{ rerank: { status: 'applied' } }] }));
    const pairs = Array.from({ length: 12 }, (_, i) => ({ gained: i === 0, lost: false }));
    assert(passesExactMatchGate(rows, pairs));
    for (const index of [0, 1]) {
        rows[index].delivered[1] = false; assert(!passesExactMatchGate(rows, pairs));
        rows[index].delivered = []; assert(!passesExactMatchGate(rows, pairs));
        rows[index].delivered = [true, true];
    }
    rows[1].queries[0].rerank.status = 'fallback'; assert(!passesExactMatchGate(rows, pairs));
    rows[1].queries[0].rerank.status = 'applied';
    pairs[1].lost = true; assert(!passesExactMatchGate(rows, pairs));
    pairs[1].lost = false; assert(!passesExactMatchGate(rows.slice(1), pairs));
});
