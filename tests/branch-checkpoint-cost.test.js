import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertPortAvailable, waitForOwnedHost, cleanupOwnedCollections } from '../scripts/branch-checkpoint-cost-support.mjs';

async function localServer(t) {
    let requests = 0;
    const server = createServer((_, response) => { requests++; response.end('existing host'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const port = server.address().port;
    return { port, url: `http://127.0.0.1:${port}`, requests: () => requests };
}
async function logFile(t, text) {
    const directory = await mkdtemp(path.join(tmpdir(), 'sm-benchmark-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'host.log');
    await writeFile(file, text);
    return file;
}

test('benchmark refuses an occupied port without sending HTTP requests', async t => {
    const host = await localServer(t);
    await assert.rejects(assertPortAvailable(host.port), { code: 'EADDRINUSE' });
    assert.equal(host.requests(), 0);
});

test('benchmark rejects an exited child instead of accepting another healthy host', async t => {
    const host = await localServer(t), file = await logFile(t, 'Starting disposable host\n');
    const child = spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: 'ignore' });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
    await assert.rejects(waitForOwnedHost(child, file, host.url), /Disposable host exited/);
    assert.equal(host.requests(), 0);
});

test('benchmark probes HTTP only after its child log confirms the exact IPv4 listener', async t => {
    const host = await localServer(t);
    const file = await logFile(t, `\u001b]2;SillyTavern WebServer\u001b\\SillyTavern is listening on\u001b[32m IPv4: 127.0.0.1:${host.port}\u001b[39m\n`);
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
    await waitForOwnedHost(child, file, host.url);
    assert.equal(host.requests(), 1);
});

test('benchmark cleanup attempts every owned collection and retains only failed entries', async () => {
    const entries = [1, 2, 3].map(n => ({ collection: `owned-${n}`, owner: `owner-${n}`, scope: `scope-${n}` }));
    const attempts = [];
    const result = await cleanupOwnedCollections({ deleteOwnedCollection: async (...args) => {
        attempts.push(args);
        if (args[0] !== 'owned-2') throw new Error('Synthetic deletion failure');
    } }, entries);
    assert.deepEqual(attempts, [['owned-1', 'owner-1', 'scope-1'], ['owned-2', 'owner-2', 'scope-2'], ['owned-3', 'owner-3', 'scope-3']]);
    assert.deepEqual(result.remaining, [entries[0], entries[2]]);
    assert.deepEqual(result.failures.map(x => x.collection), ['owned-1', 'owned-3']);
    assert.equal(entries.length, 3, 'Original ownership evidence remains intact');
});
