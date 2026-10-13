import test from 'node:test';
import assert from 'node:assert/strict';
import { contextEdgeCases } from '../scripts/context-edges.mjs';
import { documents, retrievalQueries } from '../src/memory.js';

test('assistant-topic boundary fixtures keep targets old and distinguish a first user from a topic switch', async () => {
    const cases = contextEdgeCases();
    assert.equal(cases.length, 6);
    assert.equal(new Set(cases.map(c => c.id)).size, 6);
    for (const item of cases) {
        const { docs } = await documents(item.snapshot, 'boundary-test-owner', { recent: 12, budget: 400, chunkChars: 800 });
        assert(docs.some(d => d.message === item.target.message && d.text === item.target.text));
        const messages = item.snapshot.messages, queries = retrievalQueries(item.snapshot);
        assert(messages.at(-1).user);
        assert.equal(queries.length, 1);
        assert(queries[0].endsWith(messages.at(-1).text));
        assert.equal(queries[0], `Assistant: ${messages.at(-2).text.trim()}\n\nUser: ${messages.at(-1).text.trim()}`);
    }
});
