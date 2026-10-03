// Test-only assertions for a complete-source actor diagnostic. No model calls.
import assert from 'node:assert/strict';

export function actorPromptEvidence(item, mode, messages) {
    assert(['off', 'on'].includes(mode), 'Unknown actor diagnostic mode');
    const content = m => typeof m.content === 'string' ? m.content : '';
    const identity = "Write SillyMemory E2E Mira's next reply in a fictional chat between SillyMemory E2E Mira and User.";
    assert(messages.some(m => m.role === 'system' && content(m) === identity), 'Actor diagnostic reply identity changed');
    const sources = item.input.source;
    assert(sources.every(m => m.name === (m.is_user ? 'User' : 'SillyMemory E2E Mira')), 'Source and host participant names differ');
    const sourceMessagesPresent = sources.filter(source => messages.some(m => content(m).includes(source.mes))).length;
    if (mode === 'off') assert.equal(sourceMessagesPresent, sources.length, 'Actor baseline lost source history');
    const requiredRoles = item.rubric.requiredEvidence.map(ref => {
        const expectedRole = sources[ref.message].is_user ? 'user' : 'assistant';
        const actualRoles = messages.filter(m => content(m).includes(ref.quote)).map(m => m.role);
        assert.deepEqual(actualRoles, [expectedRole], 'Actor source missing, duplicated or in the wrong API role');
        return { message: ref.message, expectedRole, actualRoles };
    });
    assert(requiredRoles.length > 0, 'Actor diagnostic needs a required source');
    return { replyIdentity: identity, sourceMessagesPresent, requiredRoles };
}
