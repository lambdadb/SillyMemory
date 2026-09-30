import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryMessages, selectMemory } from '../src/memory.js';
import { selectContextBundles } from '../scripts/context-bundles.mjs';
import { freshBundleInputs, semanticBundleInputs, coverageFor, diagnoseEvidence } from '../scripts/context-bundle-data.mjs';
const doc = (message, text = `Message ${message}.`, chunk = 0) => ({ id: `doc-${message}-${chunk}`, message, chunk, text, owner: 'owner', scope: 'scope', revision: `rev-${message}`, role: message % 2 ? 'assistant' : 'user', speaker: message % 2 ? 'Mira' : 'User' });
const count = text => text.length;
const tokens = docs => count(memoryMessages(docs).map(m => m.mes).join('\n'));

test('atomic context retains exact neighboring sources, native roles and every chunk', async () => {
    const docs = [doc(0, 'The author is Iris.'), doc(1, '🧭 "I promised ', 0), doc(1, 'Friday." {{getvar::x}}', 1), doc(2, 'The quote is not the assistant promise.')];
    const original = structuredClone(docs);
    const result = await selectContextBundles([docs[2]], docs, 2000, 'adjacent-turns', count);
    assert.deepEqual(result.passages, docs); assert.deepEqual(docs, original);
    assert.deepEqual(result.messages.map(m => m.is_user), [true, false, false, true]);
    assert(result.text.includes('🧭')); assert(!result.text.includes('{{getvar::x}}'));
    assert.deepEqual(result.decisions[0].bundle, docs.map(d => d.id));
});

test('oversized context is rejected as a unit and later smaller bundles are still considered', async () => {
    const docs = [doc(0, 'Long context. '.repeat(50)), doc(1, 'Friday.'), doc(4, 'Small.')];
    const budget = tokens([docs[2]]);
    const result = await selectContextBundles([docs[1], docs[2]], docs, budget, 'previous-turn', count);
    assert.deepEqual(result.passages, [docs[2]]);
    assert.equal(result.decisions[0].reason, 'budget-exceeded');
    assert.equal(result.decisions[0].overBy, tokens(docs.slice(0, 2)) - budget);
    assert.equal(result.available.find(d => d.id === docs[1].id).retrieved, true);
    assert.equal(result.available.find(d => d.id === docs[1].id).selected, false);
});

test('invalid duplicates cannot suppress valid source, and scope/deleted/stale hits do not inject', async () => {
    const docs = [doc(0), doc(1)];
    const hits = [{ ...docs[1], owner: 'foreign' }, { ...docs[1], revision: 'stale' }, doc(9), docs[1], docs[1]];
    const result = await selectContextBundles(hits, docs, 2000, 'previous-turn', count);
    assert.deepEqual(result.passages, docs);
    assert.deepEqual(result.decisions.map(d => d.reason), ['invalid-hit', 'invalid-hit', 'invalid-hit', 'selected', 'duplicate-hit']);
    await assert.rejects(selectContextBundles([], [docs[0], { ...docs[1], scope: 'other-chat' }], 2000, 'adjacent-turns', count), /Mixed local memory scope/);
});

test('missing or ineligible neighboring indices are boundaries; unavailable chunks are not manufactured', async () => {
    const docs = [doc(0), doc(2), doc(5)];
    const result = await selectContextBundles([docs[1]], docs, 2000, 'adjacent-turns', count);
    assert.deepEqual(result.passages, [docs[1]]);
    await assert.rejects(selectContextBundles([], [doc(1, 'Missing first chunk', 1)], 2000, 'adjacent-turns', count), /Incomplete/);
    await assert.rejects(selectContextBundles([], [docs[0], docs[0]], 2000, 'previous-turn', count), /Duplicate local/);
});

test('baseline trace reproduces shipped greedy selection and rejected/covered decisions', async () => {
    const docs = [doc(0, 'X'.repeat(500)), doc(1), doc(2)];
    const hits = [docs[0], docs[1], docs[2], docs[1]];
    const budget = tokens([docs[1], docs[2]]);
    const shipped = await selectMemory(hits, docs, budget, count);
    const traced = await selectContextBundles(hits, docs, budget, 'passage', count);
    assert.deepEqual(traced.passages, shipped.passages); assert.equal(traced.tokens, shipped.tokens);
    const bundled = await selectContextBundles([docs[1], docs[2]], docs, 2000, 'adjacent-turns', count);
    assert.equal(bundled.decisions[1].reason, 'already-covered');
    await assert.rejects(selectContextBundles(hits, docs, budget, 'passage', () => NaN), /Token counting/);
    await assert.rejects(selectContextBundles(hits, docs, -1, 'passage', count), /Invalid memory budget/);
});

test('fresh and recorded sources preserve rubrics outside candidate input and diagnose retrieval separately', async () => {
    const fresh = await freshBundleInputs(), recorded = await semanticBundleInputs();
    assert.equal(fresh.length, 16); assert.equal(recorded.length, 32);
    for (const input of fresh) {
        assert.equal(coverageFor(input.item, input.docs).completeEvidence, input.item.expected.type === 'abstain' ? null : true);
        assert(input.docs.every(d => !('evidence' in d) && !('expected' in d)));
        const result = await selectContextBundles(input.hits, input.docs, 0, 'passage', count);
        const diagnoses = diagnoseEvidence(input.item, result, input.hits, input.docs);
        assert(diagnoses.every(d => d.available && !d.covered));
        assert(diagnoses.every(d => ['not-selected-within-budget', 'not-in-retrieved-candidates'].includes(d.reason)));
    }
    const source = fresh.find(i => i.item.shape === 'quotation-before');
    const result = await selectContextBundles([source.hits[0]], source.docs, 2000, 'previous-turn', count);
    const diagnoses = diagnoseEvidence(source.item, result, [source.hits[0]], source.docs);
    assert.equal(diagnoses.find(d => d.id === 'author').retrieved, false);
    assert.equal(diagnoses.find(d => d.id === 'author').covered, true);
});
