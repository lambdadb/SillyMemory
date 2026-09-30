import test from 'node:test';
import { recordedSource } from '../scripts/recorded-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policies, rankPassages, summarizeSelection } from '../scripts/budget-selection.mjs';
import { read, replayInputs, sha } from '../scripts/budget-selection-data.mjs';

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

test('all replay inputs match eligible synthetic source, including the actual host character label and query order', async () => {
    const inputs = await replayInputs();
    assert.equal(inputs.length, 94);
    assert.equal(inputs.reduce((n, input) => n + input.budgets.length, 0), 218);
    assert.equal(inputs.reduce((n, input) => n + input.budgets.length * input.evidence.length, 0), 190);
    for (const input of inputs) {
        assert(input.lists.flat().every(doc => input.docs.includes(doc)));
        for (const ref of input.evidence) assert(input.docs.some(doc => doc.message === ref.message && doc.text.includes(ref.quote)));
        if (input.id.startsWith('generation/')) {
            assert.equal(input.recent, 8); assert.equal(input.originalBudget, 320);
            assert(input.docs.filter(doc => doc.role === 'assistant').every(doc => doc.speaker === 'SillyMemory E2E Mira'));
        }
    }
});

test('checked-in replay retains every policy, configuration and regression and binds producer inputs', async () => {
    const report = read('docs/results/budget-selection-replay-v1.json');
    assert.equal(report.serviceCalls, 0); assert.equal(report.generationCalls, 0);
    assert.equal(report.runtimeChanged, false); assert.equal(report.rows.length, 218);
    assert.equal(new Set(report.rows.map(row => `${row.id}/${row.budget}`)).size, 218);
    assert.deepEqual(report.reproduced, { search: 62, generationOn: 32 });
    const inputs = new Map((await replayInputs()).map(input => [input.id, input]));
    for (const row of report.rows) {
        const input = inputs.get(row.id); assert(input);
        assert(input.budgets.includes(row.budget)); assert.equal(row.recent, input.recent);
        assert.deepEqual(row.evidence, input.evidence);
        const available = new Map(input.lists.flat().map(doc => [`${doc.message}:${doc.chunk}`, doc]));
        for (const policy of policies) {
            const variant = row.variants[policy];
            assert.equal(new Set(variant.selected).size, variant.selected.length);
            const selected = variant.selected.map(key => { assert(available.has(key)); return available.get(key); });
            assert.deepEqual(variant.evidence, input.evidence.map(ref => ({ message: ref.message,
                selected: selected.some(doc => doc.message === ref.message && doc.text.includes(ref.quote)) })));
        }
    }
    assert.deepEqual(report.summary, summarizeSelection(report.rows));
    assert.deepEqual(report.eligibleForFreshValidation, []);
    assert.deepEqual(Object.fromEntries(policies.map(policy => [policy, report.summary[policy].selected])), {
        baseline: 182, rrf0: 186, rrf60: 155, density: 179, lexical: 188, 'lexical-rrf': 186,
    });
    assert(policies.filter(policy => policy !== 'baseline').every(policy => report.summary[policy].losses.length > 0));
    for (const file of ['index.js', 'src/memory.js', 'src/context.js', 'scripts/budget-selection.mjs', 'scripts/budget-selection-data.mjs', 'scripts/budget-selection-replay.mjs', 'tests/fixtures/budget-selection-hits-v1.json']) {
        assert(report.sourceSha256[file], `Missing required hash: ${file}`);
    }
    for (const [file, hash] of Object.entries(report.sourceSha256)) {
        assert.equal(sha(recordedSource(file, hash)), hash, `Use the recorded replay revision: ${file}`);
    }
});
