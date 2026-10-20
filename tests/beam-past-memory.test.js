import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LambdaClient } from '../src/client.js';
import { collectionResponse } from './helpers/lambdadb-responses.js';
import { memoryOperationBudget, cohortSettings, sourceDocuments, recallQuery, packContext, serializeContext, evidenceTokens, successfulQueryReceipts, receiptBody, publishRepackedRecall, verifyRepackedRecall } from '../scripts/beam-past-memory.mjs';

const conversation = { id: 'synthetic', userIdentity: 'synthetic-user', userTraits: {}, messages: [{
    sourceId: 'source-1', ordinal: 0, content: 'The older account limit is 15.',
    author: { role: 'user', name: 'User' }, timestamp: '2024-01-01T12:00:00.000001Z',
    timeMicros: 1704110400000001, turnId: 'original-1',
}, {
    sourceId: 'source-2', ordinal: 1, content: 'The updated account limit is 30.',
    author: { role: 'user', name: 'User' }, timestamp: '2024-01-01T12:00:00.000002Z',
    timeMicros: 1704110400000002, turnId: 'original-2',
}] };

test('BEAM repack failure leaves original evidence intact and can retry before atomic publication', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'sillymemory-repack-'));
    try {
        await writeFile(path.join(parent, 'raw-receipt.json'), 'original receipt');
        await assert.rejects(publishRepackedRecall(parent, async staging => {
            await writeFile(path.join(staging, 'recall-1.json'), 'derived first conversation');
            assert(!(await readdir(parent)).includes('recall'));
            throw new Error('Later conversation source mismatch');
        }), /Later conversation source mismatch/);
        assert.deepEqual(await readdir(parent), ['raw-receipt.json']);
        assert.equal(await readFile(path.join(parent, 'raw-receipt.json'), 'utf8'), 'original receipt');
        await publishRepackedRecall(parent, async staging => {
            await writeFile(path.join(staging, 'recall-1.json'), 'complete data');
            await writeFile(path.join(staging, 'lock.json'), 'complete lock');
            assert(!(await readdir(parent)).includes('recall'));
        });
        assert.equal(await readFile(path.join(parent, 'recall/recall-1.json'), 'utf8'), 'complete data');
        assert.equal(await readFile(path.join(parent, 'recall/lock.json'), 'utf8'), 'complete lock');
        await assert.rejects(publishRepackedRecall(parent, () => assert.fail('Must not rebuild published evidence')), /already exists/);
        assert.deepEqual((await readdir(parent)).sort(), ['raw-receipt.json', 'recall']);
    } finally {
        await rm(parent, { recursive: true, force: true });
    }
});

