import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { nativeBarrier } from '../scripts/benchmark-native-barrier.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
test('a native request starting after disable must finish before transition', async () => {
    const page = new EventEmitter(), request = { url: () => 'http://localhost/api/vector/list' };
    let finished = false;
    page.evaluate = async () => {
        page.emit('request', request);
        setTimeout(() => { finished = true; page.emit('requestfinished', request); }, 60);
        await sleep(5);
    };
    const barrier = nativeBarrier(page, { settleMs: 5, quietMs: 10, timeoutMs: 500 });
    const result = await barrier.suspend(); assert(finished); assert.equal(result.pending, 0); assert.equal(result.startedDuringBarrier, 1);
    barrier.close(); assert.equal(page.listenerCount('request'), 0);
});
test('an unsettled native request fails closed instead of switching chats', async () => {
    const page = new EventEmitter(), request = { url: () => 'http://localhost/api/vector/insert' };
    page.evaluate = async () => { page.emit('request', request); };
    const barrier = nativeBarrier(page, { settleMs: 0, quietMs: 0, timeoutMs: 20 });
    await assert.rejects(barrier.suspend(), /did not settle/); barrier.close();
});
