// Temporary Node-only experiment adapter. Never imported by the product runtime.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { schema } from '../src/client.js';
import { buildLongPlan, pinnedCounter, sha } from './semantic-long.mjs';

export const directProtocol = Object.freeze({
    version: 'semantic-direct-v1', model: 'text-embedding-3-small', dimensions: 1536,
    encoding_format: 'float', similarity: 'cosine', requestDeadlineMs: 15000,
    maxInputs: 50, maxCalls: 400, embeddingRetries: 0, cache: false,
    batching: 'one embedding call per actual runtime upsert batch; one per queryText',
    concurrency: 'unchanged runtime scheduling; no extra queue or parallelization',
});
export const directFiles = ['scripts/semantic-direct.mjs', 'docs/semantic-direct-evaluation.md'];
const extraHashes = () => Object.fromEntries(directFiles.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))]));
export function buildDirectPlan(count) {
    return { ...buildLongPlan(count), embeddingMode: 'direct-experimental', directProtocol, directSourceSha256: extraHashes() };
}
export function verifyDirectPlan(filename) {
    assert(filename, 'Frozen direct experiment plan required');
    const bytes = readFileSync(filename), plan = JSON.parse(bytes), counter = pinnedCounter(process.env.ST_SOURCE);
    try { assert.deepEqual(plan, buildDirectPlan(counter.count), 'Frozen direct plan or sources changed'); }
    finally { counter.close(); }
    return { plan, sha256: sha(bytes) };
}

export function inspectVectors(payload, count) {
    assert.equal(payload.model, directProtocol.model);
    assert.equal(payload.data?.length, count);
    const vectors = Array(count), seen = new Set();
    for (const item of payload.data) {
        assert(Number.isInteger(item.index) && item.index >= 0 && item.index < count && !seen.has(item.index));
        seen.add(item.index);
        assert(Array.isArray(item.embedding) && item.embedding.length === directProtocol.dimensions && item.embedding.every(Number.isFinite));
        vectors[item.index] = item.embedding;
    }
    return vectors;
}

export function createDirectAdapter({ key, fetcher = fetch, rows, stage = () => '' }) {
    let calls = 0;
    async function embed(input, signal, record) {
        assert(++calls <= directProtocol.maxCalls, 'Direct embedding call bound exceeded');
        assert(input.length > 0 && input.length <= directProtocol.maxInputs && input.every(s => typeof s === 'string' && s.length > 0 && s.length <= 10000), 'Invalid direct embedding batch');
        signal.throwIfAborted();
        const body = JSON.stringify({ model: directProtocol.model, dimensions: directProtocol.dimensions, encoding_format: directProtocol.encoding_format, input });
        Object.assign(record, { call: calls, inputCount: input.length, inputSha256: sha(JSON.stringify(input)), requestSha256: sha(body), startedAt: new Date().toISOString() });
        const started = performance.now();
        try {
            const response = await fetcher('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body, signal, redirect: 'error' });
            record.providerStatus = response.status;
            const id = response.headers.get('x-request-id');
            if (id && /^[a-zA-Z0-9_-]{1,160}$/.test(id)) record.providerRequestId = id;
            if (!response.ok) { await response.body?.cancel(); throw new Error('Embedding provider rejected request'); }
            const payload = await response.json(), vectors = inspectVectors(payload, input.length);
            signal.throwIfAborted();
            if (Number.isInteger(payload.usage?.prompt_tokens) && Number.isInteger(payload.usage?.total_tokens)) record.usage = { prompt_tokens: payload.usage.prompt_tokens, total_tokens: payload.usage.total_tokens };
            record.valid = true;
            return vectors;
        } catch { record.error = signal.aborted ? 'canceled-or-deadline' : 'provider-or-invalid-response'; throw new Error('Temporary embedding adapter failed'); }
        finally { record.embeddingMs = performance.now() - started; }
    }
    return async function transform(path, body, { signal, requestIndex } = {}) {
        if (!body) return body;
        const output = structuredClone(body);
        if (path.endsWith('/collections')) {
            assert.deepEqual(body.indexConfigs, schema, 'Unexpected collection schema');
            output.indexConfigs.embedding = { type: 'vector', dimensions: 1536, similarity: 'cosine' };
            return output;
        }
        const upsert = path.endsWith('/docs/upsert');
        const knn = path.endsWith('/query') ? body.query?.knn : null;
        if (!upsert && !knn) return output;
        if (knn) assert(knn.field === 'embedding' && typeof knn.queryText === 'string' && !knn.queryVector, 'Unexpected vector query');
        if (upsert) assert(Array.isArray(body.docs) && body.docs.every(doc => !Object.hasOwn(doc, 'embedding')), 'Unexpected vector write');
        const record = { requestIndex, stage: stage(), kind: upsert ? 'upsert' : 'query', originalBodySha256: sha(JSON.stringify(body)) };
        rows.push(record);
        if (upsert) record.documentIds = body.docs.map(doc => doc.id);
        const vectors = await embed(upsert ? body.docs.map(doc => doc.text) : [knn.queryText], signal, record);
        if (upsert) output.docs.forEach((doc, i) => { doc.embedding = vectors[i]; });
        else { delete output.query.knn.queryText; output.query.knn.queryVector = vectors[0]; }
        // Prove that only the representation of the embedding was changed.
        const restored = structuredClone(output);
        if (upsert) restored.docs.forEach(doc => { delete doc.embedding; });
        else { delete restored.query.knn.queryVector; restored.query.knn.queryText = knn.queryText; }
        assert.deepEqual(restored, body);
        record.preserved = true;
        return output;
    };
}

export function verifyDirectEvidence(report) {
    assert.equal(report.embeddingMode, 'direct-experimental');
    assert.deepEqual(report.directProtocol, directProtocol);
    for (const file of directFiles) {
        assert.equal(report.initialSourceSha256[file], sha(readFileSync(new URL(`../${file}`, import.meta.url))));
        assert.equal(report.sourceSha256[file], report.initialSourceSha256[file]);
    }
    assert(report.directEmbeddings.length > 0 && report.directEmbeddings.length <= directProtocol.maxCalls);
    for (const row of report.directEmbeddings) {
        assert(row.valid && row.preserved && !row.error && row.providerStatus === 200);
        assert(row.inputCount > 0 && row.inputCount <= 50);
        const request = report.lambdaRequests[row.requestIndex];
        assert(request && request.status >= 200 && request.status < 300 && !request.failed);
        assert(Number.isFinite(request.elapsedMs) && request.elapsedMs < directProtocol.requestDeadlineMs);
        assert(Number.isFinite(request.databaseMs) && request.databaseMs >= 0);
        assert(row.embeddingMs <= request.elapsedMs);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    assert(process.argv.length === 3, 'Usage: ST_SOURCE=/pinned/host node scripts/semantic-direct.mjs new-plan.json');
    const counter = pinnedCounter(process.env.ST_SOURCE);
    try { const plan = buildDirectPlan(counter.count); writeFileSync(process.argv[2], JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output: process.argv[2], samples: plan.schedule.length, mode: plan.embeddingMode })); }
    finally { counter.close(); }
}