test('BEAM recall verification rejects coordinated file and digest edits against reconstructed source', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sillymemory-recall-check-'));
    try {
        const bytes = '{"content":"The limit is 15."}', name = 'recall-1.json';
        const records = [{ name, bytes }], provenance = { inputSha256: 'input', packingSourceSha256: 'producer' };
        const digest = text => createHash('sha256').update(text).digest('hex');
        const lock = { ...provenance, files: { 'recall/recall-1.json': digest(bytes) } };
        await writeFile(path.join(directory, name), bytes);
        await writeFile(path.join(directory, 'lock.json'), JSON.stringify(lock));
        await verifyRepackedRecall(directory, records, provenance);
        const changed = '{"content":"The limit is 999."}';
        await writeFile(path.join(directory, name), changed);
        lock.files['recall/recall-1.json'] = digest(changed);
        await writeFile(path.join(directory, 'lock.json'), JSON.stringify(lock));
        await assert.rejects(verifyRepackedRecall(directory, records, provenance), /differs from saved query receipts/);
        assert.equal(await readFile(path.join(directory, name), 'utf8'), changed);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('BEAM repacking selects successful attempts without counting retries as questions', () => {
    const receipt = (collection, status, question) => ({ status, request: {
        pathname: `/projects/project/collections/${collection}/query`, body: { question },
    } });
    const failed = receipt('owned', 429, 'first'), first = receipt('owned', 200, 'first');
    const secondFailed = receipt('owned', 503, 'second'), second = receipt('owned', 200, 'second');
    const other = receipt('other', 200, 'first');
    const all = [failed, first, other, secondFailed, second];
    assert.deepEqual(successfulQueryReceipts(all, 'owned'), [first, second]);
    assert.equal(all.length, 5); // Failed attempts remain in the original ledger.
});

test('BEAM receipt logging preserves non-JSON HTTP errors and the original response body', async () => {
    const busy = new Response('<html>busy</html>', { status: 503 });
    assert.deepEqual(await receiptBody(busy), { nonJsonResponse: true });
    assert.equal(busy.status, 503);
    assert.equal(await busy.text(), '<html>busy</html>');
    const success = Response.json({ docs: [] });
    assert.deepEqual(await receiptBody(success), { docs: [] });
    assert.deepEqual(await success.json(), { docs: [] });
});

test('BEAM recall applies the exact microsecond cutoff to both components', () => {
    const { query, options } = recallQuery('aa', 'bb', 'account limit', 1704110400000001);
    const vectorFilter = query.bayesian[0].knn.filter.queryString.query;
    const textFilter = query.bayesian[1].bool[0].queryString.query;
    assert.equal(vectorFilter, 'owner:aa AND scope:bb AND beamTimeMicros:[0 TO 1704110400000001]');
    assert.equal(textFilter, vectorFilter);
    assert.equal(options.size, 100);
    assert.equal(options.rerank.candidateSize, 200);
    assert.throws(() => recallQuery('aa', 'bb', 'q', Number.MAX_SAFE_INTEGER + 1));
});

test('BEAM context rejects future, altered, and cross-conversation sources', () => {
    const docs = sourceDocuments(conversation, 'aa', 'bb');
    const pack = hits => packContext(hits, docs, '2024-01-01T12:00:00.000001Z', 1704110400000001, text => text.length);
    assert.throws(() => pack([docs[1]]), /Future source/);
    assert.throws(() => pack([{ ...docs[0], text: 'The limit is 100.' }]), /source mismatch/);
    assert.throws(() => pack([{ ...docs[0], scope: 'cc' }]), /source mismatch/);
    const result = pack([docs[0], docs[0]]);
    assert.equal(result.context.results.length, 1);
    assert.equal(result.context.results[0].content, conversation.messages[0].content);
    assert.match(result.context.results[0].timeMeaning, /not a message send time/);
});

test('BEAM evidence accounting includes excerpts and excludes response metadata', () => {
    assert.equal(evidenceTokens([{ content: 'abc', sources: [{ excerpts: ['def', 'ghi'] }] }, { content: 'x' }]), 4);
    assert.equal(evidenceTokens([{ content: '😀😀😀😀', metadata: 'not evidence' }]), 1);
});

test('BEAM packs complete ranked sources within the matched evidence budget', () => {
    const input = structuredClone(conversation);
    input.messages = Array.from({ length: 50 }, (_, ordinal) => ({ ...input.messages[0],
        ordinal, sourceId: `s-${ordinal}`, turnId: `t-${ordinal}`, content: 'x'.repeat(700) }));
    const docs = sourceDocuments(input, 'aa', 'bb');
    const count = text => text.length;
    const result = packContext(docs, docs, '2024-01-01T12:00:00.000002Z', 1704110400000002, count);
    assert.deepEqual(result.selectedIds, docs.slice(0, 45).map(doc => doc.id));
    assert.equal(result.tokens, 7875);
    assert.equal(result.context.usedEvidenceTokens, 7875);
    assert.equal(result.serializedTokens, count(serializeContext(result.context)));
    assert(result.serializedTokens > 8000);
});

test('BEAM includes the same supplied profile without inventing a dated turn', () => {
    const input = { ...conversation, userTraits: { profile: 'Name: Synthetic' } };
    const docs = sourceDocuments(input, 'aa', 'bb');
    const profile = docs.find(doc => doc.sourceKind === 'profile');
    assert.equal(profile.beamTimeMicros, 0);
    assert.equal(profile.batchDate, '');
    assert.equal(profile.sourceTurnId, '');
    assert.equal(profile.text, '{"profile":"Name: Synthetic"}');
    const malicious = structuredClone(conversation);
    malicious.messages[0].rubric = 'expected answer';
    assert.throws(() => sourceDocuments(malicious, 'aa', 'bb'));
});


test('BEAM length selection requires the complete unique frozen cohort before provider calls', () => {
    const input = { split: '1m', conversations: Array.from({ length: 35 }, (_, c) => ({
        id: String(c), questions: Array.from({ length: 20 }, (_, q) => ({ id: `${c}_${q}` })),
    })) };
    assert.deepEqual(cohortSettings(input), { conversations: 35, questions: 700, memoryOperations: 20000 });
    assert.throws(() => cohortSettings({ ...input, split: '100k' }));
    assert.throws(() => cohortSettings({ ...input, split: '10m' }));
    const duplicate = structuredClone(input);
    duplicate.conversations[34].questions[19].id = '0_0';
    assert.throws(() => cohortSettings(duplicate));
    const smaller = { conversations: input.conversations.slice(0, 20) };
    assert.deepEqual(cohortSettings(smaller), { conversations: 20, questions: 400, memoryOperations: 10000 });
});


test('BEAM operation exhaustion preserves bounded owned deletion and absence verification', async () => {
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
