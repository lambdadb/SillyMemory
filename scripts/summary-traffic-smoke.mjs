// Local fault injection only: no provider keys, embeddings or model generation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createSummaryTrafficGuard } from './summary-traffic.mjs';

const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-summary-traffic-'));
const embeddings = [], vectorQueries = [], failures = [];
const guard = createSummaryTrafficGuard({ embeddings, vectorQueries,
    stage: () => 'fault-injection', onViolation: reason => failures.push(reason) });
let browser, host, unexpectedForwarding = 0;
const bridge = createServer((req, res) => {
    if (guard.blockBridgeRequest(req, res)) return;
    unexpectedForwarding++;
    res.writeHead(404).end();
});
try {
    bridge.listen(0, '127.0.0.1');
    await once(bridge, 'listening');
    const portProbe = createServer();
    portProbe.listen(0, '127.0.0.1');
    await once(portProbe, 'listening');
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const config = path.join(work, 'config.yaml');
    await writeFile(config, await readFile(path.join(source, 'default/config.yaml')));
    host = spawn(process.execPath, ['server.js', '--configPath', config,
        '--dataRoot', path.join(work, 'data'), '--port', String(port),
        '--listen', 'false', '--browserLaunchEnabled', 'false'], { cwd: source, stdio: 'ignore' });
    const url = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 90; i++) {
        assert.equal(host.exitCode, null, 'Host exited before startup');
        try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, 'Host startup timeout');
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === url
        ? route.continue() : route.abort());
    await guard.installVectorRoutes(page);
    await page.goto(url);
    guard.assertClean();
    const statuses = await page.evaluate(async () => {
        const results = [];
        for (const pathname of ['/api/vector/query', '/api/vector/insert']) {
            results.push((await fetch(pathname, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
        }
        return results;
    });
    assert.deepEqual(statuses, [403, 403]);
    const response = await fetch(`http://127.0.0.1:${bridge.address().port}/v1/embeddings`,
        { method: 'POST', body: '{"input":"synthetic fault"}' });
    assert.equal(response.status, 403);
    await response.text();
    assert.equal(embeddings.length, 1);
    assert.equal(vectorQueries.length, 2);
    assert.equal(failures.length, 3);
    assert.equal(unexpectedForwarding, 0);
    assert.throws(() => guard.assertClean());
    console.log(JSON.stringify({ passed: true, sillyTavern: revision,
        validation: 'local browser/bridge fault injection, not live generation',
        observation: guard.observation(), embeddings, vectorQueries,
        failureSignals: failures.length, unexpectedForwarding }, null, 2));
} finally {
    await browser?.close();
    if (host && host.exitCode === null) {
        const exited = once(host, 'exit');
        host.kill('SIGTERM');
        await exited;
    }
    await new Promise(resolve => bridge.close(resolve));
    await rm(work, { recursive: true, force: true });
}
