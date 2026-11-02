import test from 'node:test';
import assert from 'node:assert/strict';
import { activationBinding, chatActivated } from '../src/activation.js';

const state = { endpoint: 'https://region.example.test', project: 'story', activationGeneration: 'a'.repeat(32) };
test('native ON alone cannot upload after lost browser state or an activation reset', () => {
    const chat = { sillymemoryEnabled: true };
    assert.equal(chatActivated(chat, state), false);
    chat.sillymemoryActivation = activationBinding(state);
    assert.equal(chatActivated(chat, state), true);
    assert.equal(chatActivated(chat, { ...state, activationGeneration: 'b'.repeat(32) }), false);
    assert.equal(chatActivated(chat, { ...state, activationGeneration: undefined }), false);
    assert.equal(chatActivated(chat, {}), false);
});
test('activation stays bound to the project and endpoint across inherited native metadata', () => {
    const inherited = structuredClone({ sillymemoryEnabled: true, sillymemoryActivation: activationBinding(state) });
    assert.equal(chatActivated(inherited, state), true);
    assert.equal(chatActivated(inherited, { ...state, endpoint: state.endpoint + '/' }), true);
    assert.equal(chatActivated(inherited, { ...state, project: 'other' }), false);
    assert.equal(chatActivated(inherited, { ...state, endpoint: 'https://other.example.test' }), false);
    inherited.sillymemoryEnabled = false;
    assert.equal(chatActivated(inherited, state), false);
});
