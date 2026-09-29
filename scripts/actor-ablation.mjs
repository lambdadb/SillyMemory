// Test-only prompt intervention; never changes persisted chats or retrieval policy.
import assert from 'node:assert/strict';
import { memoryMessages } from '../src/memory.js';
import { actorPromptEvidence } from './actor-perspective.mjs';

export const ABLATION_MODES = ['full-raw', 'full-labelled', 'sparse-raw', 'sparse-labelled'];
export function ablationSchedule(cases, repetitions) {
    return Array.from({ length: repetitions }, (_, r) => cases.flatMap((item, i) =>
        ABLATION_MODES.map((_, j) => {
            const mode = ABLATION_MODES[(i + r + j) % 4];
            return { id: `${item.id}/r${r + 1}/${mode}`, case: item.id, repetition: r + 1, mode };
        }))).flat();
}

export function ablationHistory(item, fixture, mode) {
    assert(ABLATION_MODES.includes(mode), 'Unknown ablation mode');
    const { source, question } = item.input;
    const selection = fixture.ablation.selections[item.id];
    assert(selection?.passages.length, 'Missing frozen selection');
    const cutoff = source.length + 1 - fixture.settings.recent;
    const indices = selection.passages.map(p => p.message);
    assert.equal(new Set(indices).size, indices.length, 'This protocol requires one complete chunk per selected message');
    for (const p of selection.passages) {
        assert(Number.isInteger(p.message) && p.message >= 0 && p.message < cutoff, 'Frozen selection must be old history');
        assert.equal(p.chunk, 0); assert.equal(p.text, source[p.message].mes, 'Frozen passage must equal complete source');
        assert.equal(p.role, source[p.message].is_user ? 'user' : 'assistant');
        assert.equal(p.speaker, source[p.message].name);
    }
    assert(item.rubric.requiredEvidence.every(ref => indices.includes(ref.message)), 'Frozen selection lacks required evidence');
    const labels = new Map(memoryMessages(selection.passages).map(m => [m.index, m.mes]));
    const kept = source.flatMap((m, index) => mode.startsWith('full') || index >= cutoff || labels.has(index)
        ? [{ ...structuredClone(m), mes: mode.endsWith('labelled') && labels.has(index) ? labels.get(index) : m.mes }] : []);
    return [...kept, { mes: question, name: 'User', is_user: true, is_system: false, extra: {} }];
}

export function ablationPromptEvidence(item, fixture, mode, messages) {
    const actor = actorPromptEvidence(item, mode.startsWith('full') ? 'off' : 'on', messages);
    const expected = ablationHistory(item, fixture, mode).map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes }));
    const actual = messages.filter(m => ['user', 'assistant'].includes(m.role)).map(({ role, content }) => ({ role, content }));
    assert.deepEqual(actual, expected, 'Ablation source set, roles, order or labels changed');
    assert.deepEqual(messages.filter(m => m.role === 'system').map(m => m.content), [actor.replyIdentity, fixture.generation.instruction, '[Start a new Chat]'], 'Ablation system prompt changed');
    return { ...actor, condition: mode, conversationMessages: actual.length, labelledMessages: actual.filter(m => m.content.startsWith('[Past conversation excerpt:')).length };
}
