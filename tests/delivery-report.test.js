import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('actual host evidence retains blocked requests, explicit warning and same-chat manual recovery', () => {
    const report = JSON.parse(readFileSync(new URL('../docs/results/prompt-delivery-v1.json', import.meta.url)));
    assert.equal(report.passed, true);
    assert.equal(report.remainingCollections, 0);
    assert.equal(report.sessionKeyAbsentFromStorage, true);
    assert.equal(report.rows.length, 11);
    assert.deepEqual(report.rows.map(r => r.spec), report.plan.cases);
    assert.ok(report.sourceSha256['src/delivery.js']);
    let requests = 0, stopped = 0;
    for (const row of report.rows) {
        assert.equal(row.generating, false); assert.equal(row.generatingUI, null);
        assert.equal(row.requests.length, row.spec.blocked ? 0 : 1);
        if (row.spec.blocked) {
            stopped++;
            assert.match(row.delivery, /^Generation stopped:/);
            if (row.spec.type === 'normal') { assert.equal(row.isUser, true); assert.equal(row.chat.length, 13); }
        }
        requests += row.requests.length;
    }
    assert.equal(stopped, 5); assert.equal(requests, 6);
    const retry = report.rows.find(r => r.spec.id === 'pressure-stopped').manualRecovery;
    assert.deepEqual(retry.before, retry.after.slice(0, -1));
    assert.equal(retry.after.at(-1), 'LOCAL_FIXTURE_OK');
    assert.equal(retry.request.messages.filter(m => m.content.startsWith('[Past conversation excerpt:')).length, 8);
    assert.match(retry.delivery, /8\/8 memory passages and 4\/4 recent/);
    const warning = report.rows.find(r => r.spec.id === 'pressure-warning');
    assert.match(warning.delivery, /^Warning:.*0\/3 memory passages and 2\/4 recent/);
    assert.equal(warning.requests[0].messages.filter(m => m.content.startsWith('[Past conversation excerpt:')).length, 0);
});
