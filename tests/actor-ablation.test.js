import test from 'node:test';
import assert from 'node:assert/strict';
import { ABLATION_MODES, ablationHistory, ablationPromptEvidence } from '../scripts/actor-ablation.mjs';
import { naturalCases, naturalSchedule, loadNaturalFixture } from '../scripts/natural-dialogue.mjs';
const fixture = loadNaturalFixture('actor-ablation-v1'), cases = naturalCases(fixture);
const identity = "Write SillyMemory E2E Mira's next reply in a fictional chat between SillyMemory E2E Mira and User.";
const request = (item, mode) => [identity, fixture.generation.instruction, '[Start a new Chat]'].map(content => ({ role: 'system', content })).concat(ablationHistory(item, fixture, mode).map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })));

test('ablation keeps prior pronoun histories and selected distractors, with balanced four-way order', () => {
    const prior = naturalCases(loadNaturalFixture('actor-perspective-v1'));
    for (const item of cases) assert.deepEqual(item, prior.find(p => p.id === item.id));
    const schedule = naturalSchedule(fixture);
    assert.equal(schedule.length, 32);
    for (const r of [1, 2]) for (let position = 0; position < 4; position++) {
        assert.equal(new Set(cases.map(item => schedule.filter(s => s.case === item.id && s.repetition === r)[position].mode)).size, 4);
    }
    for (const item of cases) {
        const before = structuredClone(item), selection = fixture.ablation.selections[item.id];
        assert(selection.passages.length > 1);
        for (const mode of ABLATION_MODES) {
            const evidence = ablationPromptEvidence(item, fixture, mode, request(item, mode));
            assert.equal(evidence.sourceMessagesPresent, mode.startsWith('full') ? 64 : selection.passages.length + 11);
            assert.equal(evidence.labelledMessages, mode.endsWith('labelled') ? selection.passages.length : 0);
        }
        assert.deepEqual(item, before, 'No source mutation');
        const strip = history => history.map(m => ({ ...m, mes: m.mes.replace(/^\[Past conversation excerpt:[^\n]+\]\n/, '') }));
        assert.deepEqual(strip(ablationHistory(item, fixture, 'sparse-labelled')), ablationHistory(item, fixture, 'sparse-raw'));
        assert.deepEqual(strip(ablationHistory(item, fixture, 'full-labelled')), ablationHistory(item, fixture, 'full-raw'));
    }
});

test('outgoing ablation verifier rejects omitted/extra/reordered sources, labels, role and system drift', () => {
    const item = cases[0], mode = 'sparse-labelled', good = request(item, mode);
    for (const mutate of [
        p => p.splice(5, 1), p => p.push(p[5]), p => { [p[5], p[6]] = [p[6], p[5]]; },
        p => { p[5].role = p[5].role === 'user' ? 'assistant' : 'user'; },
        p => { p[3].content = p[3].content.replace(/^.*\n/, ''); },
        p => { p[1].content += ' Extra hint'; },
    ]) {
        const bad = structuredClone(good); mutate(bad);
        assert.throws(() => ablationPromptEvidence(item, fixture, mode, bad));
    }
    const changed = structuredClone(fixture); changed.ablation.selections[item.id].passages[0].text += ' edit';
    assert.throws(() => ablationHistory(item, changed, mode), /complete source/);
    const duplicate = structuredClone(fixture); duplicate.ablation.selections[item.id].passages.push(duplicate.ablation.selections[item.id].passages[0]);
    assert.throws(() => ablationHistory(item, duplicate, mode), /one complete chunk/);
});
