import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Exact historical producer snapshots, not a bypass for changed/unknown inputs.
// The runtime adapter changed after these cohorts; do not relabel their evidence.
const snapshots = {
    'index.js:e02dbd971a7864a58bbb87394b29391bb05ac6f10073668cd4da30c90cb7f301': 'tests/fixtures/index-before-delivery-v1.txt',
    'scripts/semantic-results.mjs:a28b5ecafcd8b0b9a0bac385a36cb9bb21e6da66db224295e2b8edb30e203edd': 'tests/fixtures/semantic-results-direct-v1.txt',
};
export function recordedSource(file, expectedHash) {
    assert(/^[a-f0-9]{64}$/.test(expectedHash), 'Recorded source hash required');
    const bytes = readFileSync(new URL(`../${snapshots[`${file}:${expectedHash}`] || file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash, `Recorded source mismatch: ${file}`);
    return bytes;
}
