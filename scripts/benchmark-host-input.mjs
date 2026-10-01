import assert from 'node:assert/strict';
import { adaptLongMemEval, sha } from './benchmark-audit.mjs';

export function prepareHostCase(row, sample) {
    assert.equal(row.question_id, sample.id);
    assert.equal(sample.split, 'development', 'Host preflight cannot consume held-out questions');
    const input = adaptLongMemEval(row);
    assert.equal(sha(JSON.stringify(input)), sample.inputSha256);
    return { id: sample.id, inputSha256: sample.inputSha256, question: input.question,
        chat: input.messages.map(m => ({ mes: m.content, name: m.role === 'user' ? 'User' : 'Assistant',
            is_user: m.role === 'user', is_system: false, send_date: 0, extra: {} })) };
}

// Keep this projection independent of host-added metadata and saved summaries.
export const sourceView = chat => chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user }));

export function promptCoverage(chat, messages) {
    const content = m => typeof m.content === 'string' ? m.content : '';
    const nonempty = chat.map((m, index) => ({ ...m, index })).filter(m => m.mes.trim());
    const native = nonempty.filter(m => messages.some(p => p.role === (m.is_user ? 'user' : 'assistant') && content(p).includes(m.mes)));
    const any = nonempty.filter(m => messages.some(p => content(p).includes(m.mes)));
    const markers = chat.flatMap(m => m.mes.match(/\[Session \d+; date: [^\]]+\]/g) || []);
    return { sourceMessages: chat.length, nonemptyMessages: nonempty.length,
        exactTextMessages: any.length, exactNativeRoleMessages: native.length,
        nativeSourceIndexes: native.map(m => m.index),
        sourceDateMarkers: markers.length,
        deliveredDateMarkers: markers.filter(marker => messages.some(m => content(m).includes(marker))).length };
}
