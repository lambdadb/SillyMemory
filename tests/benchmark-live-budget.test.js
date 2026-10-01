import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudget, LIMITS } from '../scripts/benchmark-live-budget.mjs';
test('completion reservations charge failed attempts too and reject before overspending', () => {
    const b = createBudget();
    for (let i = 0; i < LIMITS.completions; i++) b.completion('gpt-4.1-mini-2025-04-14');
    const before = structuredClone(b.state);
    assert.throws(() => b.completion('gpt-4.1-mini-2025-04-14'), /completions/);
    assert.deepEqual(b.state, before); assert(b.state.openaiReservedUsd < 3);
    assert.throws(() => b.completion('unpinned'), /Unpinned/);
});
test('embedding and managed limits cannot be bypassed by one oversized batch', () => {
    const b = createBudget();
    b.embedding(1, 999999);
    assert.throws(() => b.embedding(1, 2), /embeddingTokens/);
    assert.equal(b.state.embeddingCalls, 1);
    for (let i = 0; i < LIMITS.collections; i++) b.lambda({ create: true });
    assert.throws(() => b.lambda({ create: true }), /collections/);
    assert.throws(() => b.lambda({ documents: 3001 }), /lambdaDocuments/);
    assert.equal(b.state.lambdaRequests, LIMITS.collections);
    assert.throws(() => b.lambda({ tokens: -1 }));
});

test('live host network guard blocks unlisted HTTP, HTTPS and fetch while allowing loopback', async () => {
    const { execFileSync } = await import('node:child_process');
    const preload = new URL('../scripts/benchmark-live-network.cjs', import.meta.url).pathname;
    execFileSync(process.execPath, ['--require', preload, '--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import http from 'node:http'; import https from 'node:https';
        assert.throws(() => http.get('http://example.invalid'), /allowlist/);
        assert.throws(() => https.get('https://example.invalid'), /allowlist/);
        await assert.rejects(fetch('https://example.invalid'), e => /allowlist/.test(e.cause?.message));
        const server = http.createServer((req,res) => res.end('allowed'));
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        assert.equal(await (await fetch('http://127.0.0.1:' + server.address().port)).text(), 'allowed');
        assert.equal(await (await fetch('http://localhost:' + server.address().port)).text(), 'allowed');
        await new Promise(r => server.close(r));
    `], { env: { ...process.env, BENCHMARK_LAMBDA_HOST: 'allowed.invalid' }, stdio: 'pipe' });
});
