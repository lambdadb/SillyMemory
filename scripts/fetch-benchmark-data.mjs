// Fetch only pinned public data; never read .env or send provider credentials.
import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function fetchVerifiedFile(file, directory, fetcher = fetch) {
    assert.equal(path.basename(file.localName), file.localName);
    assert(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 300_000_000);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const url = new URL(file.url);
    assert.equal(url.origin, 'https://huggingface.co');
    assert.match(url.pathname, /^\/datasets\/[^/]+\/[^/]+\/resolve\/[a-f0-9]{40}\//);
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, file.localName);
    const existing = await stat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (existing) {
        assert.equal(existing.size, file.bytes, 'Existing cache size mismatch');
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(target)) hash.update(chunk);
        assert.equal(hash.digest('hex'), file.sha256, 'Existing cache checksum mismatch');
        return 'verified-cache';
    }
    const temporary = await mkdtemp(path.join(directory, '.download-'));
    try {
        const response = await fetcher(file.url, { signal: AbortSignal.timeout(120000) });
        assert(response.ok && response.body, `Dataset HTTP ${response.status}`);
        const hash = createHash('sha256'); let received = 0;
        const meter = new Transform({ transform(chunk, encoding, done) {
            received += chunk.length;
            if (received > file.bytes) return done(new Error('Dataset exceeds locked byte count'));
            hash.update(chunk); done(null, chunk);
        } });
        const partial = path.join(temporary, 'payload');
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, { flags: 'wx' }));
        assert.equal(received, file.bytes, 'Dataset size mismatch');
        assert.equal(hash.digest('hex'), file.sha256, 'Dataset checksum mismatch');
        await rename(partial, target);
        return 'downloaded';
    } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [directory] = process.argv.slice(2);
    assert(directory && process.argv.length === 3, 'Usage: fetch-benchmark-data.mjs <cache>');
    const lock = JSON.parse(await readFile(new URL('../docs/benchmarks/sources-v1.json', import.meta.url)));
    assert.equal(lock.version, 'external-benchmark-sources-v1');
    assert(lock.files.length <= 20 && lock.files.reduce((n,f) => n+f.bytes,0) <= 600_000_000);
    for (const file of lock.files) console.log(`${await fetchVerifiedFile(file, directory)} ${file.localName}`);
}
