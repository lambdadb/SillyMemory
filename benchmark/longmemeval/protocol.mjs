import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { adaptLongMemEval } from '../../scripts/benchmark-audit.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export async function recordResponse(file, response, metadata, clean = text => text) {
    const saved = { ...metadata, status: response.status, rawResponse: await response.text() };
    async function persist() {
        await writeFile(file + '.tmp', clean(JSON.stringify(saved)));
        await rename(file + '.tmp', file);
    }
    await persist();
    assert.equal(response.status, 200, `Provider HTTP ${response.status}; receipt retained`);
    saved.response = JSON.parse(saved.rawResponse);
    await persist();
    return saved.response;
}
// Source coordinates are UTF-16 offsets after the benchmark's literal escaping.
export function literal(text) {
    return text.replaceAll('{', '｛').replaceAll('}', '｝')
        .replace(/<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/gi, '＜$1＞');
}
export function requestFor(row, selection, config) {
    assert.equal(row.question_id, selection.id);
    const source = adaptLongMemEval(row);
    const dates = row.haystack_sessions.flatMap((session, i) => session.map(() =>
        row.haystack_dates[i].replace(/^(\d{4})\/(\d{2})\/(\d{2}) \([A-Za-z]+\) /, '$1-$2-$3 ')));
    const excerpts = selection.excerpts.map(excerpt => {
        assert(Number.isInteger(excerpt.source) && excerpt.source >= 0 && excerpt.source < source.messages.length);
        const message = source.messages[excerpt.source], text = literal(message.content);
        const citation = excerpt.citation.startsWith('identical text at ') ? excerpt.citation
            : `message ${excerpt.source + 1}, ${excerpt.citation}`;
        const label = `[Past conversation excerpt: ${message.role} "${message.role === 'user' ? 'User' : 'Assistant'}", ${citation}, sent: ${dates[excerpt.source]}]`;
        const body = excerpt.ranges.map(([start, end]) => {
            assert(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= text.length);
            return text.slice(start, end);
        }).join(config.prompts.gap);
        return label + '\n' + (excerpt.dateGuidance ? config.prompts.date + '\n' : '') + body;
    }).join('\n');
    const recent = selection.recent.map(index => {
        assert(Number.isInteger(index) && index >= 0 && index < source.messages.length);
        return source.messages[index];
    });
    const body = { ...config.generator, messages: [
        { role: 'system', content: config.prompts.system },
        { role: 'user', content: config.prompts.archivePrefix + excerpts },
        ...recent, { role: 'user', content: source.question },
        { role: 'system', content: config.prompts.guidance },
    ] };
    assert.equal(sha256(JSON.stringify(body)), selection.requestSha256, `Request differs: ${selection.id}`);
    return body;
}
export function judgeRequest(row, response, rule, config) {
    assert(typeof response === 'string' && response.trim());
    return { model: config.judge.model,
        state: { Question: row.question, [rule.referenceField]: row.answer, 'Model Response': response },
        questions: { correct: { type: 'noul', instructions: rule.instructions } } };
}
export function verdict(result, config) {
    assert.equal(result?.model, config.judge.model);
    assert.deepEqual(Object.keys(result.answers || {}), ['correct']);
    const answer = result.answers.correct;
    assert.equal(answer.type, 'noul');
    assert(Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1);
    assert(Number.isSafeInteger(result.usage?.input_tokens) && result.usage.input_tokens >= 0);
    return { probability: answer.noul, correct: answer.noul >= config.judge.threshold };
}
