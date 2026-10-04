import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRescuePolicy, answerGate, gradeIdentifier, confirmationCases } from '../scripts/rerank-rescue.mjs';
import { rerankInput } from '../scripts/rerank-query.mjs';
const row = (id, mode, factSelected, status = 'applied') => ({ case: id, mode, factSelected, queries: [{ rerank: { status } }] });
test('rescue policy requires complete applied evidence and no baseline losses', () => {
    const rows = [row('miss', 'vector', false), row('control', 'vector', true), row('miss', 'rerank', true)];
    assert.equal(chooseRescuePolicy(rows, ['miss', 'control']), null);
    rows.push(row('control', 'rerank', false)); assert.equal(chooseRescuePolicy(rows, ['miss', 'control']), null);
    rows.at(-1).factSelected = true; assert.equal(chooseRescuePolicy(rows, ['miss', 'control']).mode, 'rerank');
    rows.at(-1).queries[0].rerank.status = 'fallback'; assert.equal(chooseRescuePolicy(rows, ['miss', 'control']), null);
    rows.push(row('miss', 'hybrid-rerank', true), row('control', 'hybrid-rerank', true));
    assert.equal(chooseRescuePolicy(rows, ['miss', 'control']).mode, 'hybrid-rerank');
    rows[3].queries[0].rerank.status = 'applied'; assert.equal(chooseRescuePolicy(rows, ['miss', 'control']).mode, 'rerank');
});
test('answer gate rejects incomplete pairs and a regression despite a gained answer', () => {
    const rows = [{ case: 'a', mode: 'vector', correct: false }, { case: 'a', mode: 'rerank', correct: true }, { case: 'b', mode: 'vector', correct: true }];
    assert.equal(answerGate(rows, ['a', 'b'], 'rerank'), false);
    rows.push({ case: 'b', mode: 'rerank', correct: false }); assert.equal(answerGate(rows, ['a', 'b'], 'rerank'), false);
    rows.at(-1).correct = true; assert.equal(answerGate(rows, ['a', 'b'], 'rerank'), true);
    assert(gradeIdentifier('It is ELM-907.', 'ELM-907'));
    assert(!gradeIdentifier('It is not ELM-907.', 'ELM-907'));
    assert(!gradeIdentifier('OAK-412 or ELM-907.', 'ELM-907'));
    assert(gradeIdentifier('UNKNOWN.', 'UNKNOWN')); assert(!gradeIdentifier('UNKNOWN, maybe ELM-907.', 'UNKNOWN'));
});
test('hybrid reranking preserves literal filtered retrieval and fixed candidate bounds', () => {
    const owner = 'a'.repeat(32), scope = 'b'.repeat(64), text = 'name OR owner:*';
    const plain = rerankInput(owner, scope, text, 'chat_test', 'hybrid');
    const { rerank, ...ranked } = rerankInput(owner, scope, text, 'chat_test', 'hybrid-rerank');
    assert.deepEqual(plain, ranked); assert.equal(rerank.candidateSize, 30); assert.equal(plain.size, 30);
    assert.equal(plain.query.rrf[0].knn.k, 30);
    assert.equal(plain.query.rrf[1].bool[0].queryString.query, `owner:${owner} AND scope:${scope}`);
    assert.equal(plain.query.rrf[1].bool[1].queryString.query, '"name" OR "OR" OR "owner"');
    assert.equal(confirmationCases.length, 6);
    for (const item of confirmationCases) {
        assert(item.source[24].mes.includes(item.fact)); assert(!item.source.slice(-4).some(m => m.mes.includes(item.answer)));
        assert(gradeIdentifier(item.answer, item.answer));
    }
});
