import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { challengeCases, challengeVersion, challengeSettings } from '../scripts/recall-challenges.mjs';
import { summarizeChallenges } from '../scripts/challenge-summary.mjs';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture() {
    const cases = challengeCases(), item = cases[0];
    const row = { index: 0, case: item.id, mode: 'off', label: item.label, type: item.type, kind: item.kind, sourceTokens: 1600, sourceHash: hash(item.source.map(m => ({text:m.mes,user:m.is_user,name:m.name}))), answer: item.label, correct: true, injected: false, memoryTokens: 0, targetInPrompt: true, targetInMemory: false, sourceMessagesPresent: item.source.length, promptTokens: 2000 };
    const g = { stage: `challenge/${item.id}/off`, upstreamStatus: 200, finishReason: 'stop', providerAnswer: item.label, challenge: row, messages: item.source.map(m => ({role:'user',content:m.mes})), providerUsage: {prompt_tokens: 2000} };
    return { cleanupComplete: true, nativeCleanupComplete: true, generator: 'live compatible model', model: 'gpt-4.1-mini-2025-04-14', sillyTavern: '06bde939fb1e9c4c8d8641d810f0a916b5bce127', hostContextTokens: 8192, maxOutputTokens: 256,
        sourceSha256: Object.fromEntries(['index.js','src/client.js','src/gate.js','src/memory.js','src/status.js','scripts/recall-challenges.mjs','scripts/challenge-eval.mjs'].map(f=>[f,'0'.repeat(64)])),
        evaluation: {version:challengeVersion,fixtureHash:hash(cases),settings:challengeSettings,rows:[row]}, generations:[g], checks:['identical source restored','intended context boundary verified','original source preserved','recent source retained'].map(s=>`${item.id}/off: ${s}`) };
}
test('challenge summary refuses incomplete, duplicated, mixed-source and unverified answer evidence', () => {
    const r = fixture();
    assert.throws(() => summarizeChallenges([r]), /Incomplete/);
    assert.equal(summarizeChallenges([r],{partial:true}).summary.off.correct,1);
    assert.throws(() => summarizeChallenges([r,r],{partial:true}), /Duplicate/);
    const mixed=structuredClone(r);mixed.sourceSha256['src/memory.js']='1'.repeat(64);
    assert.throws(() => summarizeChallenges([r,mixed],{partial:true}), /Mixed runtime/);
    const unclean=structuredClone(r);unclean.cleanupComplete=false;
    assert.throws(() => summarizeChallenges([unclean],{partial:true}), /Cleanup/);
    const answer=structuredClone(r);answer.generations[0].providerAnswer='UNKNOWN';
    assert.throws(() => summarizeChallenges([answer],{partial:true}), /Provider answer/);
    const target=structuredClone(r);target.evaluation.rows[0].targetInPrompt=false;
    assert.throws(() => summarizeChallenges([target],{partial:true}));
});
