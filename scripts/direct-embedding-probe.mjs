// Explicit, bounded diagnostic. Never part of the browser extension runtime.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const protocol = Object.freeze({
    version: 'direct-embedding-probe-v1', endpoint: 'https://api.openai.com/v1/embeddings',
    model: 'text-embedding-3-small', encoding_format: 'float',
    input: ['Synthetic diagnostic: the blue compass is under the cedar tree.'],
    samples: 10, concurrency: 1, intervalMs: 15000, timeoutMs: 45000, retries: 0,
});
export function inspectEmbedding(body) {
    assert.equal(body.model, protocol.model, 'Unexpected embedding model');
    assert(Array.isArray(body.data) && body.data.length === protocol.input.length, 'Unexpected vector count');
    body.data.forEach((item, index) => {
        assert.equal(item.index, index, 'Unexpected response index');
        assert(Array.isArray(item.embedding) && item.embedding.length === 1536, 'Unexpected dimensions');
        assert(item.embedding.every(Number.isFinite), 'Non-finite embedding');
    });
    assert(Number.isInteger(body.usage?.prompt_tokens) && body.usage.prompt_tokens >= 0);
    assert(Number.isInteger(body.usage?.total_tokens) && body.usage.total_tokens >= body.usage.prompt_tokens);
    return { vectors: body.data.length, dimensions: 1536, usage: { prompt_tokens: body.usage.prompt_tokens, total_tokens: body.usage.total_tokens } };
}
const hash = value => createHash('sha256').update(value).digest('hex');
export async function runProbe(output) {
    assert(output && process.env.SM_ENV_FILE, 'Usage: SM_ENV_FILE=/existing/.env.local node scripts/direct-embedding-probe.mjs new-report.json');
    const env = parseEnv(readFileSync(process.env.SM_ENV_FILE, 'utf8'));
    assert(env.LLM_BASE_URL === 'https://api.openai.com/v1' && env.LLM_API_KEY, 'Configured direct OpenAI key required');
    const body = JSON.stringify({ model: protocol.model, encoding_format: protocol.encoding_format, input: protocol.input });
    const report = { startedAt: new Date().toISOString(), protocol, requestSha256: hash(body), scriptSha256: hash(readFileSync(new URL(import.meta.url))), credentialSource: 'Existing LLM_API_KEY in ignored environment file; no organization/project override', managedCredentialEquality: 'unverified', transport: 'Local Node fetch directly to OpenAI; no SillyTavern, LambdaDB, or SDK retry', rows: [], complete: false };
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    const save = () => {
        const text = JSON.stringify(report, null, 2) + '\n';
        assert(!text.includes(env.LLM_API_KEY), 'Credential redaction guard');
        writeFileSync(output + '.tmp', text); renameSync(output + '.tmp', output);
    };
    let lastStart = -Infinity;
    for (let i = 0; i < protocol.samples; i++) {
        while (performance.now() - lastStart < protocol.intervalMs) await delay(protocol.intervalMs - (performance.now() - lastStart));
        const start = performance.now(); lastStart = start;
        const row = { sample: i + 1, startedAt: new Date().toISOString(), startedMs: start, status: null, valid: false };
        report.rows.push(row); save();
        try {
            const response = await fetch(protocol.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(protocol.timeoutMs), redirect: 'error' });
            row.headersMs = performance.now() - start; row.status = response.status;
            const requestId = response.headers.get('x-request-id');
            if (requestId && /^[a-zA-Z0-9_-]{1,160}$/.test(requestId)) row.requestId = requestId;
            const processing = response.headers.get('openai-processing-ms');
            if (processing !== null && /^\d+(\.\d+)?$/.test(processing)) row.providerProcessingMs = Number(processing);
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter !== null && /^\d+(\.\d+)?$/.test(retryAfter)) row.retryAfterSeconds = Number(retryAfter);
            if (!response.ok) { row.error = 'http'; await response.body?.cancel(); }
            else {
                const payload = await response.json();
                try { Object.assign(row, inspectEmbedding(payload), { valid: true }); }
                catch { row.error = 'invalid-response'; }
            }
        } catch (error) { row.error = error?.name === 'TimeoutError' ? 'timeout' : 'network-or-body'; }
        row.elapsedMs = performance.now() - start; save();
        console.log(JSON.stringify({ sample: row.sample, status: row.status, elapsedMs: Math.round(row.elapsedMs), valid: row.valid, error: row.error }));
        // Do not repeat rejected credentials or throttled/billing calls in a diagnostic.
        if ([400, 401, 403, 404, 429].includes(row.status)) { report.stopReason = `http-${row.status}`; break; }
    }
    report.complete = report.rows.length === protocol.samples && report.rows.every(r => Number.isFinite(r.elapsedMs));
    report.passed = report.complete && report.rows.every(row => row.valid);
    report.finishedAt = new Date().toISOString(); save();
    return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    assert.equal(process.argv.length, 3);
    const result = await runProbe(process.argv[2]); process.exitCode = result.passed ? 0 : 1;
}
