import { LambdaDBClient, HTTPClient } from '../vendor/lambdadb.js';

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
    #sdk;
    #session = new AbortController();
    constructor(config, key, { fetcher = (...args) => globalThis.fetch(...args), timeoutMs = 15000 } = {}) {
        this.config = connectionConfig(config);
        this.#key = key.trim();
        if (!this.#key) throw new ConnectionError('Enter your API key again. Keys are cleared on reload.');
        this.timeoutMs = timeoutMs;
        const base = `${this.config.endpoint}/projects/${encodeURIComponent(this.config.project)}/`;
        this.#sdk = new LambdaDBClient({
            baseUrl: this.config.endpoint, projectName: this.config.project,
            projectApiKey: async () => this.#key,
            retryConfig: { strategy: 'none' },
            // Explicitly suppress the SDK's environment-controlled debug logger.
            debugLogger: { log() {}, group() {}, groupEnd() {} },
            httpClient: new HTTPClient({ fetcher: async request => {
                if (!this.#key) throw new ConnectionError('Enter your API key again. Keys are cleared on reload.');
                if (!request.url.startsWith(base)) throw new ConnectionError('Unexpected memory service URL.');
                const body = request.body ? await request.text() : undefined;
                request.signal.throwIfAborted();
                // Keep host cookies/CSRF and SDK diagnostic headers off the wire.
                const response = await fetcher(request.url, {
                    method: request.method, body, signal: request.signal,
                    mode: 'cors', credentials: 'omit', redirect: 'error',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': this.#key },
                });
                if (!response.ok) throw httpError(response.status);
                // The SDK can leave a rejected metadata promise if body reading
                // fails after headers. Finish the JSON transport under the same
                // deadline here; SDK parsing/validation still owns the payload.
                const bytes = await response.arrayBuffer();
                request.signal.throwIfAborted();
                return new Response(bytes, { status: response.status, headers: response.headers });
            } }),
            transferClient: new HTTPClient({ fetcher: async () => {
                throw new ConnectionError('Result requires external download. Reduce the retrieval size; no memory was injected.');
            } }),
        });
    }
    forget() { this.#key = ''; this.#session.abort(); }
    async call(operation, signal) {
        if (!this.#key) throw new ConnectionError('Enter your API key again. Keys are cleared on reload.');
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const combined = AbortSignal.any([this.#session.signal, timeout, ...(signal ? [signal] : [])]);
        try {
            combined.throwIfAborted();
            return await operation(this.#sdk, { signal: combined, retries: { strategy: 'none' } });
        } catch (error) {
            if (signal?.aborted || this.#session.signal.aborted) throw new ConnectionError('Memory request canceled.', 0, 'canceled');
            if (timeout.aborted) throw new ConnectionError('Memory request timed out.', 0, 'timeout');
            // SDK errors may wrap transport errors. Never expose raw causes/bodies.
            let cause = error;
            for (let i = 0; cause && i < 8; i++, cause = cause.cause) if (cause instanceof ConnectionError) throw cause;
            if (['ResponseValidationError', 'SDKValidationError', 'InvalidRequestError'].includes(error?.name)) {
                throw new ConnectionError('Memory service request or response failed validation. No state was adopted.', 0, 'validation');
            }
            throw new ConnectionError('Memory request failed. Check the endpoint, network and LambdaDB CORS access for this page’s origin.', 0, 'network');
        }
    }
    path(collection, suffix = '') {
        if (!/^[a-zA-Z0-9_-]{3,52}$/.test(collection)) throw new ConnectionError('Invalid collection name.');
        return `/collections/${collection}${suffix}`;
    }
    create(collection, owner, scope) {
        this.path(collection);
        return this.call((sdk, opts) => sdk.createCollection({ collectionName: collection, indexConfigs: schema, description: 'SillyMemory owned memory', tags: { application: 'sillymemory', owner, ...(scope ? { chat: scope } : {}) }, snapshotRetentionInDays: 1 }, opts));
    }
    get(collection, signal) { this.path(collection); return this.call((sdk, opts) => sdk.collection(collection).get(opts), signal); }
    async assertOwned(collection, owner, signal, scope) {
        const result = await this.get(collection, signal);
        if (result.collection?.tags?.application !== 'sillymemory' || result.collection?.tags?.owner !== owner || (scope && result.collection?.tags?.chat !== scope)) throw new ConnectionError('Ownership check failed. No remote data was deleted or written.');
    }
    upsert(collection, docs, signal, branch = 'main') { this.path(collection); this.branchName(branch); return this.call((sdk, opts) => sdk.collection(collection).docs.upsert({ docs, branch }, opts), signal); }
    deleteIds(collection, ids, signal, branch = 'main') { this.path(collection); this.branchName(branch); return this.call((sdk, opts) => sdk.collection(collection).docs.delete({ ids, branch }, opts), signal); }
    branchName(name) {
        if (!/^[a-zA-Z0-9_-]{3,52}$/.test(name)) throw new ConnectionError('Invalid memory branch.');
        return name;
    }
    async branches(collection) {
        this.path(collection);
        const result = await this.call((sdk, opts) => sdk.collection(collection).branches.list(opts));
        if (!Array.isArray(result.branches)) throw new ConnectionError('Invalid memory branch list.');
        return result.branches;
    }
    createBranch(collection, branch, source = 'main') {
        this.path(collection); this.branchName(branch); this.branchName(source);
        return this.call((sdk, opts) => sdk.collection(collection).branches.create({ branchName: branch, source: { kind: 'branch', name: source } }, opts));
    }
    async deleteBranch(collection, branch) {
        if (branch === 'main') throw new ConnectionError('The default branch cannot be deleted.');
        this.path(collection); this.branchName(branch);
        try { await this.call((sdk, opts) => sdk.collection(collection).branches.delete(branch, opts)); }
        catch (e) { if (e.status !== 404) throw e; }
        if ((await this.branches(collection)).some(b => b.name === branch)) throw new ConnectionError('Branch deletion is not confirmed. Retry cleanup.');
    }
    inlineDocs(result) {
        if (result.isDocsInline === false || !Array.isArray(result.docs)) throw new ConnectionError('Memory documents unavailable inline. No state was adopted.');
        return result.docs.map(x => x.doc);
    }
    async fetchDocs(collection, ids, branch = 'main', consistentRead = true) {
        this.path(collection); this.branchName(branch);
        return this.inlineDocs(await this.call((sdk, opts) => sdk.collection(collection).docs.fetch({ ids, ref: { kind: 'branch', name: branch }, consistentRead, includeVectors: false }, opts)));
    }
    async listDocs(collection, branch = 'main') {
        const docs = [], tokens = new Set(); let token;
        do {
            this.path(collection); this.branchName(branch);
            const result = await this.call((sdk, opts) => sdk.collection(collection).docs.list({ size: 100, includeVectors: false, ref: { kind: 'branch', name: branch }, ...(token ? { pageToken: token } : {}) }, opts));
            docs.push(...this.inlineDocs(result));
            token = result.nextPageToken;
            if (token && (typeof token !== 'string' || tokens.has(token))) throw new ConnectionError('Invalid document pagination. No state was adopted.');
            if (token) tokens.add(token);
        } while (token);
        return docs;
    }
    async deleteOwnedCollection(collection, owner, scope) {
        try { await this.assertOwned(collection, owner, undefined, scope); } catch (e) { if (e.status === 404) return; throw e; }
        await this.call((sdk, opts) => sdk.collection(collection).delete(opts));
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
            const result = await this.call((sdk, opts) => sdk.listCollections({ size: 100, ...(token ? { pageToken: token } : {}) }, opts));
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
    async query(collection, query, { signal, size = 30, branch = 'main', consistentRead = true } = {}) {
        this.path(collection); this.branchName(branch);
        const result = await this.call((sdk, opts) => sdk.collection(collection).query({ query, size, consistentRead, ref: { kind: 'branch', name: branch }, includeVectors: false }, opts), signal);
        // Never forward a project key to a presigned download URL. Fail safely for now.
        if (result.isDocsInline === false) throw new ConnectionError('Result requires external download. Reduce the retrieval size; no memory was injected.');
        if (!Array.isArray(result.docs)) throw new ConnectionError('Invalid memory query response.');
        return result.docs.map(x => x.doc);
    }
    search(collection, owner, scope, text, signal, branch = 'main') {
        return this.query(collection, { knn: { field: 'embedding', queryText: text, k: 30, filter: scopeFilter(owner, scope) } }, { signal, branch });
    }
}

function httpError(status) {
    const messages = {
        400: 'Invalid request or authentication failure. Check configuration and re-enter your project key.',
        401: 'Authentication failed. Re-enter your project API key.',
        403: 'Access denied. Check your project key and permissions.',
        404: 'Resource unavailable. Check the endpoint, project and collection.',
        409: 'Collection already exists. Do not adopt an unrelated collection.',
        429: 'LambdaDB is busy or over its request limit. Retry later.',
    };
    return new ConnectionError(messages[status] || `Memory service returned HTTP ${status}.`, status);
}
