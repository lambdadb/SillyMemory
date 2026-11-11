// Minimal LambdaDB REST client for the experiment: request-rate limiting under the
// project's 5 rps bucket, bounded 429 retries, an operation budget and sanitized
// receipts (no keys; upsert bodies are summarized, not stored).
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export class Lambda {
    #key;
    constructor(env, { receipts, maxOperations, rps = 4 }) {
        for (const key of ['LAMBDADB_BASE_URL', 'LAMBDADB_PROJECT_NAME', 'LAMBDADB_PROJECT_API_KEY']) assert(env[key]?.trim(), `Missing ${key}`);
        this.base = `${new URL(env.LAMBDADB_BASE_URL).origin}/projects/${encodeURIComponent(env.LAMBDADB_PROJECT_NAME)}`;
        this.#key = env.LAMBDADB_PROJECT_API_KEY.trim();
        this.receipts = receipts; this.maxOperations = maxOperations; this.interval = 1000 / rps;
        this.operations = 0; this.next = 0; this.bytesSent = 0; this.retries429 = 0; this.byKind = {};
    }
    async #slot() {
        const now = Date.now(), at = Math.max(now, this.next);
        this.next = at + this.interval;
        if (at > now) await new Promise(r => setTimeout(r, at - now));
    }
    async request(method, pathname, body, { kind = 'other', reserve = false, expect = [200, 201, 202] } = {}) {
        const text = body === undefined ? undefined : JSON.stringify(body);
        for (let attempt = 1; ; attempt++) {
            assert(this.operations < this.maxOperations - (reserve ? 0 : 100), 'LambdaDB operation budget exceeded');
            await this.#slot();
            this.operations++; this.byKind[kind] = (this.byKind[kind] || 0) + 1;
            if (text) this.bytesSent += Buffer.byteLength(text);
            const started = performance.now();
            let status = 0, raw = '';
            try {
                const response = await fetch(this.base + pathname, { method, body: text, redirect: 'error',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': this.#key }, signal: AbortSignal.timeout(180000) });
                status = response.status; raw = await response.text();
                const retryAfter = Number(response.headers.get('retry-after'));
                await this.#receipt({ method, pathname, kind, attempt, status, ms: performance.now() - started,
                    requestBytes: text ? Buffer.byteLength(text) : 0, requestSha256: text ? createHash('sha256').update(text).digest('hex') : null,
                    request: kind === 'upsert' ? undefined : body, responseBytes: raw.length,
                    response: kind === 'query' || status >= 400 || kind === 'fetch-vectors' ? undefined : raw.slice(0, 2000),
                    error: status >= 400 ? raw.slice(0, 2000) : undefined });
                if (status === 429 && attempt < 4) {
                    this.retries429++;
                    await new Promise(r => setTimeout(r, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : attempt) * 1000));
                    continue;
                }
                const parsed = raw ? JSON.parse(raw) : {};
                if (!expect.includes(status)) { const e = new Error(`LambdaDB HTTP ${status} ${method} ${kind}`); e.status = status; e.body = raw.slice(0, 2000); throw e; }
                return parsed;
            } catch (error) {
                if (error.status === undefined && !status) {
                    await this.#receipt({ method, pathname, kind, attempt, status: 0, ms: performance.now() - started, error: 'transport' });
                }
                throw error;
            }
        }
    }
    async #receipt(value) {
        let line = JSON.stringify({ at: new Date().toISOString(), ...value });
        if (line.includes(this.#key)) line = line.replaceAll(this.#key, '[redacted]');
        await appendFile(this.receipts, line + '\n');
    }
    create(name, indexConfigs, tags) {
        return this.request('POST', '/collections', { collectionName: name, indexConfigs, description: 'SillyMemory text-private retrieval experiment', tags, snapshotRetentionInDays: 1 }, { kind: 'create' });
    }
    get(name) { return this.request('GET', `/collections/${name}`, undefined, { kind: 'get', reserve: true, expect: [200] }); }
    upsert(name, docs) { return this.request('POST', `/collections/${name}/docs/upsert`, { docs, branch: 'main' }, { kind: 'upsert' }); }
    fetch(name, ids, includeVectors = false) {
        return this.request('POST', `/collections/${name}/docs/fetch`, { ids, ref: { kind: 'branch', name: 'main' }, consistentRead: true, includeVectors },
            { kind: includeVectors ? 'fetch-vectors' : 'fetch', expect: [200] });
    }
    query(name, body) {
        return this.request('POST', `/collections/${name}/query`, { consistentRead: true, includeVectors: false, ref: { kind: 'branch', name: 'main' }, ...body }, { kind: 'query', expect: [200] });
    }
    // Ownership-checked delete with absence confirmation (HTTP 404).
    async deleteOwned(name, tags) {
        let current;
        try { current = await this.get(name); } catch (e) { if (e.status === 404) return { absent404: true, alreadyAbsent: true }; throw e; }
        for (const [k, v] of Object.entries(tags)) assert.equal(current.collection?.tags?.[k], v, 'Ownership check failed');
        await this.request('DELETE', `/collections/${name}`, undefined, { kind: 'delete', reserve: true, expect: [200, 202, 204, 404] });
        for (let i = 0; i < 30; i++) {
            try { await this.get(name); } catch (e) { if (e.status === 404) return { absent404: true }; throw e; }
            await new Promise(r => setTimeout(r, 1000));
        }
        throw new Error(`Deletion of ${name} not confirmed`);
    }
    async listCollections() {
        const all = []; let token;
        do {
            const page = await this.request('GET', `/collections?size=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, undefined, { kind: 'list', reserve: true, expect: [200] });
            all.push(...page.collections); token = page.nextPageToken;
        } while (token);
        return all;
    }
}
