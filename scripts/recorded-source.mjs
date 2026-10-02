import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Exact historical producer snapshots, not a bypass for changed/unknown inputs.
// The runtime adapter changed after these cohorts; do not relabel their evidence.
const snapshots = {
    ...JSON.parse(readFileSync(new URL('../tests/fixtures/live-pilot-producers/registry.json', import.meta.url))),
    ...JSON.parse(readFileSync(new URL('../tests/fixtures/pre-summarize-producers/registry.json', import.meta.url))),
    ...JSON.parse(readFileSync(new URL('../tests/fixtures/native-tuning-producers/registry.json', import.meta.url))),
    'scripts/three-mode-results.mjs:57ab34c8233ff2a2b4159fcd2831f896a5869e8c6fcfb7a824ea19a1863e5ff7': 'tests/fixtures/three-mode-results-producer-v1.txt',
    ...JSON.parse(readFileSync(new URL('../tests/fixtures/pre-three-mode-producers/registry.json', import.meta.url))),
    ...JSON.parse(readFileSync(new URL('../tests/fixtures/recall-pilot-producers/registry.json', import.meta.url))),
    'scripts/semantic-long.mjs:3e063de5f400d3c6dd4b010d6751385a3b2fb42d45b89a656fc204d00cc355a5': 'tests/fixtures/semantic-long-before-recall-guide-v1.txt',
    'scripts/semantic-long.mjs:cf00bafebe290bc7d96524a50f72b9c0b7b30649bba54bee6b813374fb66502a': 'tests/fixtures/semantic-long-before-packing-v1.txt',
    'src/memory.js:f88515cf16bf8344961591d8b1b2a2ba1804fdd43ff667fb8c3896fa42af792c': 'tests/fixtures/memory-before-packing-v1.txt',
    'index.js:e02dbd971a7864a58bbb87394b29391bb05ac6f10073668cd4da30c90cb7f301': 'tests/fixtures/index-before-delivery-v1.txt',
    'scripts/semantic-results.mjs:a28b5ecafcd8b0b9a0bac385a36cb9bb21e6da66db224295e2b8edb30e203edd': 'tests/fixtures/semantic-results-direct-v1.txt',
};
export function recordedSource(file, expectedHash) {
    assert(/^[a-f0-9]{64}$/.test(expectedHash), 'Recorded source hash required');
    let bytes = readFileSync(new URL(`../${snapshots[`${file}:${expectedHash}`] || file}`, import.meta.url));
    // Resolve pre-collection runtime evidence from its immutable Git revision,
    // rather than copying another historical implementation into CI fixtures.
    if (!snapshots[`${file}:${expectedHash}`] && createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
        bytes = execFileSync('git', ['show', `8e38ea73527682375fdd4fe594f760d2534c9a76:${file}`], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] });
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash, `Recorded source mismatch: ${file}`);
    return bytes;
}
