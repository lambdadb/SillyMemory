import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareCase, sha256 } from '../benchmark/longmemeval/protocol.mjs';
import { attributeCase, coverageState, tally } from '../benchmark/longmemeval/attribute.mjs';

// Synthetic unit fixture, not an actual run: one long annotated message that splits
// into two chunks, one short annotated message, and an annotated recent message.
async function fixture() {
    const config = JSON.parse(await readFile(new URL('../benchmark/longmemeval/config.json', import.meta.url)));
    const sentence = 'The spare compass is in the cedar box on the top shelf of the hall closet. ';
    const row = { question_id: 'example', question_type: 'multi-session', question: 'Where is the compass?', answer: 'cedar box',
        question_date: '2023/01/03 (Tue) 10:00', haystack_dates: ['2023/01/02 (Mon) 10:00'], haystack_session_ids: ['session'],
        haystack_sessions: [[
            { role: 'user', content: sentence.repeat(16), has_answer: true }, { role: 'assistant', content: 'Noted.' },
            { role: 'user', content: 'The box is painted blue.', has_answer: true }, { role: 'assistant', content: 'Good to know.' },
            { role: 'user', content: 'Recent user one', has_answer: true }, { role: 'assistant', content: 'Recent assistant one' },
            { role: 'user', content: 'Recent user two' }, { role: 'assistant', content: 'Recent assistant two' },
        ]] };
    const prepared = await prepareCase(row, config);
    const record = (returnedIds, selectedIds) => ({ id: 'example', sourceSha256: sha256(JSON.stringify(prepared)),
        response: { docs: returnedIds.map(id => ({ doc: { id } })) }, packed: { selectedIds, memoryTokens: 100 } });
    return { row, prepared, record, score: { id: 'example', correct: false, probability: 0.1 } };
}

test('coverage state merges chunk spans against the indexed message extent', () => {
    const chunks = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 10, end: 25 }];
    assert.equal(coverageState(chunks, new Set()), 'missing');
    assert.equal(coverageState(chunks, new Set(['b'])), 'partial');
    assert.equal(coverageState(chunks, new Set(['a', 'b'])), 'complete');
    assert.equal(coverageState([], new Set(['a'])), 'missing');
});

test('attribution classifies annotated messages at the returned and prompt stages', async () => {
    const { row, prepared, record, score } = await fixture();
    assert.equal(prepared.boundary, 4);
    const byMessage = m => prepared.docs.filter(d => d.message === m).map(d => d.id);
    assert.equal(byMessage(0).length, 2); assert.equal(byMessage(2).length, 1);
    const all = [...byMessage(0), ...byMessage(2)];

    const complete = attributeCase({ row, prepared, record: record(all, all), score });
    assert.equal(complete.stage, 'delivered-complete');
    assert.deepEqual(complete.evidence.map(e => [e.message, e.returned, e.prompt]), [[0, 'complete', 'complete'], [2, 'complete', 'complete']]);
    assert.equal(complete.annotatedMessages, 2); assert.equal(complete.recentAnnotatedMessages, 1);
    assert.deepEqual(complete.evidence[0].chunks.map(c => c.rank), [1, 2]);

    const partial = attributeCase({ row, prepared, record: record(all, [byMessage(0)[0], ...byMessage(2)]), score });
    assert.equal(partial.stage, 'delivered-partial');
    assert.deepEqual(partial.evidence.map(e => e.prompt), ['partial', 'complete']);

    const budget = attributeCase({ row, prepared, record: record(all, byMessage(0)), score });
    assert.equal(budget.stage, 'budget-loss');
    assert.deepEqual(budget.evidence.map(e => [e.returned, e.prompt]), [['complete', 'complete'], ['complete', 'missing']]);

    const loss = attributeCase({ row, prepared, record: record(byMessage(0), byMessage(0)), score });
    assert.equal(loss.stage, 'retrieval-loss');
    assert.equal(loss.evidence[1].returned, 'missing');

    const unannotated = { ...row, haystack_sessions: [row.haystack_sessions[0].map(t => ({ role: t.role, content: t.content }))] };
    assert.equal(attributeCase({ row: unannotated, prepared, record: record(all, all), score }).stage, 'unannotated');
    const recentOnly = { ...row, haystack_sessions: [row.haystack_sessions[0].map((t, i) => ({ role: t.role, content: t.content, has_answer: i === 4 }))] };
    assert.equal(attributeCase({ row: recentOnly, prepared, record: record(all, all), score }).stage, 'recent-dialogue-only');

    assert.throws(() => attributeCase({ row, prepared, record: { ...record(all, all), sourceSha256: 'other' }, score }));

    const summary = tally([complete, partial, budget, loss, { ...complete, stage: 'unannotated', annotatedMessages: 0, evidence: [] }]);
    assert.deepEqual(summary.stages, { 'delivered-complete': 1, 'delivered-partial': 1, 'budget-loss': 1, 'retrieval-loss': 1, unannotated: 1 });
    assert.equal(summary.annotatedQuestions, 4); assert.equal(summary.zeroAnnotationQuestions, 1); assert.equal(summary.annotatedMessages, 8);
    assert.deepEqual(summary.returned, { complete: 7, partial: 0, missing: 1 });
    assert.deepEqual(summary.prompt, { complete: 5, partial: 1, missing: 2 });
    assert.deepEqual(summary.allAnnotatedMessagesCompleteQuestions, { returned: 3, prompt: 1 });
});
