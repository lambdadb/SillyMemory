import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNaturalFixture, naturalCases, naturalSchedule, auditNaturalDialogue, hash } from '../scripts/natural-dialogue.mjs';
import { actorPromptEvidence } from '../scripts/actor-perspective.mjs';

const fixture = loadNaturalFixture('actor-perspective-v1');
const identity = "Write SillyMemory E2E Mira's next reply in a fictional chat between SillyMemory E2E Mira and User.";
const prompt = item => [{ role: 'system', content: identity }, ...item.input.source.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes }))];

test('actor diagnostic freezes eight matched cases with only one wording intervention per pair', async () => {
    assert.equal(hash(fixture), 'ecec3b4cac3683d7b7239d388331880a586669aa94ecbbd9f8d7b4dbe526db37');
    assert.equal(naturalSchedule(fixture).length, 32);
    assert.equal(fixture.settings.context, 8192);
    assert.equal(fixture.settings.budget, 400);
    const cases = naturalCases(fixture);
    assert.equal(cases.length, 8);
    for (const language of ['en', 'ko']) for (const reporter of ['user', 'assistant']) {
        const [pronoun, named] = ['pronoun', 'named'].map(wording => cases.find(c => c.id === `${language}-${reporter}-${wording}`));
        assert.equal(pronoun.input.question, named.input.question);
        assert.equal(pronoun.input.source.length, 64);
        assert.equal(new Set(pronoun.input.source.map(m => m.mes)).size, 64);
        const changed = pronoun.input.source.flatMap((m, i) => JSON.stringify(m) === JSON.stringify(named.input.source[i]) ? [] : [i]);
        assert.deepEqual(changed, [pronoun.rubric.requiredEvidence[0].message]);
        assert.equal(pronoun.rubric.requiredEvidence[0].meaning, named.rubric.requiredEvidence[0].meaning);
        assert.equal(pronoun.input.source[changed[0]].is_user, reporter === 'user');
        assert.deepEqual(actorPromptEvidence(pronoun, 'off', prompt(pronoun)).requiredRoles[0].actualRoles, [reporter]);
    }
    assert((await auditNaturalDialogue(fixture)).passed);
});

test('actor evidence rejects truncated baselines, incorrect roles and identity drift independently of answer text', () => {
    const item = naturalCases(fixture)[0], full = prompt(item), ref = item.rubric.requiredEvidence[0];
    assert.equal(actorPromptEvidence(item, 'off', full).sourceMessagesPresent, 64);
    const truncated = full.slice(0, -1);
    assert.throws(() => actorPromptEvidence(item, 'off', truncated), /lost source history/);
    // The on condition may omit other history, but never its required actor source.
    assert(actorPromptEvidence(item, 'on', truncated));
    const missing = full.filter(m => !m.content.includes(ref.quote));
    assert.throws(() => actorPromptEvidence(item, 'on', missing), /Actor source missing/);
    const wrong = structuredClone(full); wrong[ref.message + 1].role = 'assistant';
    assert.throws(() => actorPromptEvidence(item, 'on', wrong), /wrong API role/);
    assert.throws(() => actorPromptEvidence(item, 'on', [...full, full[ref.message + 1]]), /duplicated/);
    const identityDrift = structuredClone(full); identityDrift[0].content = 'Reply as another character.';
    assert.throws(() => actorPromptEvidence(item, 'on', identityDrift), /reply identity changed/);
    const nameDrift = structuredClone(item); nameDrift.input.source[1].name = 'Different character';
    assert.throws(() => actorPromptEvidence(nameDrift, 'on', full), /participant names differ/);
});
