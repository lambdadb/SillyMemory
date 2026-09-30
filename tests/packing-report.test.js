import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../docs/results/${name}.json`, import.meta.url)));

test('packing replay preserves every baseline coordinate and recovers the recorded attribution', () => {
    const report = read('repeated-packing-v1');
    assert.equal(report.passed, true);
    assert.equal(report.rows.length, 362);
    assert.equal(report.baselineSourcesEvicted, 0);
    for (const row of report.rows) {
        assert(row.packed.tokens <= row.budget);
        assert(row.baseline.selected.every(id => row.packed.selected.includes(id)));
        if (row.baseline.complete === true) assert.equal(row.packed.complete, true);
    }
    const targets = report.rows.filter(row => row.id.includes('semantic/long-ko-quotation/') && row.budget === 320);
    assert.equal(targets.length, 2);
    for (const row of targets) {
        assert.equal(row.baseline.complete, false); assert.equal(row.packed.complete, true);
        assert.equal(row.baseline.tokens, 295); assert.equal(row.packed.tokens, 266);
        assert(row.packed.selected.includes('0:0'));
    }
});

test('actual host delivers packed excerpts and live smoke cleans up the managed path', () => {
    const report = read('repeated-packing-host-v1');
    assert.equal(report.passed, true); assert.equal(report.rows.length, 11);
    assert.equal(report.remainingCollections, 0);
    assert.equal(report.overlap.rejectedCompletionRequests, 0);
    assert.equal(report.overlap.recoveryCompletionRequests, 1);
    assert.equal(report.packing.storedHistoryUnchanged, true);
    assert.match(report.packing.delivery, /4\/4 memory passages and 8\/8 recent messages verified/);
    const excerpts = report.packing.request.messages.filter(m => m.content.startsWith('[Past conversation excerpt:'));
    assert.equal(excerpts.length, 4);
    assert(excerpts.some(m => m.role === 'user' && m.content.includes('해솔의 서명')));
    assert(excerpts.some(m => m.role === 'assistant' && m.content.includes('제가 한 약속은 아니에요.')));
    assert(excerpts.some(m => m.content.includes('message:passage 3:1, 43:1]')));
    const live = read('repeated-packing-live-v1');
    assert.equal(live.passed, true); assert.equal(live.cleanupComplete, true);
    assert.equal(live.sourceUnchanged, true); assert.equal(live.checks.length, 12);
    const browser = read('repeated-packing-browser-v1');
    assert.equal(browser.passed, true); assert.equal(browser.checks.length, 22);
    assert.equal(browser.remainingCollections, 0);
    assert.equal(report.sourceSha256['src/memory.js'], live.sourceSha256['src/memory.js']);
    assert.equal(report.sourceSha256['src/memory.js'], browser.sourceSha256['src/memory.js']);
});
