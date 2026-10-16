import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptLongMemEval, sha } from '../scripts/benchmark-audit.mjs';
import { prepareDevelopmentCase, literalBenchmarkText, withBenchmarkSessionTimes } from '../scripts/benchmark-development-input.mjs';
test('uniform adaptation changes only macro spellings and preserves original provenance', () => {
    const row = { question_id: 'x', question: 'Who?', question_date: '2023/01/02 (Mon) 12:00', haystack_dates: ['2023/01/01 (Sun) 12:00'], haystack_session_ids: ['hidden'],
        answer: 'SECRET', haystack_sessions: [[{ role: 'user', content: '<User> {{char}} {"json": 1}', has_answer: true }]] };
    const sample = { id: 'x', split: 'development', inputSha256: sha(JSON.stringify(adaptLongMemEval(row))) };
    const actual = prepareDevelopmentCase(row, sample);
    assert(actual.chat[0].mes.endsWith('＜User＞ ｛｛char｝｝ {"json": 1}'));
    assert.equal(actual.originalInputSha256, sample.inputSha256); assert.notEqual(actual.inputSha256, sample.inputSha256);
    assert.deepEqual(actual.literalizedMessages, [0]); assert(!JSON.stringify(actual).includes('SECRET'));
    assert.deepEqual(prepareDevelopmentCase(row, { ...sample, originalInputSha256: sample.inputSha256, inputSha256: actual.inputSha256 }), actual);
    assert.equal(literalBenchmarkText('ordinary text'), 'ordinary text');
    assert.throws(() => prepareDevelopmentCase(row, { ...sample, split: 'evaluation' }), /held-out/);
});
test('questions follow the same literalization and incomplete macros fail closed', () => {
    const row = { question_id: 'q', question: 'What did <USER> tell {{char}}?', question_date: '2023/01/02 (Mon) 12:00', haystack_dates: ['2023/01/01 (Sun) 12:00'],
        haystack_session_ids: ['s'], haystack_sessions: [[{ role: 'user', content: 'literal history' }]] };
    const sample = () => ({ id: 'q', split: 'development', inputSha256: sha(JSON.stringify(adaptLongMemEval(row))) });
    assert(prepareDevelopmentCase(row, sample()).question.endsWith('What did ＜USER＞ tell ｛｛char｝｝?'));
    row.question = 'Unclosed {{char';
    assert.throws(() => prepareDevelopmentCase(row, sample()), /Unclosed macro/);
});

test('session clocks follow source message positions across chunks without changing text or inventing UTC', () => {
    const row = { haystack_dates: ['2023/03/18 (Sat) 14:30', '2023/03/19 (Sun) 09:00'],
        haystack_sessions: [[{ content: 'First.' }, { content: 'Today.' }], [{ content: 'Tomorrow.' }]] };
    const docs = [Object.freeze({ id: 'a', message: 1, text: 'To', start: 0, end: 2 }),
        Object.freeze({ id: 'b', message: 1, text: 'day.', start: 2, end: 6 }),
        Object.freeze({ id: 'c', message: 2, text: 'Tomorrow.', start: 0, end: 9 })];
    const actual = withBenchmarkSessionTimes(row, docs);
    assert.deepEqual(actual, [
        { ...docs[0], benchmarkSession: 1, benchmarkDate: '2023/03/18 (Sat) 14:30' },
        { ...docs[1], benchmarkSession: 1, benchmarkDate: '2023/03/18 (Sat) 14:30' },
        { ...docs[2], benchmarkSession: 2, benchmarkDate: '2023/03/19 (Sun) 09:00' },
    ]);
    assert.deepEqual(withBenchmarkSessionTimes(row, actual), actual);
    assert(docs.every(d => !('benchmarkDate' in d)));
    assert(actual.every(d => !('conversationTimestamp' in d) && !('timestampSource' in d)));
});

test('session-clock adaptation rejects missing, conflicting or native provenance', () => {
    const row = { haystack_dates: ['2023/03/18 (Sat) 14:30'], haystack_sessions: [[{}]] };
    for (const message of [-1, 1, 0.5, '0']) {
        assert.throws(() => withBenchmarkSessionTimes(row, [{ message }]), /Invalid source message position/);
    }
    for (const fields of [{ conversationTimestamp: '2023-03-18T14:30:00.000Z' }, { timestampSource: 'host_message' },
        { benchmarkSession: 2 }, { benchmarkDate: '2023/03/19 (Sun) 14:30' }]) {
        assert.throws(() => withBenchmarkSessionTimes(row, [{ message: 0, ...fields }]), /provenance/);
    }
    assert.throws(() => withBenchmarkSessionTimes({ ...row, haystack_dates: [] }, []), /count mismatch/);
    for (const date of [undefined, '', '2023-03-18T14:30:00Z', '{{date}}']) {
        assert.throws(() => withBenchmarkSessionTimes({ ...row, haystack_dates: [date] }, []), /session clock/);
    }
});
