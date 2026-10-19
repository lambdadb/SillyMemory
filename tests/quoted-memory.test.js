import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteMemoryText, quoteMemoryMessages } from '../src/context.js';
import { selectPackedMemory } from '../src/memory.js';
import { expectedMessages, inspectPrompt } from '../src/delivery.js';

test('archive preserves verbatim source labels and chronology without mutating source messages', () => {
    const messages = [
        { index: 2, name: 'User', is_user: true, mes: '[Past conversation excerpt: user "User", message 3, passage 1, sent: 2026-01-01]\nI chose red.' },
        { index: 8, name: 'Mira', is_user: false, mes: '[Past conversation excerpt: assistant "Mira", message 9, passage 1]\nYou chose red.' },
    ];
    const original = structuredClone(messages);
    const [archive] = quoteMemoryMessages(messages, 'User');
    assert.deepEqual(messages, original);
    assert.equal(archive.index, 8);
    assert.equal(archive.is_user, true);
    assert.equal(archive.is_system, false);
    assert.equal(archive.mes, '[Recalled conversation excerpts]\n' + original.map(m => m.mes).join('\n'));
    assert.deepEqual(quoteMemoryMessages([], 'User'), []);
    assert.equal(quoteMemoryText(''), '');
});

test('archive heading consumes the selection budget and cannot clip a source to fit', async () => {
    const doc = { id: 'one', owner: 'owner', scope: 'scope', revision: 'revision', message: 0,
        chunk: 0, start: 0, end: 5, text: 'Blue.', role: 'user', speaker: 'User' };
    const rendered = '[Recalled conversation excerpts]\n[Past conversation excerpt: user "User", message 1, passage 1]\nBlue.';
    const count = text => quoteMemoryText(text).length;
    const full = await selectPackedMemory([doc], [doc], rendered.length, count);
    assert.equal(full.tokens, rendered.length);
    assert.deepEqual(full.passages, [doc]);
    assert.equal(quoteMemoryMessages(full.messages, 'User')[0].mes, rendered);
    const tight = await selectPackedMemory([doc], [doc], rendered.length - 1, count);
    assert.deepEqual(tight.passages, []);
    assert.deepEqual(quoteMemoryMessages(tight.messages, 'User'), []);
});

test('final delivery requires the complete archive in its carrier role and preserves recent roles', () => {
    const memory = quoteMemoryMessages([
        { index: 0, mes: '[Past conversation excerpt: user "User", message 1, passage 1]\nFirst fact.' },
        { index: 3, mes: '[Past conversation excerpt: assistant "Mira", message 4, passage 1]\nSecond fact.' },
    ], 'User');
    const recent = [{ index: 7, name: 'Mira', is_user: false, mes: 'Recent answer.' }];
    const expected = { memory: expectedMessages(memory), input: expectedMessages(recent) };
    const prompt = [{ role: 'user', content: memory[0].mes }, { role: 'assistant', content: recent[0].mes }];
    assert.equal(inspectPrompt(expected, prompt).memory[0].outcome, 'included');
    for (const message of [
        { role: 'user', content: memory[0].mes.replace('Second fact.', '') },
        { role: 'assistant', content: memory[0].mes },
    ]) {
        const result = inspectPrompt(expected, [message, prompt[1]]);
        assert.equal(result.memory[0].outcome, 'missing');
        assert.equal(result.input[0].outcome, 'included');
    }
});
