import { ConnectionError } from './client.js';

// Private memory embeds chunks and queries in the browser through a
// user-connected OpenAI-compatible endpoint. LambdaDB receives only vectors.
// Keys stay in this client's private field; errors never include response bodies.

// Prefixes are the model-card strings used by the validated experiment
// (benchmark/text-private/embed.mjs). Only these three were validated, on
// English LongMemEval-S.
export const EMBEDDING_PRESETS = Object.freeze({
    'openai-small': Object.freeze({ label: 'OpenAI text-embedding-3-small', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', queryPrefix: '', documentPrefix: '' }),
    'ollama-qwen3': Object.freeze({ label: 'Ollama qwen3-embedding:0.6b', baseUrl: 'http://localhost:11434/v1', model: 'qwen3-embedding:0.6b',
        queryPrefix: 'Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:', documentPrefix: '' }),
    'ollama-gemma': Object.freeze({ label: 'Ollama embeddinggemma', baseUrl: 'http://localhost:11434/v1', model: 'embeddinggemma',
        queryPrefix: 'task: search result | query: ', documentPrefix: 'title: none | text: ' }),
});
// A preset applies only with its exact model and prefixes; any other combination is custom.
export function embeddingPreset(config) {
    return Object.keys(EMBEDDING_PRESETS).find(id => ['model', 'queryPrefix', 'documentPrefix'].every(k => EMBEDDING_PRESETS[id][k] === config?.[k]));
}

export function embeddingConfig(input) {
    let url;
    try { url = new URL(String(input?.baseUrl ?? '').trim()); } catch { throw new ConnectionError('Enter the embedding endpoint URL, for example http://localhost:11434/v1.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new ConnectionError('The embedding endpoint must be an HTTP or HTTPS URL without credentials, query or fragment.');
    }
    const model = String(input?.model ?? '').trim();
    if (!model || model.length > 200) throw new ConnectionError('Enter the embedding model name.');
    // Prefixes are kept exactly: model-card prompts end with a space or a newline-separated label.
    const prefix = value => {
        if (value === undefined || value === null) return '';
        if (typeof value !== 'string' || value.length > 1000) throw new ConnectionError('Embedding prefixes must be text of at most 1,000 characters.');
        return value;
    };
    return { baseUrl: url.origin + url.pathname.replace(/\/+$/, ''), model, queryPrefix: prefix(input.queryPrefix), documentPrefix: prefix(input.documentPrefix) };
}
export function localEndpoint(baseUrl) {
    try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname); } catch { return false; }
}

// Collection tags allow at most five entries and no ':' in values, so the
// embedding identity is one digest of the model, both prefixes and the dimension.
export async function embeddingIdentity(config) {
    const dimensions = config?.dimensions;
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) throw new ConnectionError('Private memory needs a tested embedding endpoint. Choose Test and save in SillyMemory settings.', 0, 'embedding');
    const { model, queryPrefix, documentPrefix } = embeddingConfig(config);
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([model, queryPrefix, documentPrefix, dimensions])));
    const embedding = Array.from(new Uint8Array(bytes).slice(0, 8), x => x.toString(16).padStart(2, '0')).join('');
    return { dimensions, tags: { memory_mode: 'private', embedding } };
}

// Unit-length vectors rounded to 4 decimal places: the stored form accepted by
// the rounding check (about 7.4 JSON characters per component).
export function compactVector(values) {
    if (!Array.isArray(values) || !values.length || !values.every(Number.isFinite)) return null;
    const norm = Math.hypot(...values);
    if (!(norm > 0) || !Number.isFinite(norm)) return null;
    return values.map(x => Math.round(x / norm * 1e4) / 1e4 || 0);
}

export const EMBEDDING_BATCH = 32;
const failed = 'Embedding request failed. Check the embedding endpoint URL, that it is running, and that it allows browser requests (CORS) from this page’s origin.';
export class EmbeddingClient {
    #key;
    constructor(config, key = '', { fetcher = (...args) => globalThis.fetch(...args), timeoutMs = 120000, dimensions = config?.dimensions } = {}) {
        this.config = embeddingConfig(config);
        this.#key = typeof key === 'string' ? key.trim() : '';
        Object.assign(this, { fetcher, timeoutMs, dimensions });
    }
    async request(input, signal) {
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const combined = AbortSignal.any([timeout, ...(signal ? [signal] : [])]);
        let response, body;
        try {
            combined.throwIfAborted();
            // Only Content-Type and an optional bearer key; never host cookies or CSRF headers.
            response = await this.fetcher(`${this.config.baseUrl}/embeddings`, {
                method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', signal: combined,
                headers: { 'Content-Type': 'application/json', ...(this.#key ? { Authorization: `Bearer ${this.#key}` } : {}) },
                body: JSON.stringify({ model: this.config.model, input, encoding_format: 'float' }),
            });
            if (response.ok) body = await response.json();
        } catch {
            if (signal?.aborted) throw new ConnectionError('Embedding request canceled.', 0, 'canceled');
            if (timeout.aborted) throw new ConnectionError('Embedding request timed out.', 0, 'embedding');
            throw new ConnectionError(response?.ok ? 'The embedding endpoint returned an invalid response.' : failed, 0, 'embedding');
        }
        // Keep status 0: an embedding 401 must not remove the LambdaDB key.
        if (!response.ok) {
            const auth = [401, 403].includes(response.status) ? ' Check the embedding API key.' : response.status === 404 ? ' Check the endpoint URL and model name.' : '';
            throw new ConnectionError(`The embedding endpoint returned HTTP ${response.status}.${auth}`, 0, 'embedding');
        }
        const data = Array.isArray(body?.data) ? body.data : null;
        if (!data || data.length !== input.length) throw new ConnectionError('The embedding endpoint returned an invalid response.', 0, 'embedding');
        const ordered = data.every(x => Number.isInteger(x?.index)) ? [...data].sort((a, b) => a.index - b.index) : data;
        if (ordered.some((x, i) => x?.index !== undefined && x.index !== i)) throw new ConnectionError('The embedding endpoint returned an invalid response.', 0, 'embedding');
        return ordered.map(x => {
            const vector = compactVector(x?.embedding);
            if (!vector) throw new ConnectionError('The embedding endpoint returned an invalid vector.', 0, 'embedding');
            if (this.dimensions === undefined) this.dimensions = vector.length;
            if (vector.length !== this.dimensions) throw new ConnectionError(`The embedding endpoint returned ${vector.length}-dimension vectors instead of ${this.dimensions}. Test the endpoint again; existing stories then need Rebuild story memory.`, 0, 'embedding');
            return vector;
        });
    }
    async embed(texts, prefix, signal) {
        const vectors = [];
        for (let i = 0; i < texts.length; i += EMBEDDING_BATCH) vectors.push(...await this.request(texts.slice(i, i + EMBEDDING_BATCH).map(t => prefix + t), signal));
        return vectors;
    }
    documents(texts, signal) { return this.embed(texts, this.config.documentPrefix, signal); }
    async query(text, signal) { return (await this.embed([text], this.config.queryPrefix, signal))[0]; }
    // One short synthetic request; both inputs must share one dimension.
    async check() {
        this.dimensions = undefined;
        await this.request([`${this.config.documentPrefix}SillyMemory endpoint check.`, `${this.config.queryPrefix}Is the endpoint reachable?`]);
        return this.dimensions;
    }
}
