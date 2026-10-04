import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { challengeCases, challengeVersion, challengeSettings } from '../scripts/recall-challenges.mjs';
import { heldoutCases, heldoutVersion, answerEvidence } from '../scripts/heldout-fixture.mjs';
import { summarizeChallenges } from '../scripts/challenge-summary.mjs';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(heldout = false) {
    const cases = heldout ? heldoutCases() : challengeCases(), item = cases[0];
    const row = { index: 0, case: item.id, mode: 'off', label: item.label, type: item.type, kind: item.kind, sourceTokens: 1600, sourceHash: hash(item.source.map(m => ({text:m.mes,user:m.is_user,name:m.name}))), answer: item.label, correct: true, injected: false, memoryTokens: 0, targetInPrompt: true, targetInMemory: false, sourceMessagesPresent: item.source.length, promptTokens: 2000 };
    if (heldout) row.answerEvidence = answerEvidence(row.answer, row.label);
    const g = { stage: `challenge/${item.id}/off`, upstreamStatus: 200, finishReason: 'stop', providerAnswer: item.label, challenge: row, messages: item.source.map(m => ({role:'user',content:m.mes})), providerUsage: {prompt_tokens: 2000} };
    return { passed: true, cleanupComplete: true, nativeCleanupComplete: true, generator: 'live compatible model', model: 'gpt-4.1-mini-2025-04-14', sillyTavern: '06bde939fb1e9c4c8d8641d810f0a916b5bce127', hostContextTokens: 8192, maxOutputTokens: 256,
        sourceSha256: Object.fromEntries(['index.js','src/client.js', 'vendor/lambdadb.js', 'package-lock.json','src/gate.js','src/memory.js','src/context.js','src/status.js','scripts/recall-challenges.mjs','scripts/challenge-eval.mjs','scripts/generation-smoke.mjs','scripts/generation-cleanup.mjs', ...(heldout ? ['scripts/heldout-fixture.mjs'] : [])].map(f=>[f,'0'.repeat(64)])),
        evaluation: {version:heldout ? heldoutVersion : challengeVersion,fixtureHash:hash(cases),settings:challengeSettings,rows:[row]}, generations:[g], checks:['identical source restored','intended context boundary verified','original source preserved','recent source retained'].map(s=>`${item.id}/off: ${s}`) };
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

for (const file of ['src/context.js', 'scripts/generation-smoke.mjs', 'scripts/generation-cleanup.mjs']) {
    test(`challenge summary requires a consistent ${file} hash`, () => {
        const first = fixture(), resumed = fixture();
        // A report with a completed sample and an empty resume must use the same harness.
        resumed.evaluation.rows = [];
        resumed.generations = [];
        assert.equal(summarizeChallenges([first, resumed], { partial: true }).completedSamples, 1);
        resumed.sourceSha256[file] = '1'.repeat(64);
        assert.throws(() => summarizeChallenges([first, resumed], { partial: true }), /Mixed runtime or evaluation source/);
        delete resumed.sourceSha256[file];
        assert.throws(() => summarizeChallenges([resumed], { partial: true }), { message: `Missing hash: ${file}` });
    });
}

test('held-out summary enforces its fixture identity and independently recomputes code evidence', () => {
    const report = fixture(true);
    const opts = { heldout: true, partial: true };
    assert.equal(summarizeChallenges([report], opts).summary.off.expectedCodeOnly, 1);
    assert.throws(() => summarizeChallenges([report], { partial: true }));
    const forged = structuredClone(report); forged.evaluation.rows[0].answerEvidence.expectedCodeOnly = false;
    assert.throws(() => summarizeChallenges([forged], opts), /Incorrect code evidence/);
    const missing = structuredClone(report); delete missing.sourceSha256['scripts/heldout-fixture.mjs'];
    assert.throws(() => summarizeChallenges([missing], opts), /Missing hash/);
    const mixed = structuredClone(report); mixed.sourceSha256['scripts/heldout-fixture.mjs'] = '1'.repeat(64);
    assert.throws(() => summarizeChallenges([report, mixed], opts), /Mixed runtime/);
});

for (const heldout of [false, true]) {
    test(`${heldout ? 'held-out' : 'original'} summary rejects failed or unverified runs even after successful cleanup`, () => {
        const report = fixture(heldout);
        assert.equal(summarizeChallenges([report], { heldout, partial: true }).completedSamples, 1);
        const variants = [
            { ...report, passed: false, failure: { stage: 'secret audit', reason: 'Synthetic audit failure' } },
            { ...report, passed: false },
            { ...report, passed: undefined },
            { ...report, passed: 'true' },
            { ...report, failure: { stage: 'secret audit', reason: 'Inconsistent success flag' } },
        ];
        for (const invalid of variants) {
            for (const partial of [true, false]) {
                assert.throws(() => summarizeChallenges([invalid], { heldout, partial }), /Report must pass all integrity checks/);
            }
        }
    });
}
