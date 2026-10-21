import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareCase, recallQuery as lmeQuery, returnedDocs, requestFor } from '../benchmark/longmemeval/protocol.mjs';
import { retrieveCase, verifyRecall, memoryPhase } from '../benchmark/longmemeval/storage.mjs';
import { recallQuery } from '../scripts/beam-past-memory.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture() {
    const config = JSON.parse(await readFile(new URL('../benchmark/longmemeval/config.json', import.meta.url)));
    const row = { question_id: 'example', question_type: 'single-session-user', question: 'Where is the compass?', answer: 'cedar',
        question_date: '2023/01/03 (Tue) 10:00', haystack_dates: ['2023/01/02 (Mon) 10:00'], haystack_session_ids: ['session'],
        haystack_sessions: [[
            { role: 'user', content: '{{map}} 🧭 cedar', has_answer: true }, { role: 'assistant', content: 'Done.' },
            { role: 'user', content: 'Recent user one' }, { role: 'assistant', content: 'Recent assistant one' },
            { role: 'user', content: 'Recent user two' }, { role: 'assistant', content: 'Recent assistant two' },
        ]] };
    const prepared = await prepareCase(row, config);
    const response = { isDocsInline: true, docs: prepared.docs.map(doc => ({ doc, score: 1, retrievalScore: 1 })),
        rerank: { provider: 'typesafe', model: 'jev-1.13.0', status: 'applied', candidateCount: 2, scoredCount: 2 } };
    return { row, config, prepared, response };
}

