import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifySource } from '../scripts/verify-source.mjs';

test('new evidence binds to current source bytes and cannot silently use an old producer', () => {
    const bytes = readFileSync(new URL('../src/memory.js', import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual(verifySource('src/memory.js', hash), bytes);
    assert.throws(() => verifySource('src/memory.js', '0'.repeat(64)), /Historical runs require their archived producer/);
    assert.throws(() => verifySource('src/memory.js', 'not-a-hash'), /Source hash required/);
});
