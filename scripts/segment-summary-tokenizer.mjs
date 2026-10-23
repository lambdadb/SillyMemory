// Bind the exact JS/WASM implementation used for experiment limits and reservations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export async function loadSummaryTokenizer(require) {
    const entry = require.resolve('tiktoken'), root = path.dirname(entry);
    assert.equal(path.basename(entry), 'tiktoken.cjs', 'Expected the pinned Node tokenizer entry');
    const files = await Promise.all(['package.json', 'tiktoken.cjs', 'tiktoken_bg.cjs', 'tiktoken_bg.wasm'].map(async name => ({ name, bytes: await readFile(path.join(root, name)) })));
    const pkg = JSON.parse(files[0].bytes);
    assert.equal(pkg.name, 'tiktoken'); assert.equal(pkg.version, '1.0.22', 'Unsupported tokenizer version');
    const identity = { name: pkg.name, version: pkg.version, encoding: 'o200k_base',
        files: files.map(({ name, bytes }) => ({ name, sha256: createHash('sha256').update(bytes).digest('hex') })) };
    const encoder = require('tiktoken').get_encoding(identity.encoding);
    return { identity, count: text => encoder.encode(text, [], []).length, free: () => encoder.free() };
}

// Bind the complete maintained producer, including its shared input adapter.
export async function summaryProducerDigest() {
    const sources = ['segment-summary.mjs', 'segment-summary-eval.mjs',
        'segment-summary-tokenizer.mjs', 'benchmark-checkpoint.mjs',
        '../benchmark/shared/longmemeval-input.mjs'];
    const bytes = await Promise.all(sources.map(file => readFile(new URL(file, import.meta.url))));
    return createHash('sha256').update(Buffer.concat(bytes)).digest('hex');
}
