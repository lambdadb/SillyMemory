import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceDocuments, recallQuery, packContext, serializeContext, evidenceTokens, successfulQueryReceipts, receiptBody } from '../scripts/beam-past-memory.mjs';

const conversation = { id: 'synthetic', userIdentity: 'synthetic-user', userTraits: {}, messages: [{
    sourceId: 'source-1', ordinal: 0, content: 'The older account limit is 15.',
    author: { role: 'user', name: 'User' }, timestamp: '2024-01-01T12:00:00.000001Z',
    timeMicros: 1704110400000001, turnId: 'original-1',
}, {
    sourceId: 'source-2', ordinal: 1, content: 'The updated account limit is 30.',
    author: { role: 'user', name: 'User' }, timestamp: '2024-01-01T12:00:00.000002Z',
    timeMicros: 1704110400000002, turnId: 'original-2',
}] };

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
