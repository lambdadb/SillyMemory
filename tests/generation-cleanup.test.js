import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupGenerationResources } from '../scripts/generation-cleanup.mjs';

test('failed native cleanup still deletes remote data and retains the recovery record', async () => {
    const calls = [];
    const result = await cleanupGenerationResources({
        purgeNative: async () => { calls.push('native'); throw new Error('purge failed'); },
        deleteRemote: async () => { calls.push('remote'); },
        removePending: async () => { calls.push('remove'); },
    });
    assert.deepEqual(calls, ['native', 'remote']);
    assert.deepEqual(result, { nativeCleanupComplete: false, cleanupComplete: true });
});

test('remote cleanup failure retains recovery identity; full success removes it last', async () => {
    for (const failRemote of [true, false]) {
        const calls = [];
        const result = await cleanupGenerationResources({
            purgeNative: async () => { calls.push('native'); },
            deleteRemote: async () => { calls.push('remote'); if (failRemote) throw new Error('delete failed'); },
            removePending: async () => { calls.push('remove'); },
        });
        assert.deepEqual(calls, failRemote ? ['native', 'remote'] : ['native', 'remote', 'remove']);
        assert.deepEqual(result, { nativeCleanupComplete: true, cleanupComplete: !failRemote });
    }
});
