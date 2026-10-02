// Keys live only in this instance. Never include server response bodies in errors.
export class ConnectionError extends Error {
    constructor(message, status = 0, code = '') { super(message); this.name = 'ConnectionError'; this.status = status; this.code = code; }
}

export function connectionConfig(input) {
    let url;
    try { url = new URL(input.endpoint); } catch { throw new ConnectionError('Enter the regional HTTPS endpoint from your LambdaDB project.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/?$/.test(url.pathname)) {
        throw new ConnectionError('Endpoint must be an HTTPS origin, without credentials, path, query, or fragment.');
    }
    if (!/^[a-zA-Z0-9_-]{3,63}$/.test(input.project)) throw new ConnectionError('Enter a valid project name.');
    return { endpoint: url.origin, project: input.project };
}

export const schema = Object.freeze({
    text: { type: 'text', analyzers: ['english', 'korean'] },
    embedding: { type: 'vector', managedEmbedding: true, embedding: { provider: 'openai', model: 'text-embedding-3-small', sourceField: 'text' } },
    owner: { type: 'keyword' }, scope: { type: 'keyword' }, revision: { type: 'keyword' },
});

export function scopeFilter(owner, scope) {
    if (![owner, scope].every(x => /^[a-f0-9]+$/.test(x))) throw new ConnectionError('Invalid memory identity.');
    return { queryString: { query: `owner:${owner} AND scope:${scope}` } };
}

export class LambdaClient {
    #key;
    constructor(config, key, { fetcher = (...args) => globalThis.fetch(...args), headers = () => ({}), timeoutMs = 15000 } = {}) {
        this.config = connectionConfig(config);
        this.#key = key.trim();
        if (!this.#key) throw new ConnectionError('Enter your API key again. Keys are cleared on reload.');
        this.fetcher = fetcher; this.headers = headers; this.timeoutMs = timeoutMs;
    }
    forget() { this.#key = ''; }
    async request(path, { method = 'POST', body, signal } = {}) {
        if (!this.#key) throw new ConnectionError('Enter your API key again. Keys are cleared on reload.');
        const target = `${this.config.endpoint}/projects/${encodeURIComponent(this.config.project)}${path}`;
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const failure = () => signal?.aborted
            ? new ConnectionError('Memory request canceled.', 0, 'canceled')
            : timeout.aborted
                ? new ConnectionError('Memory request timed out.', 0, 'timeout')
                : new ConnectionError('Memory request failed. Check the server and network.', 0, 'network');
        let response;
        try {
            response = await this.fetcher(`/proxy/${encodeURIComponent(target)}`, {
                method, credentials: 'same-origin', redirect: 'error',
                headers: { ...this.headers(), 'Content-Type': 'application/json', 'x-api-key': this.#key },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            });
        } catch {
            throw failure();
        }
        if (!response.ok) {
            // Pinned SillyTavern rewrites upstream 401 to 400 Unauthorized to
            // avoid resetting its own HTTP Basic authentication.
            const status = response.status === 400 && response.statusText.toLowerCase() === 'unauthorized' ? 401 : response.status;
            if (status === 404) {
                // A disabled host proxy also returns 404. It must never count as
                // confirmed collection deletion. Inspect only its fixed marker.
                let body;
                try { body = await response.text(); } catch { throw failure(); }
                if (body.includes('CORS proxy is disabled')) throw new ConnectionError('CORS proxy is disabled. Set enableCorsProxy: true and restart SillyTavern.');
            }
            const messages = {
                400: 'Invalid request or authentication failure. Check configuration and re-enter your project key.',
                401: 'Authentication failed. Re-enter your project API key.',
                403: 'Access denied. Check your project key and SillyTavern proxy protections.',
                404: 'Resource or proxy unavailable. Check endpoint/project, enableCorsProxy: true, and restart SillyTavern.',
                409: 'Collection already exists. Do not adopt an unrelated collection.',
                429: 'LambdaDB is busy or over its request limit. Retry later.',
            };
            throw new ConnectionError(messages[status] || `Memory service returned HTTP ${status}.`, status);
        }
        if (response.status === 204) return {};
        try { return await response.json(); } catch {
            if (signal?.aborted || timeout.aborted) throw failure();
            throw new ConnectionError('Memory service returned an invalid JSON response.');
        }
    }
    path(collection, suffix = '') {
        if (!/^[a-zA-Z0-9_-]{3,52}$/.test(collection)) throw new ConnectionError('Invalid collection name.');
        return `/collections/${collection}${suffix}`;
    }
    create(collection, owner, scope) {
        return this.request('/collections', { body: { collectionName: collection, indexConfigs: schema, description: 'SillyMemory owned memory', tags: { application: 'sillymemory', owner, ...(scope ? { chat: scope } : {}) }, snapshotRetentionInDays: 1 } });
    }
    get(collection, signal) { return this.request(this.path(collection), { method: 'GET', signal }); }
    async assertOwned(collection, owner, signal, scope) {
        const result = await this.get(collection, signal);
        if (result.collection?.tags?.application !== 'sillymemory' || result.collection?.tags?.owner !== owner || (scope && result.collection?.tags?.chat !== scope)) throw new ConnectionError('Ownership check failed. No remote data was deleted or written.');
    }
    upsert(collection, docs, signal) { return this.request(this.path(collection, '/docs/upsert'), { body: { docs, branch: 'main' }, signal }); }
    deleteIds(collection, ids, signal) { return this.request(this.path(collection, '/docs/delete'), { body: { ids, branch: 'main' }, signal }); }
    async deleteOwnedCollection(collection, owner, scope) {
        try { await this.assertOwned(collection, owner, undefined, scope); } catch (e) { if (e.status === 404) return; throw e; }
        await this.request(this.path(collection), { method: 'DELETE' });
        // A deletion acknowledgement is not proof of physical erasure/backups.
        for (let i = 0; i < 15; i++) {
            try { await this.get(collection); } catch (e) { if (e.status === 404) return; throw e; }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new ConnectionError('Deletion accepted, but collection disappearance is not yet confirmed. Retry cleanup.');
    }
    async listOwned(owner) {
        const collections = [], tokens = new Set(); let token;
        do {
            const params = new URLSearchParams({ size: '100' });
            if (token) params.set('pageToken', token);
            const result = await this.request(`/collections?${params}`, { method: 'GET' });
            if (!Array.isArray(result.collections)) throw new ConnectionError('Invalid collection listing. Cleanup was not completed.');
            for (const c of result.collections) if (c.tags?.application === 'sillymemory' && c.tags?.owner === owner) {
                this.path(c.collectionName); collections.push(c);
            }
            token = result.nextPageToken;
            if (token && (typeof token !== 'string' || tokens.has(token))) throw new ConnectionError('Invalid collection pagination. Cleanup was not completed.');
            if (token) tokens.add(token);
        } while (token);
        return collections;
    }
    async query(collection, query, { signal, size = 30 } = {}) {
        const result = await this.request(this.path(collection, '/query'), { body: { query, size, consistentRead: true, ref: { kind: 'branch', name: 'main' }, includeVectors: false }, signal });
        // Never forward a project key to a presigned download URL. Fail safely for now.
        if (result.isDocsInline === false) throw new ConnectionError('Result requires external download. Reduce the retrieval size; no memory was injected.');
        if (!Array.isArray(result.docs)) throw new ConnectionError('Invalid memory query response.');
        return result.docs.map(x => x.doc);
    }
    search(collection, owner, scope, text, signal) {
        return this.query(collection, { knn: { field: 'embedding', queryText: text, k: 30, filter: scopeFilter(owner, scope) } }, { signal });
    }
}
