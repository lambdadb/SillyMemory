// Private local execution state for frozen public benchmark inputs. API keys and
// headers must never be passed by callers. Persist intent before dispatch, receipt before
// assertions, and observations before validation. Unknown delivery is fail-closed.
import assert from 'node:assert/strict';
import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { sha } from './benchmark-audit.mjs';
export async function openCheckpoint(directory, binding, limits) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = await open(path.join(directory, 'writer.lock'), 'wx', 0o600);
    await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.sync();
    const file = path.join(directory, 'state.json');
    let state, tail = Promise.resolve();
    async function atomic(target, value) {
        const handle = await open(target + '.tmp', 'w', 0o600);
        try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
        finally { await handle.close(); }
        await rename(target + '.tmp', target);
    }
    const save = () => { const snapshot = structuredClone(state); tail = tail.then(() => atomic(file, snapshot)); return tail; };
    try {
        try { state = JSON.parse(await readFile(file, 'utf8')); }
        catch (e) { if (e.code !== 'ENOENT') throw e; state = { version: 1, binding, limits, used: {}, calls: {}, observations: {} }; }
        assert.equal(state.version, 1); assert.deepEqual(state.binding, binding, 'Checkpoint binding changed');
        assert.deepEqual(state.limits, limits, 'Checkpoint limits changed');
        await save();
    } catch (e) { await lock.close(); await unlink(path.join(directory, 'writer.lock')); throw e; }
    function reserve(delta) {
        const next = { ...state.used };
        for (const [key, value] of Object.entries(delta)) {
            assert(Number.isFinite(value) && value >= 0 && Number.isFinite(limits[key]), 'Invalid reservation');
            next[key] = (next[key] || 0) + value;
            assert(next[key] <= limits[key], `Checkpoint budget exceeded: ${key}`);
        }
        state.used = next;
    }
    return { get state() { return structuredClone(state); },
        async call(id, request, reservation, send) {
            const hash = sha(JSON.stringify(request)), existing = state.calls[id];
            if (existing) {
                assert.equal(existing.requestSha256, hash, 'Cached request changed');
                assert.equal(existing.status, 'complete', 'Uncertain or failed call requires explicit recovery; not resent');
                const bytes = await readFile(path.join(directory, existing.receipt));
                assert.equal(sha(bytes), existing.receiptSha256, 'Receipt changed');
                return { value: JSON.parse(bytes), reused: true };
            }
            reserve(reservation);
            const entry = { requestSha256: hash, status: 'pending', reservation };
            state.calls[id] = entry; await save();
            // A thrown transport error leaves pending intent. No automatic replay.
            const value = await send();
            const receipt = `receipt-${sha(id)}.json`, target = path.join(directory, receipt);
            await atomic(target, value);
            const bytes = await readFile(target);
            Object.assign(entry, { status: 'complete', receipt, receiptSha256: sha(bytes) }); await save();
            return { value, reused: false };
        },
        async observe(id, observation, validate) {
            const existing = state.observations[id];
            if (existing) assert.deepEqual(existing.value, observation, 'Recorded observation changed');
            else { state.observations[id] = { value: observation, validated: false }; await save(); }
            if (!validate) return;
            await validate(observation);
            state.observations[id].validated = true; await save();
        },
        async charge(delta) { reserve(delta); await save(); },
        async close() { try { await tail; } finally { await lock.close(); await unlink(path.join(directory, 'writer.lock')); } },
    };
}
