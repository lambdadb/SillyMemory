import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpacedSender, PROVIDER_SPACING, summarizeProviderSpacing } from '../scripts/provider-spacing.mjs';

test('unequal preparation times cannot shorten actual sends; early timers are rechecked', async () => {
    let time = 800, early = true;
    const starts = [], waits = [], attempts = [{}, {}, {}];
    const send = createSpacedSender(async () => { starts.push(time); return new Response('{}'); }, {
        now: () => time, wait: async ms => { waits.push(ms); time += early ? ms - 1 : ms; early = false; },
    });
    await send('on with slow retrieval', undefined, attempts[0]);
    time = 15010; // Next host generation starts at 15 s, retrieval is only 10 ms.
    await send('off with fast preparation', undefined, attempts[1]);
    time = 33000; await send('later prompt', undefined, attempts[2]);
    assert.deepEqual(starts, [800, 15800, 33000]);
    assert.deepEqual(waits, [790, 1]);
    assert.equal(attempts[1].spacingWaitMs, 790);
    assert.equal(summarizeProviderSpacing([{ attempts }], PROVIDER_SPACING).verified, true);
});

test('concurrent bridge requests are spaced and canceled waits do not reserve a send', async () => {
    let time = 0;
    const controller = new AbortController(), attempts = [{}, {}, {}, {}];
    const send = createSpacedSender(async () => new Response('{}'), {
        now: () => time, wait: async (ms, signal) => {
            if (signal) { controller.abort(); signal.throwIfAborted(); }
            time += ms;
        },
    });
    await send('first', undefined, attempts[0]);
    await assert.rejects(send('canceled', controller.signal, attempts[1]), { name: 'AbortError' });
    assert.equal(attempts[1].upstreamStartedMs, undefined);
    await Promise.all([send('second', undefined, attempts[2]), send('third', undefined, attempts[3])]);
    assert.deepEqual([attempts[0], attempts[2], attempts[3]].map(a => a.upstreamStartedMs), [0, 15000, 30000]);
});

test('spacing evidence rejects short retry gaps, missing timestamps and unknown policies', () => {
    const generations = [{ attempts: [{ upstreamStartedMs: 0, spacingWaitMs: 0 }, { upstreamStartedMs: 15000, spacingWaitMs: 0 }] }, { attempts: [{ upstreamStartedMs: 30000, spacingWaitMs: 15000 }] }];
    assert.equal(summarizeProviderSpacing(generations, PROVIDER_SPACING).minimumObservedIntervalMs, 15000);
    for (const mutate of [g => { g[0].attempts[1].upstreamStartedMs = 14999; }, g => { delete g[1].attempts[0].upstreamStartedMs; }, g => { g[1].attempts[0].spacingWaitMs = -1; }]) {
        const changed = structuredClone(generations); mutate(changed);
        assert.throws(() => summarizeProviderSpacing(changed, PROVIDER_SPACING));
    }
    assert.throws(() => summarizeProviderSpacing(generations, { ...PROVIDER_SPACING, minimumIntervalMs: 1 }));
    const legacy = summarizeProviderSpacing([{ startedAt: 0 }, { startedAt: 14222 }]);
    assert.equal(legacy.verified, false); assert.equal(legacy.minimumObservedIntervalMs, 14222); assert.equal(legacy.gapsBelowMinimum, 1);
});
