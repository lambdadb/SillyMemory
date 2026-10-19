// Literalize host macro spellings uniformly across all comparison arms. Keep the
// released input hash as provenance and hash the actual model-visible adaptation.
import assert from 'node:assert/strict';
import { adaptLongMemEval, sha } from './benchmark-audit.mjs';
import { prepareHostCase } from './benchmark-host-input.mjs';
export const literalBenchmarkText = text => text.replace(/\{\{([\s\S]*?)\}\}/g, (_, body) => `｛｛${body}｝｝`)
    .replace(/<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/gi, '＜$1＞');
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
