// Evaluation-only hook: production retrieval remains unchanged.
import { scopeFilter } from '../src/client.js';
import { hybridQuery } from './hybrid-query.mjs';
export function sharedRerankText(queries) {
    const primary = queries[0]?.trim(), context = queries[1]?.trim();
    if (!primary) throw new Error('Current request unavailable for reranking.');
    const encode = text => new TextEncoder().encode(text).length;
    const prefix = `Current request:\n${primary}`;
    if (encode(prefix) > 8192) throw new Error('Current request exceeds the reranking input bound.');
    if (!context) return prefix;
    const label = '\n\nPrior conversation (reference context, not a separate request):\n';
    if (encode(prefix + label + context) <= 8192) return prefix + label + context;
    const marker = ' [context truncated]';
    const remaining = 8192 - encode(prefix + label + marker);
    if (remaining <= 0) return prefix;
    let kept = '', used = 0;
    for (const char of context) { const bytes = encode(char); if (used + bytes > remaining) break; kept += char; used += bytes; }
    return prefix + label + kept + marker;
}
export function rerankInput(owner, scope, text, branch, mode, intent) {
    if (!branch || branch === 'main' || !/^[a-zA-Z0-9_-]{3,52}$/.test(branch)) throw new Error('Evaluation requires an explicit chat branch.');
    if (!['vector', 'rerank', 'hybrid', 'hybrid-rerank', 'hybrid-intent'].includes(mode)) throw new Error('Unknown reranking arm.');
    if (!text || new TextEncoder().encode(text).length > 8192) throw new Error('Reranking query exceeds the frozen input bound.');
    if (mode === 'hybrid-intent' && (typeof intent !== 'string' || !intent.trim() || new TextEncoder().encode(intent).length > 8192)) throw new Error('Invalid shared reranking request.');
    return { query: mode.startsWith('hybrid') ? hybridQuery(owner, scope, text) : { knn: { field: 'embedding', queryText: text, k: 30, filter: scopeFilter(owner, scope) } },
        size: 30, consistentRead: true, includeVectors: false, ref: { kind: 'branch', name: branch },
        ...((mode.endsWith('rerank') || mode === 'hybrid-intent') ? { rerank: { provider: 'typesafe', model: 'jev-1.13.0', queryText: mode === 'hybrid-intent' ? intent : text, fields: ['text'], candidateSize: 30, onFailure: 'returnOriginal' } } : {}) };
}
export function rerankSearch(trace) {
    return async function (collection, owner, scope, text, signal, branch) {
        const input = rerankInput(owner, scope, text, branch, trace.mode, trace.intent), start = performance.now();
        const response = await this.call((sdk, opts) => sdk.collection(collection).query(input, opts), signal);
        const hits = this.inlineDocs(response);
        if (hits.some(doc => doc.owner !== owner || doc.scope !== scope)) throw new Error('Unfiltered reranking candidate.');
        if ((trace.mode.endsWith('rerank') || trace.mode === 'hybrid-intent') && !['applied', 'fallback', 'skipped'].includes(response.rerank?.status)) throw new Error('Missing reranking status.');
        if (response.rerank?.status === 'applied' && response.docs.some(row => !Number.isFinite(row.retrievalScore) || !Number.isFinite(row.score) || row.score < 0 || row.score > 1)) throw new Error('Missing applied reranking scores.');
        trace.queries.push({ text, input, hits, scores: response.docs.map(({ doc, score, retrievalScore }) => ({ id: doc.id, score, retrievalScore })), rerank: response.rerank, elapsedMs: performance.now() - start });
        return hits;
    };
}
