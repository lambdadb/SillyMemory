// Literalize host macro spellings uniformly across all comparison arms. Keep the
// released input hash as provenance and hash the actual model-visible adaptation.
import assert from 'node:assert/strict';
import { adaptLongMemEval, sha } from './benchmark-audit.mjs';
import { prepareHostCase } from './benchmark-host-input.mjs';
export const literalBenchmarkText = text => text.replace(/\{\{([\s\S]*?)\}\}/g, (_, body) => `｛｛${body}｝｝`)
    .replace(/<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/gi, '＜$1＞');

// Explicit benchmark adaptation, not a native message timestamp or an event date.
// Keep the raw clock and session identity on every chunk, outside embedding text.
// Callers must bind documents to the same frozen source transcript beforehand.
export function withBenchmarkSessionTimes(row, docs) {
    assert(Array.isArray(row.haystack_sessions) && Array.isArray(row.haystack_dates));
    assert.equal(row.haystack_sessions.length, row.haystack_dates.length, 'Session/date count mismatch');
    const times = row.haystack_sessions.flatMap((session, index) => {
        assert(Array.isArray(session), 'Invalid source session');
        const date = row.haystack_dates[index];
        assert(typeof date === 'string' && /^\d{4}\/\d{2}\/\d{2} \([A-Za-z]{3}\) \d{2}:\d{2}$/.test(date), 'Missing or unsupported session clock');
        return session.map(() => ({ benchmarkSession: index + 1, benchmarkDate: date }));
    });
    return docs.map(doc => {
        assert(Number.isSafeInteger(doc.message) && doc.message >= 0 && doc.message < times.length, 'Invalid source message position');
        assert(doc.conversationTimestamp === undefined && doc.timestampSource === undefined, 'Do not replace native time provenance');
        const time = times[doc.message];
        assert((doc.benchmarkSession === undefined || doc.benchmarkSession === time.benchmarkSession)
            && (doc.benchmarkDate === undefined || doc.benchmarkDate === time.benchmarkDate), 'Conflicting session provenance');
        return { ...doc, ...time };
    });
}

export function prepareDevelopmentCase(row, sample) {
    const original = { ...sample, inputSha256: sample.originalInputSha256 || sample.inputSha256 };
    const prepared = prepareHostCase(row, original), input = adaptLongMemEval(row), changed = [];
    input.messages.forEach((m, index) => { const value = literalBenchmarkText(m.content); if (value !== m.content) changed.push(index); m.content = value; });
    input.question = literalBenchmarkText(input.question);
    assert(![...input.messages.map(m => m.content), input.question].some(content => /\{\{|<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/i.test(content)), 'Unclosed macro needs explicit handling');
    const inputSha256 = sha(JSON.stringify(input));
    if (sample.originalInputSha256) assert.equal(inputSha256, sample.inputSha256, 'Adapted input changed');
    return { ...prepared, question: input.question, originalInputSha256: original.inputSha256, inputSha256,
        literalizedMessages: changed, chat: prepared.chat.map((m, i) => ({ ...m, mes: input.messages[i].content })) };
}
