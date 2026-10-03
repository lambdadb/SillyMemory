import test from 'node:test';
import assert from 'node:assert/strict';
import { policies, rankPassages, summarizeSelection } from '../scripts/budget-selection.mjs';

const doc = (id, text = 'Lantern repair history') => ({ id, text, message: Number(id), chunk: 0, speaker: 'Character', role: 'assistant' });

test('offline ranking has deterministic ties, Unicode matching and explicit invalid-policy/cost failures', () => {
    const first = doc('1'), second = doc('2');
    for (const policy of policies) {
        const ranked = rankPassages([[first], [second]], ['lantern', 'lantern'], policy, () => 20);
        assert.deepEqual(ranked.map(hit => hit.id), ['1', '2']);
    }
    assert.deepEqual(rankPassages([[second, first], [first, second]], ['lantern'], 'rrf0', () => 20).map(hit => hit.id), ['2', '1']);
    assert.equal(rankPassages([[doc('0', 'Schedule'), first]], ['ＬＡＮＴＥＲＮ'], 'lexical', () => 20)[0].id, '1');
    assert.deepEqual(rankPassages([[], []], ['Nothing'], 'lexical', () => 20), []);
    assert.throws(() => rankPassages([[first]], ['q'], 'unsupported', () => 20), /Unknown selection policy/);
    for (const value of [0, -1, NaN, Infinity]) assert.throws(() => rankPassages([[first]], ['q'], 'density', () => value), /Invalid passage cost/);
});

test('a net coverage gain cannot conceal a lost source, unknowns do not inflate coverage', () => {
    const row = (id, baseline, candidate) => ({ id, budget: 320, variants: Object.fromEntries(policies.map(policy => [policy, {
        tokens: 100, evidence: (policy === 'baseline' ? baseline : candidate).map((selected, message) => ({ message, quote: `fact ${message}`, selected })),
    }])) });
    const rows = [row('gain', [false, false], [true, true]), row('loss', [true], [false]), row('unknown', [], [])];
    let summary = summarizeSelection(rows);
    assert.equal(summary.lexical.selected, 2); assert.equal(summary.lexical.total, 3);
    assert.equal(summary.lexical.gains.length, 2); assert.equal(summary.lexical.losses.length, 1);
    assert.equal(summary.lexical.eligibleForFreshValidation, false);
    summary = summarizeSelection([rows[0], rows[2]]);
    assert.equal(summary.lexical.eligibleForFreshValidation, true);
    assert.equal(summary.baseline.eligibleForFreshValidation, false);
    assert.throws(() => summarizeSelection([]), /Missing/);
    assert.throws(() => summarizeSelection([rows[0], rows[0]]), /duplicate/);
    const changed = structuredClone(rows);
    changed[0].variants.lexical.evidence[0].quote = 'different source';
    assert.throws(() => summarizeSelection(changed), /Evidence alignment/);
    changed[0] = structuredClone(rows[0]); changed[0].variants.lexical.tokens = 321;
    assert.throws(() => summarizeSelection(changed), /Budget exceeded/);
});
