import test from 'node:test';
import assert from 'node:assert/strict';
import { hostPromptTokens, dialogueSnapshot, dialogueText, compareDialogue, comparisonLabel, tokenLabel } from '../src/token-usage.js';

test('host estimates use counted packet contents and reject modified or unsupported packets', () => {
    const manager = { messages: { flatten: () => [{ role: 'system', content: 'Character', getTokens: () => 12 }, { role: 'user', content: 'Question', name: 'User', getTokens: () => 8 }] } };
    const prompt = [{ role: 'system', content: 'Character' }, { role: 'user', content: 'Question', name: 'User' }];
    assert.equal(hostPromptTokens(manager, prompt), 20);
    assert.equal(hostPromptTokens(manager, [...prompt, { role: 'system', content: 'Later injection' }]), undefined);
    assert.equal(hostPromptTokens(null, prompt), undefined);
    assert.equal(hostPromptTokens(manager, 'Text completion'), undefined);
    manager.messages.flatten = () => [{ role: 'user', content: [{ type: 'text', text: 'Image prompt' }], getTokens: () => 10 }];
    assert.equal(hostPromptTokens(manager, [{ role: 'user', content: [{ type: 'text', text: 'Image prompt' }] }]), undefined);
});

test('dialogue references retain literal source without executing macros or changing messages', async () => {
    const source = [{ mes: '{{setvar::x::changed}} <USER>', is_user: true }, { mes: 'Reply', is_user: false }];
    const before = dialogueSnapshot(source), after = [{ mes: 'Excerpt', is_user: true }], seen = [];
    source[0].mes = 'Edited later';
    assert.equal(dialogueText(before), 'User: {{setvar::x::changed}} <USER>\n\nAssistant: Reply');
    assert.deepEqual(await compareDialogue(before, after, 'Guidance', async text => { seen.push(text); return seen.length === 1 ? 100 : 40; }), { before: 100, after: 40 });
    assert.equal(seen[1], 'System: Guidance\n\nUser: Excerpt');
});

test('comparison reports increases, decreases and zero references without assuming savings', () => {
    assert.equal(comparisonLabel({ before: 100, after: 40 }), '~100 → ~40 tokens (~60, 60% less)');
    assert.equal(comparisonLabel({ before: 40, after: 100 }), '~40 → ~100 tokens (~60, 150% more)');
    assert.equal(comparisonLabel({ before: 0, after: 10 }), '~0 → ~10 tokens (~10 more)');
    assert.match(comparisonLabel({ before: 10, after: 10 }), /unchanged/);
});

test('invalid counters cannot display fabricated token usage or savings', async () => {
    for (const count of [NaN, Infinity, -1, undefined]) {
        assert.equal(tokenLabel(count), 'Unavailable');
        await assert.rejects(compareDialogue([], [], '', async () => count), /unavailable/);
        assert.equal(hostPromptTokens({ messages: { flatten: () => [{ role: 'user', content: 'Question', getTokens: () => count }] } }, [{ role: 'user', content: 'Question' }]), undefined);
    }
});
