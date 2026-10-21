import test from 'node:test';
import assert from 'node:assert/strict';
import { LambdaClient } from '../src/client.js';
import { collectionResponse } from './helpers/lambdadb-responses.js';
import { memoryOperationBudget } from '../benchmark/shared/memory-budget.mjs';

test('Benchmark operation exhaustion preserves bounded owned deletion and absence verification', async () => {
    const state = { operations: 49 }, budget = memoryOperationBudget(state, 100), methods = [];
    await assert.rejects(budget.run(() => { budget.consume(); throw new Error('Must not reach work'); }), /bound exceeded/);
    assert.equal(state.operations, 49);
    const client = new LambdaClient({ endpoint: 'https://example.test', project: 'synthetic' }, 'synthetic-key', {
        fetcher: async (_url, options) => {
            budget.consume(); methods.push(options.method);
            if (methods.length === 1) return Response.json({ collection: collectionResponse({ tags: {
                application: 'sillymemory', owner: 'aa', chat: 'bb',
            } }) });
            return options.method === 'DELETE' ? Response.json({ message: 'Collection deletion requested' }) : new Response('{}', { status: 404 });
        },
    });
    try { await budget.run(() => client.deleteOwnedCollection('test', 'aa', 'bb'), true); }
    finally { client.forget(); }
    assert.deepEqual(methods, ['GET', 'DELETE', 'GET']);
    assert.equal(state.operations, 52);
    // Cleanup mode must not leak into subsequent ordinary work.
    await assert.rejects(budget.run(() => budget.consume()), /bound exceeded/);
    assert.equal(state.operations, 52);
    // The reserved allowance also has a hard total cap and no rejected increment.
    await budget.run(() => { for (let i = 0; i < 48; i++) budget.consume(); }, true);
    await assert.rejects(budget.run(() => budget.consume(), true), /bound exceeded/);
    assert.equal(state.operations, 100);
});