test('preparation indexes older source text and excludes references, annotations and recent dialogue', async () => {
    const { row, config, prepared } = await fixture();
    assert.equal(prepared.boundary, 2);
    assert.deepEqual(prepared.docs.map(d => [d.message, d.role, d.text]), [
        [0, 'user', '[Session 1; date: 2023/01/02 (Mon) 10:00]\n｛｛map｝｝ 🧭 cedar'], [1, 'assistant', 'Done.'],
    ]);
    assert.deepEqual(prepared.recent.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
    assert(prepared.docs.every(d => d.conversationTimestamp === undefined && d.benchmarkDate === '2023/01/02 (Mon) 10:00'));
    row.answer = 'A reference only for the judge'; row.haystack_sessions[0][0].has_answer = false;
    assert.deepEqual(await prepareCase(row, config), prepared);
    const query = lmeQuery(prepared, config);
    assert.equal(query.query.bayesian[0].knn.queryText, 'User: [Question date: 2023/01/03 (Tue) 10:00]\nWhere is the compass?');
    assert.equal(query.query.bayesian[0].knn.k, 200);
    assert.deepEqual(query.rerank.fields, ['text']); assert.equal(query.rerank.candidateSize, 200); assert.equal(query.size, 50);
});

test('ranked source packing preserves literal text, dates, roles and recent dialogue', async () => {
    const { config, prepared, response } = await fixture();
    const result = requestFor(prepared, returnedDocs(response, prepared, config), config, t => t.length);
    assert.deepEqual(result.body.messages, [
        { role: 'system', content: config.prompts.system },
        { role: 'user', content: '[Recalled conversation excerpts]\n[Past conversation excerpt: user "User", message 1, passage 1, sent: 2023-01-02 10:00]\n' + config.prompts.date + '\n[Session 1; date: 2023/01/02 (Mon) 10:00]\n｛｛map｝｝ 🧭 cedar\n[Past conversation excerpt: assistant "Assistant", message 2, passage 1, sent: 2023-01-02 10:00]\nDone.' },
        ...prepared.recent, { role: 'user', content: '[Question date: 2023/01/03 (Tue) 10:00]\nWhere is the compass?' },
        { role: 'system', content: config.prompts.guidance },
    ]);
    assert.equal(result.requestSha256, sha(JSON.stringify(result.body)));
    const bounded = requestFor(prepared, prepared.docs, config, t => t.includes('cedar') ? 5000 : t.length);
    assert.deepEqual(bounded.selectedIds, [prepared.docs[1].id]);
});

test('recall verification rejects altered source, query, packing and partial reranking', async () => {
    const { config, prepared, response } = await fixture();
    const count = t => t.length, record = { id: prepared.id, binding: 'lock', sourceSha256: sha(JSON.stringify(prepared)),
        query: lmeQuery(prepared, config), response, packed: requestFor(prepared, prepared.docs, config, count) };
    assert.deepEqual(verifyRecall(record, prepared, config, count, 'lock'), record.packed.body);
    for (const mutate of [
        r => { r.response.docs[0].doc.text = 'forged'; },
        r => { r.query.rerank.candidateSize = 100; },
        r => { r.packed.selectedIds.reverse(); },
        r => { r.response.rerank.scoredCount = 1; },
    ]) {
        const altered = structuredClone(record); mutate(altered);
        assert.throws(() => verifyRecall(altered, prepared, config, count, 'lock'));
    }
});

test('storage readback must succeed before retrieval', async () => {
    const { config, prepared, response } = await fixture(), calls = [];
    const client = { assertOwned: async () => { calls.push('ownership'); }, upsert: async () => { calls.push('upsert'); },
        fetchDocs: async () => { calls.push('fetch'); return prepared.docs; }, call: async () => { calls.push('query'); return response; } };
    await retrieveCase(client, 'test', prepared, config);
    assert.deepEqual(calls, ['ownership', 'upsert', 'fetch', 'query']);
    calls.length = 0; client.fetchDocs = async () => [{ ...prepared.docs[0], text: 'corrupt' }, prepared.docs[1]];
    await assert.rejects(retrieveCase(client, 'test', prepared, config));
    assert(!calls.includes('query'));
});

test('cleanup recovers an interrupted collection and rejects a different owner before HTTP', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'benchmark-cleanup-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'memory'));
    const { config } = await fixture(), owner = 'a'.repeat(64), binding = 'run-lock';
    const env = { LAMBDADB_BASE_URL: 'https://example.test', LAMBDADB_PROJECT_NAME: 'test-project', LAMBDADB_PROJECT_API_KEY: 'synthetic-key' };
    const state = { binding, connection: sha(JSON.stringify([env.LAMBDADB_BASE_URL, env.LAMBDADB_PROJECT_NAME])),
        status: 'blocked', operations: 0, completed: [], owned: [{ id: 'example', owner,
            collection: 'smlme_' + 'b'.repeat(24), scope: 'c'.repeat(64), deleted: false }] };
    const file = path.join(root, 'memory/state.json');
    await writeFile(file, JSON.stringify(state));
    const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    t.after(() => Object.defineProperty(globalThis, 'fetch', originalFetch));
    const transport = t.mock.fn(async (_url, options) => {
        assert.equal(options.method, 'GET'); return new Response('', { status: 404 });
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: transport });
    const args = { phase: 'cleanup', root, lock: { owner }, binding, config, env };
    await memoryPhase(args);
    const saved = JSON.parse(await readFile(file));
    assert.equal(saved.status, 'cleaned'); assert.equal(saved.owned[0].absent404, true);
    assert.equal(transport.mock.callCount(), 1);
    state.owned[0].owner = 'd'.repeat(64);
    await writeFile(file, JSON.stringify(state));
    await assert.rejects(memoryPhase(args));
    assert.equal(transport.mock.callCount(), 1);
});

test('BEAM profile reflects the actual bounded retrieval request', async () => {
    const config = JSON.parse(await readFile(new URL('../benchmark/beam/config.json', import.meta.url)));
    const { query, options } = recallQuery('a'.repeat(64), 'b'.repeat(64), 'question', 1);
    assert.equal(query.bayesian[0].knn.k, config.memory.k);
    assert.equal(options.size, config.memory.finalSize);
    assert.equal(options.rerank.candidateSize, config.memory.candidateSize);
    assert.equal(options.rerank.model, config.memory.reranker);
    assert.deepEqual(options.rerank.fields, config.memory.rerankFields);
});
