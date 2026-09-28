// Test-bridge transport policy only. Never retries a successful model answer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
export const NATURAL_RETRY = Object.freeze({
    version: 'natural-transport-retry-v1', statuses: Object.freeze([500, 502, 503, 504]),
    maxRetriesPerSample: 2, maxRetriesPerRun: 8, maxCalls: 72,
    baseDelayMs: 15000, jitterMs: 1000, maxDelayMs: 60000,
    attemptTimeoutMs: 90000, sampleDeadlineMs: 180000,
});
export function retryDelay(header, attempt, random = Math.random, wallNow = Date.now) {
    const numeric = header === null || header.trim() === '' ? NaN : Number(header);
    const hint = Number.isFinite(numeric) && numeric >= 0 ? numeric * 1000 : header ? Date.parse(header) - wallNow() : NaN;
    return Math.max(NATURAL_RETRY.baseDelayMs * 2 ** (attempt - 1), Number.isFinite(hint) ? hint : 0) + Math.floor(random() * NATURAL_RETRY.jitterMs);
}
export async function requestWithRetry({ body, send, budget, attempts, signal, checkpoint = async () => {}, wait = (ms, signal) => delay(ms, undefined, { signal }), now = () => performance.now(), random = Math.random, wallNow = Date.now }) {
    assert(typeof body === 'string', 'Retry requires one immutable serialized request');
    const requestSha256 = createHash('sha256').update(body).digest('hex'), started = now();
    for (let index = 0; ; index++) {
        signal?.throwIfAborted();
        assert(budget.calls < NATURAL_RETRY.maxCalls, 'Generation call bound exceeded');
        if (index) { assert(budget.retries < NATURAL_RETRY.maxRetriesPerRun, 'Retry run bound exceeded'); budget.retries++; }
        const remaining = NATURAL_RETRY.sampleDeadlineMs - (now() - started);
        assert(remaining > 0, 'Sample transport deadline exceeded');
        const entry = { number: index + 1, requestSha256, status: null }; attempts.push(entry); budget.calls++;
        const attemptStarted = now(); let response;
        try {
            const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(remaining, NATURAL_RETRY.attemptTimeoutMs))));
            response = await send(body, signal ? AbortSignal.any([signal, timeout]) : timeout);
            entry.status = response.status; entry.requestId = response.headers.get('x-request-id');
        } catch (error) {
            entry.failure = signal?.aborted ? 'canceled' : 'transport-error';
            throw error; // Unknown delivery/partial output is not retried.
        } finally { entry.elapsedMs = now() - attemptStarted; await checkpoint(); }
        if (!NATURAL_RETRY.statuses.includes(response.status) || index >= NATURAL_RETRY.maxRetriesPerSample || budget.retries >= NATURAL_RETRY.maxRetriesPerRun) return response;
        const waitMs = retryDelay(response.headers.get('retry-after'), index + 1, random, wallNow);
        if (waitMs > NATURAL_RETRY.maxDelayMs || now() - started + waitMs >= NATURAL_RETRY.sampleDeadlineMs) return response;
        await response.body?.cancel(); entry.retryWaitMs = waitMs; await checkpoint();
        await wait(waitMs, signal);
    }
}
