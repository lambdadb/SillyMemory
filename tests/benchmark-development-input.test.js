import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptLongMemEval, sha } from '../scripts/benchmark-audit.mjs';
import { prepareDevelopmentCase, literalBenchmarkText } from '../scripts/benchmark-development-input.mjs';
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
