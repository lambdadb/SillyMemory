// Model-visible LongMemEval adaptation shared by the benchmark and summary arm.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const sha = value => createHash('sha256').update(value).digest('hex');
const text = value => { assert.equal(typeof value, 'string'); assert(value.trim()); return value; };
const sourceText = value => { assert.equal(typeof value, 'string'); return value; };
const role = value => { assert(['user', 'assistant'].includes(value), 'Unsupported speaker role'); return value; };
const dateKey = value => {
    text(value);
    const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2}) \([A-Za-z]+\) (\d{2}):(\d{2})$/);
    assert(match, 'Unrecognized dataset date');
    return match.slice(1).join(''); // Compare wall-clock order without inventing a timezone.
};

export function adaptLongMemEval(row) {
    const sessions = row.haystack_sessions;
    assert(Array.isArray(sessions) && sessions.length);
    assert.equal(sessions.length, row.haystack_dates.length);
    assert.equal(sessions.length, row.haystack_session_ids.length);
    const messages = sessions.flatMap((session, index) => {
        assert(Array.isArray(session) && session.length);
        dateKey(row.haystack_dates[index]);
        return session.map((turn, i) => ({ role: role(turn.role), content:
            (i === 0 ? `[Session ${index + 1}; date: ${row.haystack_dates[index]}]\n` : '') + sourceText(turn.content) }));
    });
    dateKey(row.question_date);
    // Whitelist model-visible fields: no answer, has_answer, evidence IDs or rubric.
    return { messages, question: `[Question date: ${row.question_date}]\n${text(row.question)}` };
}

export const literalBenchmarkText = text => text.replace(/\{\{([\s\S]*?)\}\}/g, (_, body) => `｛｛${body}｝｝`)
    .replace(/<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/gi, '＜$1＞');
