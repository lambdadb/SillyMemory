import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEmbedding, protocol } from '../scripts/direct-embedding-probe.mjs';
const response = () => ({ model: protocol.model, data: [{ index: 0, embedding: Array(1536).fill(0.01) }], usage: { prompt_tokens: 15, total_tokens: 15 } });
test('direct embedding diagnostic validates complete vectors but exports only counts and usage', () => {
    assert.deepEqual(inspectEmbedding(response()), { vectors: 1, dimensions: 1536, usage: { prompt_tokens: 15, total_tokens: 15 } });
    for (const mutate of [r => r.data.pop(), r => r.data[0].embedding.pop(), r => { r.data[0].embedding[0] = NaN; }, r => { r.data[0].index = 1; }, r => { r.model = 'other'; }, r => { r.usage.total_tokens = -1; }]) {
        const r = response(); mutate(r); assert.throws(() => inspectEmbedding(r));
    }
});
