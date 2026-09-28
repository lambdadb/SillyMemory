import test from 'node:test';
import assert from 'node:assert/strict';
import { faultController } from '../scripts/fault-scenarios.mjs';
for (const mode of ['hold-before', 'hold']) {
    test(`crash injection distinguishes ${mode} acceptance and never duplicates a write on release`, async () => {
        const faults = faultController(), pending = faults.arm('upsert', mode);
        let applied = 0, response;
        const request = faults.respond('upsert', () => { applied++; return [200, {}]; }, (...args) => { response = args; });
        await pending.entered;
        assert.equal(applied, mode === 'hold' ? 1 : 0);
        assert.equal(response, undefined);
        pending.release(); await request;
        assert.equal(applied, mode === 'hold' ? 1 : 0);
        assert.equal(response[0], mode === 'hold' ? 200 : 503);
    });
}
