import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { capacityPlan, capacityChat, capacityInstructions } from './prompt-capacity-cases.mjs';

// Require evidence at both boundaries. A successful interceptor alone does not
// establish that selected memory reached the provider's HTTP request.
export function inspectCapacity(report) {
    assert.equal(report.passed, true, 'Incomplete capacity run');
    assert.deepEqual(report.plan, capacityPlan, 'Known fixed controls');
    assert.equal(report.remainingCollections, 0, 'Owned emulator data cleaned');
    assert.equal(report.sessionKeyAbsentFromStorage, true);
    assert.equal(report.rows.length, capacityPlan.cases.length);
    return report.rows.map((row, i) => {
        const { spec, hook, accounting, ready, request } = row;
        assert.deepEqual(spec, capacityPlan.cases[i], 'Complete ordered case coverage');
        assert.equal(hook.sourceUnchanged, true);
        assert.equal(hook.contextSize, spec.context - spec.output);
        assert.equal(request.model, capacityPlan.model);
        assert.equal(request.max_tokens, spec.output);
        assert.deepEqual(accounting.chat, ready);
        assert.deepEqual(ready, request.messages, 'Final host prompt matches received request');
        assert.equal(row.answer, 'LOCAL_FIXTURE_OK');
        assert.equal(accounting.total, accounting.collections.reduce((sum, c) => sum + c.tokens, 0));
        assert.equal(accounting.total, accounting.messages.reduce((sum, m) => sum + m.tokens, 0));
        assert.equal(accounting.total + accounting.remaining + 3, hook.contextSize, 'Native ledger closes');
        assert.ok(accounting.remaining >= 0);
        assert.ok(request.messages.some(m => m.role === 'system' && m.content === capacityInstructions(spec.instructions)));
        assert.ok(request.messages.some(m => m.role === 'system' && m.content === capacityPlan.character));
        const memory = hook.chat.filter(m => m.mes.startsWith('[Past conversation excerpt:'));
        const recent = hook.chat.slice(-capacityPlan.recent);
        const sourceRecent = [...capacityChat(spec.recentRepeats).slice(-(capacityPlan.recent - 1)), { mes: capacityPlan.question, is_user: true }];
        assert.deepEqual(recent.map(m => [m.mes, m.is_user]), sourceRecent.map(m => [m.mes, m.is_user]), 'Hook protects exact recent content');
        const retained = m => request.messages.some(out => out.role === (m.is_user ? 'user' : 'assistant') && out.content === m.mes);
        for (const m of hook.chat.filter(retained)) {
            assert.equal(accounting.messages.find(out => out.role === (m.is_user ? 'user' : 'assistant') && out.content === m.mes)?.tokens, m.nativeTokens, 'Pre-pack native count agrees with retained message');
        }
        const cap = Math.min(capacityPlan.budget, Math.floor(hook.contextSize / 4));
        if (spec.enabled) {
            assert.ok(memory.length > 0, 'Memory retrieval and injection actually occurred');
            assert.ok(hook.memoryTextTokens <= cap);
            assert.ok(hook.inspection.startsWith(`${hook.memoryTextTokens} / ${cap} tokens\n`));
        } else {
            assert.equal(memory.length, 0);
            assert.equal(hook.memoryTextTokens, 0);
        }
        const nativeCost = messages => messages.reduce((sum, m) => sum + m.nativeTokens, 0);
        return {
            id: spec.id, capacity: hook.contextSize, memoryCap: spec.enabled ? cap : null,
            memoryTextTokens: hook.memoryTextTokens, selectedMemory: memory.length,
            sentMemory: memory.filter(retained).length, nativeSelectedMemory: nativeCost(memory),
            nativeSentMemory: nativeCost(memory.filter(retained)),
            selectedRecent: recent.length, sentRecent: recent.filter(retained).length,
            nativeSelectedRecent: nativeCost(recent), nativeSentRecent: nativeCost(recent.filter(retained)),
            droppedRecentIndices: recent.filter(m => !retained(m)).map(m => m.index),
            droppedMemoryIndices: memory.filter(m => !retained(m)).map(m => m.index),
            promptTokens: accounting.total, replyPrimingTokens: 3, remaining: accounting.remaining,
        };
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
    console.table(inspectCapacity(report));
}
