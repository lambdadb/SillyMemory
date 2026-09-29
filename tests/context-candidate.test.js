import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateMessages, runCandidate, replayCandidate, candidateInputs, candidateHistory, candidateEvidence, CANDIDATE_MODES } from '../scripts/context-candidate.mjs';
import { selectMemory } from '../src/memory.js';
import { loadNaturalFixture, naturalCases, naturalSchedule } from '../scripts/natural-dialogue.mjs';
const doc = (message, text, extra = {}) => ({ id: `d${message}`, message, text, chunk: 0, role: message % 2 ? 'assistant' : 'user', speaker: message % 2 ? 'Mira' : 'User', owner: 'owner', scope: 'chat', revision: 'current', ...extra });
const count = text => text.length;

test('candidate current control equals production with forged, duplicate and stale hits', async () => {
    const expected = [doc(0, 'zero'), doc(1, 'one'), doc(2, 'two')];
    const hits = [{ ...expected[0], revision: 'old' }, { ...expected[0], text: 'edited' }, { ...expected[1], scope: 'other' }, { ...expected[1], owner: 'other' }, { ...expected[0], role: 'system', speaker: 'forged' }, expected[0], expected[2]];
    const candidate = await runCandidate(hits, expected, 200, 'current', count);
    const production = await selectMemory(hits, expected, 200, count);
    for (const key of ['passages', 'messages', 'text', 'tokens']) assert.deepEqual(candidate[key], production[key]);
    assert.equal(candidate.messages[0].is_user, true);
    assert.deepEqual(candidate.passages.map(p => p.id), ['d0', 'd2']);
    const { trace, ...selection } = candidate;
    assert.deepEqual(replayCandidate(hits, expected, 200, 'current', trace), selection);
});

test('raw retains the same baseline seeds without backfill and preserves literal safeguards', async () => {
    const docs = [doc(0, '{{setvar::x::secret}} <USER> <BOT> <CHAR>', { speaker: '{{user}}' }), doc(2, 'other '.repeat(30))];
    const current = await runCandidate(docs, docs, 160, 'current', count);
    const raw = await runCandidate(docs, docs, 160, 'raw', count);
    assert.deepEqual(raw.baseIds, current.baseIds); assert.deepEqual(raw.addedIds, []);
    assert.equal(raw.passages.length, 1); assert(raw.tokens < current.tokens);
    assert(!raw.text.includes('{{') && !raw.text.includes('<USER>'));
    assert.equal(raw.messages[0].name, '｛｛user｝｝');
    assert.equal(raw.messages[0].is_user, true);
    assert.deepEqual(raw.messages, candidateMessages(raw.passages));
});

test('adjacency uses remaining budget, keeps baseline seeds, and includes whole neighbor chunks atomically', async () => {
    const anchor = doc(0, 'a'.repeat(20)), other = doc(4, 'b'.repeat(20));
    const neighbors = [doc(1, 'c'.repeat(50), { id: 'n0' }), doc(1, 'd'.repeat(100), { id: 'n1', chunk: 1 })];
    const expected = [anchor, ...neighbors, other, doc(5, 'tiny')];
    const selected = await runCandidate([anchor, other], expected, 190, 'adjacent', count);
    assert.deepEqual(selected.baseIds, ['d0', 'd4']);
    assert.deepEqual(selected.addedIds, ['d5'], 'Too-large whole neighbor omitted; next fitting neighbor still tried');
    assert(!selected.passages.some(d => d.message === 1));
    const room = await runCandidate([anchor, other], expected, 240, 'adjacent', count);
    assert.deepEqual(room.addedIds, ['n0', 'n1', 'd5']);
    assert.deepEqual(room.messages.map(m => m.index), [0, 1, 1, 4, 5]);
});

test('adjacency rejects foreign scopes and same-role runs, and cannot resurrect missing local sources', async () => {
    const anchor = doc(2, 'anchor');
    for (const neighbor of [doc(3, 'foreign', { scope: 'other' }), doc(3, 'foreign', { owner: 'other' }), doc(3, 'same', { role: 'user' })]) {
        const result = await runCandidate([anchor], [anchor, neighbor], 400, 'adjacent', count);
        assert.deepEqual(result.addedIds, []);
    }
    const noNeighbor = await runCandidate([anchor, doc(3, 'deleted')], [anchor], 400, 'adjacent', count);
    assert.deepEqual(noNeighbor.passages, [anchor]);
    await assert.rejects(runCandidate([anchor], [anchor], 400, 'adjacent', () => NaN), /Token counting/);
});

test('eight-case candidate protocol freezes new controls and exact replay rejects outgoing and trace drift', async () => {
    const fixture = loadNaturalFixture('actor-candidate-v1'), cases = naturalCases(fixture);
    assert.equal(cases.length, 8); assert.equal(naturalSchedule(fixture).length, 48);
    assert.equal(Object.values(fixture.candidate.cohorts).filter(c => c === 'new-control').length, 4);
    assert(!fixture.candidate.seeds['en-actor-correction'].includes(3));
    const recentExcluded = structuredClone(cases[0]); recentExcluded.input.source[1].extra.file = 'attachment';
    const prepared = candidateInputs(recentExcluded, fixture);
    assert(!prepared.expected.some(d => d.message === 1 || d.message >= 53));
    for (const item of cases) for (const mode of CANDIDATE_MODES) {
        const { hits, expected } = candidateInputs(item, fixture);
        const selected = await runCandidate(hits, expected, fixture.settings.budget, mode, count);
        const outgoing = ["Write SillyMemory E2E Mira's next reply in a fictional chat between SillyMemory E2E Mira and User.", fixture.generation.instruction, '[Start a new Chat]'].map(content => ({ role: 'system', content })).concat(candidateHistory(item, fixture, selected).map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })));
        assert(candidateEvidence(item, fixture, mode, selected, outgoing));
        const broken = structuredClone(selected); broken.trace[0].text += 'changed';
        assert.throws(() => candidateEvidence(item, fixture, mode, broken, outgoing), /token trace/);
        assert.throws(() => candidateEvidence(item, fixture, mode, selected, outgoing.slice(0, -1)), /outgoing/);
    }
});
