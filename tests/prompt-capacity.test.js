import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectCapacity } from '../scripts/prompt-capacity-inspect.mjs';

const report = JSON.parse(await readFile(new URL('../docs/results/prompt-capacity-v1.json', import.meta.url), 'utf8'));
const frozen = JSON.parse(await readFile(new URL('../docs/results/prompt-capacity-plan-v1.json', import.meta.url), 'utf8'));

test('capacity evidence matches the pre-run plan and frozen harness', async () => {
    for (const field of ['plan', 'sourceSha256', 'hostSha256', 'time']) assert.deepEqual(report[field], frozen[field]);
    for (const file of ['scripts/prompt-capacity.mjs', 'scripts/prompt-capacity-cases.mjs']) {
        const data = await readFile(new URL(`../${file}`, import.meta.url));
        assert.equal(createHash('sha256').update(data).digest('hex'), frozen.sourceSha256[file]);
    }
    assert.ok(report.requests.some(r => r.operation === 'docs/upsert'));
    assert.ok(report.requests.some(r => r.operation === 'query'));
    assert.ok(report.requests.some(r => r.operation === 'collection' && r.method === 'DELETE'));
});

test('same interceptor capacity does not imply the same final headroom', () => {
    const rows = inspectCapacity(report), small = rows[1], instructions = rows[2];
    assert.equal(small.capacity, instructions.capacity);
    assert.equal(small.memoryCap, instructions.memoryCap);
    assert.deepEqual([small.remaining, instructions.remaining], [886, 175]);
    assert.equal(small.nativeSelectedMemory, 280);
    assert.equal(small.memoryTextTokens, 271, 'Joined text is not native message-envelope accounting');
});

test('retain the negative host truncation observation despite successful injection', () => {
    const pressure = inspectCapacity(report)[3];
    assert.deepEqual([pressure.selectedMemory, pressure.sentMemory], [3, 0]);
    assert.deepEqual([pressure.selectedRecent, pressure.sentRecent], [4, 2]);
    assert.deepEqual(pressure.droppedRecentIndices, [9, 10]);
    assert.deepEqual(pressure.droppedMemoryIndices, [0, 1, 2]);
    assert.equal(pressure.nativeSelectedRecent, 1848);
    assert.equal(pressure.remaining, 606, 'Unused capacity does not imply skipped history is reconsidered');
});

test('larger context and output reserve are separate allocation controls', () => {
    const rows = inspectCapacity(report);
    assert.deepEqual(rows.map(r => r.memoryCap), [null, 320, 320, 320, 800, 192]);
    assert.deepEqual(rows.map(r => r.sentMemory), [0, 3, 3, 0, 8, 2]);
    assert.equal(rows[4].remaining, 2978);
});

for (const [name, corrupt] of [
    ['incomplete run', r => { r.passed = false; }],
    ['missing control', r => { r.rows.pop(); }],
    ['unclosed ledger', r => { r.rows[1].accounting.remaining++; }],
    ['different outbound prompt', r => { r.rows[1].request.messages.pop(); }],
    ['recent content changed inside interceptor', r => { r.rows[1].hook.chat.at(-1).mes = 'changed'; }],
    ['native role cost mismatch', r => { r.rows[1].hook.chat[0].nativeTokens++; }],
    ['uncleaned owned collection', r => { r.remainingCollections = 1; }],
]) {
    test(`capacity inspection rejects ${name}`, () => {
        const corrupted = structuredClone(report); corrupt(corrupted);
        assert.throws(() => inspectCapacity(corrupted));
    });
}
