import test from 'node:test';
import assert from 'node:assert/strict';
// Adapter is exercised through the pinned host in scripts/browser-smoke.mjs.
// Keep a regression check on the durable journal before remote mutation.
import { MemoryEngine, Journal } from '../src/memory.js';
test('queued work invalidated before execution makes no remote requests', async () => {
    let calls = 0;
    const engine = new MemoryEngine({ owner: 'a'.repeat(32), collection: 'test', branch: 'chat_test', client: { assertOwned() { calls++; } }, journal: new Journal({ getItem() { return null; }, setItem() {} }, 'test') });
    const snapshot = { character: 'a.png', chat: 'a', messages: [] };
    const result = await engine.sync(snapshot, { recent: 2, chunkChars: 200 }, () => false);
    assert.equal(result, null); assert.equal(calls, 0);
});
