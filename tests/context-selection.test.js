import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capture } from '../src/memory.js';
import { assistantFallbackQueries } from '../scripts/assistant-fallback-policy.mjs';
import { hash, loadNaturalFixture, naturalCases } from '../scripts/natural-dialogue.mjs';

test('frozen prior-user queries match the independently recorded live candidate across all 32 comparison cases', () => {
    const report = JSON.parse(readFileSync(new URL('../docs/results/context-selection-v1.json', import.meta.url)));
    let checked = 0;
    for (const [version, expectedHash] of Object.entries(report.fixtures)) {
        const fixture = loadNaturalFixture(version);
        assert.equal(hash(fixture), expectedHash, 'Comparison fixture changed');
        for (const item of naturalCases(fixture)) {
            const chat = [...item.input.source, { mes: item.input.question, name: 'User', is_user: true }];
            const snapshot = capture({ chat, characterId: 0, characters: [{ avatar: `${item.story}.png` }], getCurrentChatId: () => item.id });
            const row = report.rows.find(row => row.fixture === version && row.case === item.id);
            assert(row, 'Missing live comparison case');
            assert.deepEqual(assistantFallbackQueries(snapshot), row.variants['prior-user'].queries);
            checked++;
        }
    }
    assert.equal(checked, 32);
    assert.equal(report.rows.length, checked);
});
