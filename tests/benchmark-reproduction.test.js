import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { requestFor, judgeRequest, verdict } from '../benchmark/longmemeval/protocol.mjs';
import { recallQuery } from '../scripts/beam-past-memory.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture() {
    const row = { question_id: 'example', question: 'Where is the compass?', answer: 'cedar',
        question_date: '2023/01/03 (Tue) 10:00', haystack_dates: ['2023/01/02 (Mon) 10:00'],
        haystack_session_ids: ['session'], haystack_sessions: [[
            { role: 'user', content: '{map} 🧭 cedar' }, { role: 'assistant', content: 'Done.' },
        ]] };
    const config = { generator: { model: 'synthetic', max_completion_tokens: 10 },
        judge: { model: 'jev-1.13.0', threshold: 0.5 }, prompts: { system: 'Answer from history.',
            guidance: 'Use evidence.', date: 'Dates describe source sessions.',
            archivePrefix: '[Recalled conversation excerpts]\n', gap: '\n[Omitted original text between excerpts]\n' } };
    const expected = { model: 'synthetic', max_completion_tokens: 10, messages: [
        { role: 'system', content: 'Answer from history.' },
        { role: 'user', content: '[Recalled conversation excerpts]\n[Past conversation excerpt: user "User", message 1, passage 1, sent: 2023-01-02 10:00]\nDates describe source sessions.\n｛map｝ 🧭 cedar' },
        { role: 'assistant', content: 'Done.' },
        { role: 'user', content: '[Question date: 2023/01/03 (Tue) 10:00]\nWhere is the compass?' },
        { role: 'system', content: 'Use evidence.' },
    ] };
    const prefixLength = '[Session 1; date: 2023/01/02 (Mon) 10:00]\n'.length;
    const selection = { id: 'example', excerpts: [{ source: 0, citation: 'passage 1',
        ranges: [[prefixLength, prefixLength + 14]], dateGuidance: true }], recent: [1], requestSha256: sha(JSON.stringify(expected)) };
    return { row, config, selection, expected };
}

test('frozen source spans reconstruct literal UTF-16 text and preserve message roles', () => {
    const { row, config, selection, expected } = fixture();
    assert.deepEqual(requestFor(row, selection, config), expected);
    row.answer = 'A reference only for the judge';
    assert.deepEqual(requestFor(row, selection, config), expected);
});

test('changed source or invalid source coordinates cannot produce a frozen request', () => {
    const { row, config, selection } = fixture();
    selection.excerpts[0].ranges[0][1]++;
    assert.throws(() => requestFor(row, selection, config));
    selection.excerpts[0].ranges[0][1]--;
    row.haystack_sessions[0][0].content = '{map} 🧭 birch';
    assert.throws(() => requestFor(row, selection, config), /Request differs/);
});

test('judge retains the task reference field and validates Noul at the fixed threshold', () => {
    const { row, config } = fixture();
    assert.deepEqual(judgeRequest(row, 'cedar', { referenceField: 'Rubric', instructions: 'Use the rubric.' }, config), {
        model: 'jev-1.13.0', state: { Question: row.question, Rubric: 'cedar', 'Model Response': 'cedar' },
        questions: { correct: { type: 'noul', instructions: 'Use the rubric.' } },
    });
    const response = { model: 'jev-1.13.0', answers: { correct: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: 10 } };
    assert.equal(verdict(response, config).correct, true);
    response.answers.correct.noul = 0.499; assert.equal(verdict(response, config).correct, false);
    response.answers.correct.noul = NaN; assert.throws(() => verdict(response, config));
});

test('published LongMemEval selection and rules match the fixed profile hashes', async () => {
    const root = new URL('../benchmark/longmemeval/', import.meta.url);
    const config = JSON.parse(await readFile(new URL('config.json', root)));
    const selections = await readFile(new URL('selection.jsonl', root));
    assert.equal(sha(selections), config.selectionSha256);
    assert.equal(sha(await readFile(new URL('judge-rules.json', root))), config.rulesSha256);
    const rows = selections.toString().trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 500); assert.equal(new Set(rows.map(x => x.id)).size, 500);
    assert(rows.every(x => x.memoryTokens <= 4096 && /^[a-f0-9]{64}$/.test(x.requestSha256)));
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
