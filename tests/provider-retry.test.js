import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { NATURAL_RETRY, retryDelay, requestWithRetry } from '../scripts/provider-retry.mjs';
const response = (status, retryAfter) => new Response('{}', { status, headers: retryAfter ? { 'retry-after': retryAfter } : {} });
function options(send, extras = {}) { return { body: '{"model":"fixed","messages":[{"content":"same prompt"}]}', send, budget: { calls: 0, retries: 0 }, attempts: [], wait: async () => {}, random: () => 0, ...extras }; }

test('bridge retries HTTP 500 with identical body and retains both provider attempts', async () => {
    const bodies = [];
    const server = createServer(async (req, res) => {
        let body = ''; for await (const part of req) body += part;
        bodies.push(body); res.writeHead(bodies.length === 1 ? 500 : 200, { 'x-request-id': `request-${bodies.length}` }); res.end('{}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const input = options((body, signal) => fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', body, signal }));
        const result = await requestWithRetry(input); await result.text();
        assert.equal(result.status, 200); assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
        assert.deepEqual(input.attempts.map(a => a.status), [500, 200]);
        assert.equal(input.attempts[0].requestSha256, input.attempts[1].requestSha256);
        assert.equal(input.attempts[0].requestId, 'request-1'); assert.equal(input.attempts[0].retryWaitMs, 15000);
        assert.deepEqual(input.budget, { calls: 2, retries: 1 });
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('sample and run retry bounds stop repeated 5xx failures', async () => {
    let input = options(async () => response(503));
    assert.equal((await requestWithRetry(input)).status, 503);
    assert.equal(input.attempts.length, 3); assert.equal(input.budget.retries, 2);
    assert.deepEqual(input.attempts.slice(0, 2).map(a => a.retryWaitMs), [15000, 30000]);
    input = options(async () => response(500), { budget: { calls: 50, retries: 8 } });
    assert.equal((await requestWithRetry(input)).status, 500); assert.equal(input.attempts.length, 1);
    input = options(async () => { throw Error('Must not call'); }, { budget: { calls: 72, retries: 8 } });
    await assert.rejects(requestWithRetry(input), /call bound/); assert.equal(input.attempts.length, 0);
});

test('4xx, success, network errors and cancellation never trigger automatic retry', async () => {
    for (const status of [200, 400, 401, 403, 429]) {
        const input = options(async () => response(status));
        assert.equal((await requestWithRetry(input)).status, status); assert.equal(input.attempts.length, 1);
    }
    const input = options(async () => { throw Error('synthetic connection error'); });
    await assert.rejects(requestWithRetry(input)); assert.equal(input.attempts.length, 1); assert.equal(input.attempts[0].failure, 'transport-error');
    const controller = new AbortController();
    const canceled = options(async () => response(500), { signal: controller.signal, wait: async () => { controller.abort(); } });
    await assert.rejects(requestWithRetry(canceled)); assert.equal(canceled.attempts.length, 1);
});

test('Retry-After is respected; excessive waits and elapsed deadlines do not cause early retries', async () => {
    assert.equal(retryDelay('25', 1, () => 0), 25000);
    assert.equal(retryDelay('Thu, 01 Jan 1970 00:00:40 GMT', 1, () => 0, () => 0), 40000);
    assert.equal(retryDelay('invalid', 2, () => 0.5), 30500);
    const input = options(async () => response(503, '61'));
    assert.equal((await requestWithRetry(input)).status, 503); assert.equal(input.attempts.length, 1);
    let time = 0;
    const deadline = options(async () => { time = NATURAL_RETRY.sampleDeadlineMs - 1000; return response(500); }, { now: () => time });
    assert.equal((await requestWithRetry(deadline)).status, 500); assert.equal(deadline.attempts.length, 1);
});
