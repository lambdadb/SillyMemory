import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openCheckpoint } from '../scripts/benchmark-checkpoint.mjs';
const binding = { plan: 'frozen-plan', sources: 'fixed-producer' }, limits = { calls: 2, usd: 1 };
async function fixture(run) { const dir = await mkdtemp(path.join(tmpdir(), 'sm-checkpoint-')); try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); } }
test('completed provider call survives validation failure and process reopen without another send', () => fixture(async dir => {
    let sends = 0, c = await openCheckpoint(dir, binding, limits);
    const request = { messages: [{ role: 'user', content: 'public fixture' }] };
    await c.call('answer', request, { calls: 1, usd: .1 }, async () => { sends++; return { answer: 'original' }; });
    await assert.rejects(c.observe('row', { memory: [] }, () => { throw new Error('assertion'); }));
    await c.close(); c = await openCheckpoint(dir, binding, limits);
    assert.equal(c.state.observations.row.validated, false);
    const cached = await c.call('answer', request, { calls: 1, usd: .1 }, async () => { sends++; });
    assert(cached.reused); assert.deepEqual(cached.value, { answer: 'original' }); assert.equal(sends, 1);
    await c.observe('row', { memory: [] }, () => {}); assert(c.state.observations.row.validated);
    assert.equal(c.state.used.calls, 1); await c.close();
}));
test('unknown delivery, changed requests, limits and concurrent writers fail closed', () => fixture(async dir => {
    const c = await openCheckpoint(dir, binding, limits);
    await assert.rejects(openCheckpoint(dir, binding, limits), /EEXIST/);
    await assert.rejects(c.call('lost', {}, { calls: 1 }, async () => { throw new Error('timeout'); }));
    await assert.rejects(c.call('lost', {}, { calls: 1 }, async () => {}), /Uncertain/);
    await c.call('done', {}, { calls: 1 }, async () => 'ok');
    await assert.rejects(c.call('done', { changed: true }, {}, async () => {}), /changed/);
    await assert.rejects(c.call('over', {}, { calls: 1 }, async () => {}), /budget/);
    assert.equal(c.state.used.calls, 2); await c.close();
    await assert.rejects(openCheckpoint(dir, { plan: 'other' }, limits), /binding/);
    await assert.rejects(openCheckpoint(dir, binding, { ...limits, calls: 3 }), /limits/);
}));
test('corrupt cached responses are rejected instead of silently regenerated', () => fixture(async dir => {
    const c = await openCheckpoint(dir, binding, limits);
    await c.call('x', {}, { calls: 1 }, async () => 'original');
    await writeFile(path.join(dir, c.state.calls.x.receipt), '"changed"\n');
    await assert.rejects(c.call('x', {}, {}, async () => {}), /Receipt changed/);
    assert.equal(JSON.parse(await readFile(path.join(dir, 'state.json'))).used.calls, 1); await c.close();
}));
test('raw observation is durable before validation and state snapshots cannot mutate reservations', () => fixture(async dir => {
    const c = await openCheckpoint(dir, binding, limits);
    await c.observe('row', { prompt: 'public fixture' });
    assert.equal(JSON.parse(await readFile(path.join(dir, 'state.json'))).observations.row.validated, false);
    const state = c.state; state.used.calls = -100;
    await c.charge({ calls: 2 });
    await assert.rejects(c.charge({ calls: 1 }), /budget/);
    assert.equal(c.state.used.calls, 2); await c.close();
}));
test('a second Node process reuses a response after the first exits on validation failure', () => fixture(async dir => {
    const { execFileSync } = await import('node:child_process');
    const moduleUrl = new URL('../scripts/benchmark-checkpoint.mjs', import.meta.url).href;
    const script = `import { openCheckpoint } from ${JSON.stringify(moduleUrl)};
        import { appendFile } from 'node:fs/promises';
        const c = await openCheckpoint(process.argv[1], { plan: 'fixed' }, { calls: 1 });
        try {
            const result = await c.call('answer', { input: 'public' }, { calls: 1 }, async () => {
                await appendFile(process.argv[1] + '/sends', 'send\\n'); return { answer: 'original' };
            });
            await c.observe('row', { answer: result.value.answer }, () => {
                if (process.argv[2] === 'fail') throw new Error('observation assertion');
            });
            console.log(JSON.stringify({ reused: result.reused, answer: result.value.answer }));
        } catch { process.exitCode = 7; } finally { await c.close(); }`;
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', script, dir, 'fail'], { stdio: 'pipe' }), e => e.status === 7);
    const replay = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, dir, 'pass'], { encoding: 'utf8' }));
    assert.deepEqual(replay, { reused: true, answer: 'original' });
    assert.equal(await readFile(path.join(dir, 'sends'), 'utf8'), 'send\n');
}));
