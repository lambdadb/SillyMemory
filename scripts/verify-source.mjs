import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// New runs bind to this checkout. Revalidate old runs with their archived producer.
export function verifySource(file, expectedHash) {
    assert(/^[a-f0-9]{64}$/.test(expectedHash), 'Source hash required');
    const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash,
        `Source mismatch: ${file}. Historical runs require their archived producer.`);
    return bytes;
}
