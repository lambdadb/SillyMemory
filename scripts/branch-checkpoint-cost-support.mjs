// Safety helpers for the disposable branch/checkpoint benchmark, not product code.
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';

export async function assertPortAvailable(port) {
    assert(Number.isSafeInteger(port) && port > 0 && port <= 65535, 'Invalid benchmark port');
    await new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
    });
}

export async function waitForOwnedHost(server, logFile, url) {
    let failure;
    server.on('error', error => { failure = error; });
    const alive = () => {
        if (failure) throw failure;
        assert(server.exitCode === null && server.signalCode === null, 'Disposable host exited before readiness');
    };
    const boundAddress = ` IPv4: ${new URL(url).host}`;
    for (let i = 0; i < 90; i++) {
        alive();
        // This fresh log is written only by the spawned child. The pinned host
        // prints this line after binding IPv4; an unrelated HTTP 200 is not proof.
        const log = stripVTControlCharacters(await readFile(logFile, 'utf8'));
        if (log.split('\n').some(line => line.includes('SillyTavern is listening on') && line.endsWith(boundAddress))) {
            alive();
            let ready = false;
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
                ready = response.ok; await response.body?.cancel();
            } catch {}
            alive();
            if (ready) return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Disposable host did not confirm its own IPv4 listener');
}

export async function cleanupOwnedCollections(client, entries) {
    const remaining = [], failures = [];
    for (const entry of entries) {
        try { await client.deleteOwnedCollection(entry.collection, entry.owner, entry.scope); }
        catch (error) { remaining.push(entry); failures.push({ collection: entry.collection, error }); }
    }
    return { remaining, failures };
}

export function instrumentEmbedding(original, inputLimit) {
    assert(Number.isSafeInteger(inputLimit) && inputLimit > 0, 'Invalid local embedding limit');
    const target = "const result = await pipe(text, { pooling: 'mean', normalize: true });";
    assert.equal(original.split(target).length, 2, 'Expected one pinned embedding call');
    return "import { appendFileSync } from 'node:fs';\nlet benchmarkEmbeddingInputs = 0;\n" + original.replace(target,
        `if (benchmarkEmbeddingInputs >= ${inputLimit}) throw new Error('Benchmark local embedding input limit exceeded');
    benchmarkEmbeddingInputs++;
    const started = performance.now(), cpu = process.cpuUsage();
    ${target}
    appendFileSync(process.env.SM_EMBED_METRICS, JSON.stringify({ milliseconds: performance.now() - started, cpu: process.cpuUsage(cpu), characters: text.length }) + '\\n');`);
}
