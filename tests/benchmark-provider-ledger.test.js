import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { openProviderLedger, LEDGER_POLICY } from '../scripts/benchmark-provider-ledger.mjs';
const plan = JSON.parse(await readFile(new URL('../docs/benchmarks/development-plan-v1.json', import.meta.url)));
const tasks = mode => plan.tasks.filter(t => !t.reusePilot && t.mode === mode);
const off = tasks('off')[0], vector = tasks('vectors')[0], summary = tasks('summary')[0];
const body = (kind = 'answer') => ({ model: (kind === 'judge' ? plan.judge : plan.generator).model,
    messages: [{ role: 'user', content: 'public benchmark fixture' }], temperature: 0,
    max_tokens: kind === 'judge' ? 10 : 1024, stream: false });
const embeddingBody = () => ({ model: plan.arms.vectors.embeddingModel, input: ['public fixture'] });
const answer = () => ({ choices: [{ finish_reason: 'stop', message: { content: 'original answer' } }],
    usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 } });
const embedding = () => ({ data: [{ index: 0, embedding: Array(1536).fill(.1) }], usage: { total_tokens: 10 } });
const response = (value = answer(), status = 200, headers) => new Response(JSON.stringify(value), { status, headers });
async function fixture(run) {
    const dir = await mkdtemp(path.join(tmpdir(), 'sm-provider-ledger-'));
    const clock = { time: 0, now() { return this.time; }, async wait(ms) { this.time += ms; } };
    const opened = new Set();
    const open = async (send = async () => response(), limits = {}, options = {}) => {
        const ledger = await openProviderLedger(dir, { ...plan, limits: { ...plan.limits, ...limits } }, {
            binding: { producers: 'fixture' }, send, countTokens: text => text.length,
            now: () => clock.now(), wait: ms => clock.wait(ms), random: () => 0, ...options,
        });
        opened.add(ledger);
        const close = ledger.close;
        ledger.close = async () => { await close(); opened.delete(ledger); };
        return ledger;
    };
    try { await run({ dir, open, clock }); }
    finally { for (const ledger of opened) await ledger.close(); await rm(dir, { recursive: true, force: true }); }
}
test('completed answers are durable before downstream assertions and reused after reopen', () => fixture(async ({ open, dir }) => {
    let calls = 0, ledger = await open(async () => { calls++; return response(); });
    const first = await ledger.invoke(off.id, 'answer', 0, body());
    assert.equal(first.reused, false);
    assert.throws(() => { throw new Error('downstream observation failed'); });
    const used = ledger.state.used;
    await ledger.close();
    ledger = await open(async () => { calls++; throw new Error('must not send'); });
    const replay = await ledger.invoke(off.id, 'answer', 0, body());
    assert.equal(replay.reused, true); assert.deepEqual(replay.result, first.result);
    assert.equal(calls, 1); assert.deepEqual(ledger.state.used, used);
    const raw = JSON.parse(await readFile(path.join(dir, ledger.state.calls[`provider/${off.id}/answer/0/0`].receipt)));
    assert.deepEqual(JSON.parse(raw.text), answer());
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, { ...body(), messages: [{ role: 'user', content: 'changed' }] }), /request changed/);
}));
test('500 retries preserve every receipt, charge every attempt and replay without dispatch', () => fixture(async ({ open, clock, dir }) => {
    const sent = []; let ledger = await open(async ({ body }) => {
        sent.push({ at: clock.time, body }); return sent.length === 1 ? response({ error: 'fixture' }, 500) : response();
    });
    const result = await ledger.invoke(off.id, 'answer', 0, body());
    assert.deepEqual(result.attempts.map(x => x.status), [500, 200]);
    assert.deepEqual(sent[0].body, sent[1].body); assert.equal(sent[1].at - sent[0].at, 15000);
    assert.equal(ledger.state.used.completionAttempts, 2); assert.equal(ledger.state.used.extraAttempts, 1);
    const raw = JSON.parse(await readFile(path.join(dir, ledger.state.calls[result.attempts[0].id].receipt)));
    assert.equal(raw.text, JSON.stringify({ error: 'fixture' }));
    await ledger.close(); ledger = await open(async () => { throw new Error('must not send'); });
    assert.equal((await ledger.invoke(off.id, 'answer', 0, body())).reused, true);
    assert.equal(ledger.state.used.completionAttempts, 2);
}));
for (const status of [401, 429]) test(`HTTP ${status} is retained without retry even after reopen`, () => fixture(async ({ open }) => {
    let calls = 0, ledger = await open(async () => { calls++; return response({ error: 'fixture' }, status); });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), new RegExp(`HTTP ${status}`));
    await ledger.close(); ledger = await open(async () => { calls++; return response(); });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1);
}));
for (const invalid of ['malformed', 'truncated', 'over-usage']) test(`invalid HTTP 200 (${invalid}) is retained and never regenerated`, () => fixture(async ({ open, dir }) => {
    const value = answer();
    if (invalid === 'truncated') value.choices[0].finish_reason = 'length';
    if (invalid === 'over-usage') value.usage.prompt_tokens = off.context + 1;
    let calls = 0, ledger = await open(async () => { calls++; return invalid === 'malformed' ? new Response('{') : response(value); });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()));
    const entry = ledger.state.calls[`provider/${off.id}/answer/0/0`]; assert.equal(entry.status, 'complete');
    assert((await readFile(path.join(dir, entry.receipt))).length > 0);
    await ledger.close(); ledger = await open(async () => { calls++; return response(); });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body())); assert.equal(calls, 1);
}));
test('unknown send and partial response delivery stop later paid work across reopen', () => fixture(async ({ open }) => {
    let calls = 0, ledger = await open(async () => { calls++; return { text: async () => { throw new Error('body connection dropped'); } }; });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /Uncertain provider delivery/);
    assert.equal(ledger.state.used.completionAttempts, 1);
    await ledger.close(); ledger = await open(async () => { calls++; return response(); });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /Uncertain/);
    await assert.rejects(ledger.invoke(off.id, 'judge', 0, body('judge')), /Uncertain/);
    await assert.rejects(ledger.invoke(vector.id, 'embedding', 0, embeddingBody()), /Uncertain/);
    assert.equal(calls, 1); assert.equal(ledger.state.used.completionAttempts, 1);
}));
test('task, model, option and summary bounds reject before spending', () => fixture(async ({ open }) => {
    let calls = 0; const ledger = await open(async () => { calls++; return response(); });
    const invalid = [
        [plan.tasks.find(t => t.reusePilot).id, 'answer', 0, body()],
        ['held-out-case', 'answer', 0, body()], [off.id, 'answer', 1, body()],
        [off.id, 'summary', 0, body()],
        [summary.id, 'summary', plan.cases.find(c => c.id === summary.caseId).automaticSummaryCallCap, body()],
        [off.id, 'answer', 0, { ...body(), model: 'other' }],
        [off.id, 'answer', 0, { ...body(), n: 2 }],
        [off.id, 'answer', 0, { ...body(), max_tokens: 2048 }],
        [off.id, 'answer', 0, { ...body(), messages: [{ role: 'user', content: 'x'.repeat(off.context) }] }],
        [off.id, 'embedding', 0, embeddingBody()],
        [vector.id, 'embedding', 0, { ...embeddingBody(), input: Array(11).fill('text') }],
        [vector.id, 'embedding', 0, { ...embeddingBody(), input: ['x'.repeat(8192)] }],
        [vector.id, 'embedding', 0, { ...embeddingBody(), dimensions: 256 }],
    ];
    for (const args of invalid) assert.throws(() => ledger.invoke(...args));
    assert.equal(calls, 0); assert.deepEqual(ledger.state.used, {});
}));
test('native embeddings survive reopen and malformed vectors cannot silently trigger another call', () => fixture(async ({ open }) => {
    let calls = 0, ledger = await open(async () => { calls++; return response(embedding()); });
    await ledger.invoke(vector.id, 'embedding', 0, embeddingBody());
    assert.equal(ledger.state.used.nativeEmbeddingCalls, 1);
    assert.equal(ledger.state.used.nativeEmbeddingInputs, 1);
    assert.equal(ledger.state.used.nativeEmbeddingTokens, 'public fixture'.length + 8);
    await ledger.close(); ledger = await open(async () => { calls++; return response({ ...embedding(), data: [] }); });
    assert.equal((await ledger.invoke(vector.id, 'embedding', 0, embeddingBody())).reused, true);
    await assert.rejects(ledger.invoke(vector.id, 'embedding', 1, embeddingBody()));
    await assert.rejects(ledger.invoke(vector.id, 'embedding', 1, embeddingBody()));
    assert.equal(calls, 2);
}));
test('aggregate completion cap persists and overspend is rejected before upstream', () => fixture(async ({ open }) => {
    let calls = 0, ledger = await open(async () => { calls++; return response(); }, { completionAttempts: 1 });
    await ledger.invoke(off.id, 'answer', 0, body()); await ledger.close();
    ledger = await open(async () => { calls++; return response(); }, { completionAttempts: 1 });
    await assert.rejects(ledger.invoke(off.id, 'judge', 0, body('judge')), /budget exceeded/);
    assert.equal(calls, 1); assert.equal(ledger.state.used.completionAttempts, 1);
}));
test('32K, 128K and judge attempts reserve context-based upper cost, not observed output', () => fixture(async ({ open }) => {
    const ledger = await open(), small = tasks('off').find(t => t.context === 32768), large = tasks('off').find(t => t.context === 131072);
    await ledger.invoke(small.id, 'answer', 0, body());
    await ledger.invoke(large.id, 'answer', 0, body());
    await ledger.invoke(large.id, 'judge', 0, body('judge'));
    const expected = ((32768 + 131072) * .4 + 2 * 1024 * 1.6 + 4096 * 2.5 + 10 * 10) / 1e6;
    assert(Math.abs(ledger.state.used.openaiUsd - expected) < 1e-12);
}));
test('concurrent completions are spaced and identical calls coalesce without caller mutation', () => fixture(async ({ open, clock }) => {
    const sent = [], ledger = await open(async ({ body }) => { sent.push({ at: clock.time, body }); return response(); });
    const supplied = body(), first = ledger.invoke(off.id, 'answer', 0, supplied);
    const duplicate = ledger.invoke(off.id, 'answer', 0, body());
    assert.equal(first, duplicate); supplied.messages[0].content = 'caller mutation';
    assert.throws(() => ledger.invoke(off.id, 'answer', 0, supplied), /Concurrent logical request changed/);
    await Promise.all([first, duplicate, ledger.invoke(off.id, 'judge', 0, body('judge'))]);
    assert.equal(sent.length, 2); assert(sent[1].at - sent[0].at >= 15000);
    assert.equal(sent[0].body.messages[0].content, 'public benchmark fixture');
}));
test('six-hour bound includes downtime but permits reading already completed receipts', () => fixture(async ({ open, clock }) => {
    let ledger = await open(); await ledger.invoke(off.id, 'answer', 0, body()); await ledger.close();
    clock.time = LEDGER_POLICY.durationMs + 1; ledger = await open();
    assert.equal((await ledger.invoke(off.id, 'answer', 0, body())).reused, true);
    await assert.rejects(ledger.invoke(off.id, 'judge', 0, body('judge')), /window expired/);
    assert.equal(ledger.state.used.completionAttempts, 1);
}));
test('restart does not restart a failed logical request deadline', () => fixture(async ({ open, clock }) => {
    let ledger = await open(async () => response({}, 500, { 'retry-after': '61' }));
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /delay exceeds/); await ledger.close();
    clock.time += LEDGER_POLICY.requestDeadlineMs; ledger = await open();
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /delay exceeds|deadline exceeded/);
    assert.equal(ledger.state.used.completionAttempts, 1);
}));
test('frozen workload and spending ceilings cannot be raised', () => fixture(async ({ dir }) => {
    const options = { send: async () => response(), countTokens: text => text.length };
    await assert.rejects(openProviderLedger(dir, { ...plan, generator: { ...plan.generator, model: 'other' } }, options), /Frozen workload/);
    await assert.rejects(openProviderLedger(dir, { ...plan, limits: { ...plan.limits, openaiUsd: 14 } }, options), /frozen ceiling/);
    assert.deepEqual(await readdir(dir), []);
}));
test('loopback HTTP retry and resume retain bodies without persisting authentication', () => fixture(async ({ open, dir }) => {
    let calls = 0; const requests = [], secret = 'synthetic-transport-secret';
    const server = createServer(async (req, res) => {
        calls++; assert.equal(req.headers.authorization, `Bearer ${secret}`);
        let text = ''; for await (const chunk of req) text += chunk;
        requests.push(JSON.parse(text)); res.writeHead(calls === 1 ? 503 : 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(calls === 1 ? { error: 'temporary fixture error' } : answer()));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const send = ({ body, signal }) => fetch(`http://127.0.0.1:${server.address().port}`, {
            method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body), signal,
        });
        let ledger = await open(send); await ledger.invoke(off.id, 'answer', 0, body()); await ledger.close();
        ledger = await open(send); assert.equal((await ledger.invoke(off.id, 'answer', 0, body())).reused, true);
        assert.equal(calls, 2); assert.deepEqual(requests[0], requests[1]);
        for (const name of await readdir(dir)) assert(!(await readFile(path.join(dir, name), 'utf8')).includes(secret));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
test('known retry response survives interrupted backoff, but downtime consumes its deadline', () => fixture(async ({ open, clock }) => {
    let calls = 0, waits = 0;
    let ledger = await open(async () => { calls++; return response({}, 500); }, {}, {
        wait: async ms => { if (++waits === 2) throw new Error('stopped during backoff'); await clock.wait(ms); },
    });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /stopped during backoff/);
    assert.equal(ledger.state.used.completionAttempts, 1); await ledger.close();
    clock.time += LEDGER_POLICY.requestDeadlineMs;
    ledger = await open(async () => { calls++; return response(); });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /deadline exceeded/);
    assert.equal(calls, 1);
}));
test('successful recovery from interrupted backoff charges only the new retry', () => fixture(async ({ open, clock }) => {
    let calls = 0, waits = 0;
    let ledger = await open(async () => { calls++; return response({}, 502); }, {}, {
        wait: async ms => { if (++waits === 2) throw new Error('stop'); await clock.wait(ms); },
    });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /stop/); await ledger.close();
    ledger = await open(async () => { calls++; return response(); });
    const replay = await ledger.invoke(off.id, 'answer', 0, body());
    assert.deepEqual(replay.attempts.map(x => x.reused), [true, false]);
    assert.equal(calls, 2); assert.equal(ledger.state.used.extraAttempts, 1);
}));
test('three attempts and the persistent extra-attempt ceiling bound repeated server failures', () => fixture(async ({ open }) => {
    let calls = 0; const ledger = await open(async () => { calls++; return response({}, 504); }, { extraAttempts: 2 });
    await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /HTTP 504/);
    assert.equal(calls, 3);
    await assert.rejects(ledger.invoke(off.id, 'judge', 0, body('judge')), /budget exceeded: extraAttempts/);
    assert.equal(calls, 4); assert.equal(ledger.state.used.extraAttempts, 2);
    assert.equal(ledger.state.used.completionAttempts, 4);
}));
for (const [limit, kind] of [['openaiUsd', 'answer'], ['nativeEmbeddingCalls', 'embedding'],
    ['nativeEmbeddingInputs', 'embedding'], ['nativeEmbeddingTokens', 'embedding']]) {
    test(`zero ${limit} budget prevents sending and does not partially charge other counters`, () => fixture(async ({ open }) => {
        let calls = 0; const ledger = await open(async () => { calls++; return response(); }, { [limit]: 0 });
        await assert.rejects(ledger.invoke(kind === 'answer' ? off.id : vector.id, kind, 0, kind === 'answer' ? body() : embeddingBody()), /budget exceeded/);
        assert.equal(calls, 0); assert.deepEqual(ledger.state.used, {});
    }));
}
test('loopback partial response leaves uncertain delivery and blocks a later request', () => fixture(async ({ open }) => {
    let calls = 0;
    const server = createServer((req, res) => {
        calls++; res.writeHead(200, { 'content-type': 'application/json', 'content-length': '500' });
        res.write('{"choices":'); setTimeout(() => res.destroy(), 10);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const ledger = await open(({ signal }) => fetch(`http://127.0.0.1:${server.address().port}`, { signal }));
        await assert.rejects(ledger.invoke(off.id, 'answer', 0, body()), /Uncertain provider delivery/);
        await assert.rejects(ledger.invoke(off.id, 'judge', 0, body('judge')), /Uncertain/);
        assert.equal(calls, 1); assert.equal(ledger.state.calls[`provider/${off.id}/answer/0/0`].status, 'pending');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
test('fresh process starts completion spacing conservatively after reopen', () => fixture(async ({ open, clock }) => {
    let ledger = await open(); await ledger.invoke(off.id, 'answer', 0, body()); await ledger.close();
    const reopenedAt = clock.time; let dispatchedAt;
    ledger = await open(async () => { dispatchedAt = clock.time; return response(); });
    await ledger.invoke(off.id, 'judge', 0, body('judge'));
    assert(dispatchedAt - reopenedAt >= LEDGER_POLICY.completionIntervalMs);
}));
test('a separate Node process reuses the original provider receipt after downstream failure', () => fixture(async ({ dir }) => {
    const { execFileSync } = await import('node:child_process');
    const ledgerUrl = new URL('../scripts/benchmark-provider-ledger.mjs', import.meta.url).href;
    const planUrl = new URL('../docs/benchmarks/development-plan-v1.json', import.meta.url).href;
    const script = `import { openProviderLedger } from ${JSON.stringify(ledgerUrl)};
        import { readFile, appendFile } from 'node:fs/promises';
        const plan = JSON.parse(await readFile(new URL(${JSON.stringify(planUrl)})));
        let time = 0;
        const ledger = await openProviderLedger(process.argv[1], plan, {
            binding: { fixture: 'process-reopen' }, now: () => time, wait: async ms => { time += ms; },
            countTokens: text => text.length,
            send: async () => { await appendFile(process.argv[1] + '/sends', 'send\\n');
                return new Response(JSON.stringify(${JSON.stringify(answer())})); },
        });
        try {
            const result = await ledger.invoke(${JSON.stringify(off.id)}, 'answer', 0, ${JSON.stringify(body())});
            if (process.argv[2] === 'fail') throw new Error('downstream failure');
            console.log(JSON.stringify({ reused: result.reused, answer: result.result.choices[0].message.content }));
        } catch { process.exitCode = 7; } finally { await ledger.close(); }`;
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', script, dir, 'fail'], { stdio: 'pipe' }), e => e.status === 7);
    const recovered = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, dir, 'resume'], { encoding: 'utf8' }));
    assert.deepEqual(recovered, { reused: true, answer: 'original answer' });
    assert.equal(await readFile(path.join(dir, 'sends'), 'utf8'), 'send\n');
}));
test('closed instances cannot dispatch without a writer lock and active requests prevent close', () => fixture(async ({ open }) => {
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const pause = new Promise(resolve => { release = resolve; });
    const ledger = await open(async () => { entered(); await pause; return response(); });
    const call = ledger.invoke(off.id, 'answer', 0, body()); await started;
    await assert.rejects(ledger.close(), /active provider requests/);
    release(); await call; await ledger.close();
    assert.throws(() => ledger.invoke(off.id, 'judge', 0, body('judge')), /ledger is closed/);
    await ledger.close();
}));
