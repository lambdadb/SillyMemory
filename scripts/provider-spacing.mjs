// Test-only generation transport: space sends, not host prompt preparation.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export const PROVIDER_SPACING = Object.freeze({ version: 'provider-start-spacing-v1', minimumIntervalMs: 15000 });

export function createSpacedSender(send, { intervalMs = PROVIDER_SPACING.minimumIntervalMs, now = () => performance.now(), wait = (ms, signal) => delay(ms, undefined, { signal }) } = {}) {
    let lastStarted = -Infinity, tail = Promise.resolve();
    return (body, signal, attempt) => {
        const queuedAt = now();
        const dispatch = tail.then(async () => {
            signal?.throwIfAborted();
            // Recheck after waking: timers can fire early. Serialize dispatch even
            // if two host requests arrive together, without waiting for responses.
            while (now() - lastStarted < intervalMs) {
                await wait(intervalMs - (now() - lastStarted), signal);
                signal?.throwIfAborted();
            }
            lastStarted = now();
            attempt.upstreamStartedMs = lastStarted;
            attempt.spacingWaitMs = lastStarted - queuedAt;
            return { response: send(body, signal) };
        });
        tail = dispatch.then(() => {}, () => {});
        return dispatch.then(({ response }) => response);
    };
}

export function summarizeProviderSpacing(generations, protocol) {
    if (protocol == null) {
        const starts = generations.map(g => g.startedAt);
        const gaps = starts.slice(1).map((start, i) => start - starts[i]);
        const available = starts.length > 1 && starts.every(Number.isFinite);
        return { verified: false, evidence: 'legacy bridge-entry timestamps, not upstream sends', minimumIntervalMs: PROVIDER_SPACING.minimumIntervalMs, minimumObservedIntervalMs: available ? Math.min(...gaps) : null, gapsBelowMinimum: available ? gaps.filter(gap => gap < PROVIDER_SPACING.minimumIntervalMs).length : null };
    }
    assert.deepEqual(protocol, PROVIDER_SPACING, 'Unknown provider spacing protocol');
    const attempts = generations.flatMap(g => g.attempts);
    assert(attempts.length > 0, 'Missing provider spacing evidence');
    for (const attempt of attempts) {
        assert(Number.isFinite(attempt.upstreamStartedMs) && attempt.upstreamStartedMs >= 0, 'Missing upstream start time');
        assert(Number.isFinite(attempt.spacingWaitMs) && attempt.spacingWaitMs >= 0, 'Missing provider spacing wait');
    }
    // Sort real dispatch times because overlapping requests can interleave retries.
    const starts = attempts.map(a => a.upstreamStartedMs).sort((a, b) => a - b);
    const gaps = starts.slice(1).map((start, i) => start - starts[i]);
    assert(gaps.every(gap => gap >= protocol.minimumIntervalMs), 'Provider attempts started less than 15 seconds apart');
    return { verified: true, evidence: 'monotonic upstream-send timestamps', minimumIntervalMs: protocol.minimumIntervalMs, minimumObservedIntervalMs: gaps.length ? Math.min(...gaps) : null, gapsBelowMinimum: 0 };
}
