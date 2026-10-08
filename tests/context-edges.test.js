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
        if (item.kind === 'first-user') {
            assert(messages.slice(0, -1).every(m => !m.user));
            assert(queries[0].includes(messages.at(-2).text));
        } else {
            assert(messages.slice(0, -1).some(m => m.user));

        }
        if (item.kind === 'explicit-switch') {
            assert(queries[0].includes(item.language === 'en' ? 'green cloth banner' : '자주색 천 현수막'));
            assert(queries[0].includes(item.language === 'en' ? 'canal map' : '노선도'));
        }
    }
});
