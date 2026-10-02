import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridQuery } from '../scripts/hybrid-query.mjs';
import { hybridCases, gradeHybrid } from '../scripts/hybrid-eval.mjs';
import { LambdaClient, scopeFilter } from '../src/client.js';
const owner = 'a'.repeat(32), scope = 'b'.repeat(64);
test('hybrid keeps identical scope filters, managed text, result bound and cancellation', async () => {
    const controller = new AbortController(), text = 'Where is QX-741?'; let body, signal;
    const client = new LambdaClient({ endpoint: 'https://region.example.test', project: 'synthetic' }, 'synthetic', { fetcher: async (_, init) => {
        body = JSON.parse(init.body); signal = init.signal; return Response.json({ docs: [] });
    } });
    await client.query('test', hybridQuery(owner, scope, text), { signal: controller.signal });
    const [vector, lexical] = body.query.rrf;
    assert.deepEqual(vector.knn, { field: 'embedding', queryText: text, k: 30, filter: scopeFilter(owner, scope) });
    assert.deepEqual(lexical.bool[0], { ...scopeFilter(owner, scope), occur: 'filter' });
    assert.equal(lexical.bool[1].occur, 'must'); assert.equal(lexical.bool[1].queryString.defaultField, 'text');
    assert.equal(body.size, 30); assert.equal(body.consistentRead, true); assert.equal(body.includeVectors, false);
    assert.deepEqual(body.ref, { kind: 'branch', name: 'main' }); controller.abort(); assert(signal.aborted);
});
test('user syntax becomes quoted literal tokens with a bounded clause count', () => {
    const text = 'alpha OR owner:* scope:* (NOT beacon) +"x" /a.*/ [0 TO 9] \\ foo^20 fn:ordered(a b)';
    const q = hybridQuery(owner, scope, text).rrf[1].bool[1].queryString.query;
    assert.equal(q, '"alpha" OR "OR" OR "owner" OR "scope" OR "NOT" OR "beacon" OR "x" OR "a" OR "0" OR "TO" OR "9" OR "foo" OR "20" OR "fn" OR "ordered" OR "b"');
    assert.equal(hybridQuery(owner, scope, '???').knn.queryText, '???');
    assert.equal(hybridQuery(owner, scope, Array.from({length:300},(_,i)=>`term${i}`).join(' ')).rrf[1].bool[1].queryString.query.split(' OR ').length, 128);
    assert.throws(() => hybridQuery('owner:*', scope, text), /identity/);
});
test('frozen comparison has paired answer-bearing old source and neutral recent turns', () => {
    assert.equal(hybridCases.length, 8);
    for (const item of hybridCases) {
        assert.equal(item.source.length, 44); assert(item.source[24].mes.includes(item.fact));
        assert(item.source.slice(-4).every(m => !m.mes.includes(item.fact) && !m.mes.includes(item.answer)));
        assert(gradeHybrid(`"${item.answer}."`, item.answer)); assert(!gradeHybrid(`Maybe ${item.answer}`, item.answer));
    }
});
