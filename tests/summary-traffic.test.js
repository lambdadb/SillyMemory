import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSummaryTrafficGuard, validateSummaryTraffic, summaryTrafficFile } from '../scripts/summary-traffic.mjs';

function setup() {
    const embeddings = [], vectorQueries = [], violations = [];
    const guard = createSummaryTrafficGuard({ embeddings, vectorQueries,
        stage: () => 'summary/test', onViolation: reason => violations.push(reason) });
    return { guard, embeddings, vectorQueries, violations };
}

test('summary bridge records and blocks attempted embeddings before forwarding', async t => {
    const { guard, embeddings, violations } = setup();
    let forwarded = 0;
    const server = createServer((req, res) => {
        if (guard.blockBridgeRequest(req, res)) return;
        forwarded++;
        res.writeHead(204).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/v1/embeddings', '/v1/embeddings/?key=private-value']) {
        const response = await fetch(base + path, { method: 'POST',
            headers: { Authorization: 'Bearer private-value' }, body: '{"input":"private-value"}' });
        assert.equal(response.status, 403);
        await response.text();
    }
    assert.equal(forwarded, 0);
    assert.equal(embeddings.length, 2);
    assert.equal(violations.length, 2);
    assert(!JSON.stringify(embeddings).includes('private-value'));
    assert.throws(() => guard.assertClean(), /Unexpected embedding\/vector traffic/);
    assert.equal((await fetch(base + '/v1/models')).status, 204);
    assert.equal(forwarded, 1);
});

test('summary native routes record query and indexing attempts without forwarding', async () => {
    const { guard, vectorQueries, violations } = setup();
    let pattern, handler;
    assert.equal(guard.observation().nativeVectorRoutes, false);
    await guard.installVectorRoutes({ route: async (match, callback) => { pattern = match; handler = callback; } });
    assert.equal(guard.observation().nativeVectorRoutes, true);
    guard.assertClean();
    for (const path of ['/api/vector/query', '/api/vector/insert?key=private-value']) {
        const url = `http://localhost${path}`;
        assert(pattern.test(url));
        let response;
        await handler({
            request: () => ({ url: () => url, method: () => 'POST' }),
            fulfill: async value => { response = value; },
            fetch: () => assert.fail('Unexpected upstream request'),
            continue: () => assert.fail('Unexpected upstream request'),
        });
        assert.equal(response.status, 403);
    }
    assert.equal(vectorQueries.length, 2);
    assert.equal(violations.length, 2);
    assert(!JSON.stringify(vectorQueries).includes('private-value'));
    assert.throws(() => guard.assertClean());
    assert(!pattern.test('http://localhost/api/backends/chat-completions/generate'));
});

test('empty arrays require active collectors and cannot upgrade historical evidence', async () => {
    const { guard } = setup();
    const digest = file => createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex');
    const report = { embeddings: [], vectorQueries: [], sourceSha256: {
        'scripts/generation-smoke.mjs': digest('scripts/generation-smoke.mjs'),
        [summaryTrafficFile]: digest(summaryTrafficFile),
    } };
    assert.throws(() => validateSummaryTraffic(report), /instrumented/);
    report.nativeTrafficObservation = guard.observation();
    assert.throws(() => validateSummaryTraffic(report), /instrumented/);
    await guard.installVectorRoutes({ route: async () => {} });
    report.nativeTrafficObservation = guard.observation();
    assert.equal(validateSummaryTraffic(report).verified, true);
    for (const field of ['embeddings', 'vectorQueries']) {
        const attempted = structuredClone(report);
        attempted[field].push({ status: 404 });
        assert.throws(() => validateSummaryTraffic(attempted));
    }
    const old = JSON.parse(readFileSync(new URL('../docs/results/summarize-v2-raw.json', import.meta.url)));
    assert.deepEqual(validateSummaryTraffic(old), { verified: false, coverage: 'unobserved-historical' });
    old.nativeTrafficObservation = guard.observation();
    assert.throws(() => validateSummaryTraffic(old), /Historical producers/);
});
