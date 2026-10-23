import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupGenerationResources } from '../scripts/generation-cleanup.mjs';

test('failed remote cleanup retains the pending ownership record', async () => {
    let removed = false;
    assert.deepEqual(await cleanupGenerationResources({ deleteRemote: async () => { throw new Error('offline'); }, removePending: async () => { removed = true; } }), { cleanupComplete: false });
    assert.equal(removed, false);
});

test('successful remote cleanup removes the pending record only after deletion', async () => {
    const order = [];
    assert.deepEqual(await cleanupGenerationResources({ deleteRemote: async () => { order.push('delete'); }, removePending: async () => { order.push('remove'); } }), { cleanupComplete: true });
    assert.deepEqual(order, ['delete', 'remove']);
    await assert.rejects(cleanupGenerationResources({ deleteRemote: async () => {}, removePending: async () => { throw new Error('storage failure'); } }), /storage failure/);
});
