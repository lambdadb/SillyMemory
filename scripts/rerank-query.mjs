// Evaluation-only hook: production retrieval remains unchanged.
import { scopeFilter } from '../src/client.js';
export function rerankInput(owner, scope, text, branch, mode) {
    if (!branch || branch === 'main' || !/^[a-zA-Z0-9_-]{3,52}$/.test(branch)) throw new Error('Evaluation requires an explicit chat branch.');
    if (!['vector', 'rerank'].includes(mode)) throw new Error('Unknown reranking arm.');
    if (!text || new TextEncoder().encode(text).length > 8192) throw new Error('Reranking query exceeds the frozen input bound.');
    return { query: { knn: { field: 'embedding', queryText: text, k: 30, filter: scopeFilter(owner, scope) } },
        size: 30, consistentRead: true, includeVectors: false, ref: { kind: 'branch', name: branch },
        ...(mode === 'rerank' ? { rerank: { provider: 'typesafe', model: 'jev-1.13.0', queryText: text, fields: ['text'], candidateSize: 30, onFailure: 'returnOriginal' } } : {}) };
}
export function rerankSearch(trace) {
    return async function (collection, owner, scope, text, signal, branch) {
        const input = rerankInput(owner, scope, text, branch, trace.mode), start = performance.now();
        const response = await this.call((sdk, opts) => sdk.collection(collection).query(input, opts), signal);
        const hits = this.inlineDocs(response);
        if (hits.some(doc => doc.owner !== owner || doc.scope !== scope)) throw new Error('Unfiltered reranking candidate.');
        if (trace.mode === 'rerank' && !['applied', 'fallback', 'skipped'].includes(response.rerank?.status)) throw new Error('Missing reranking status.');
        if (response.rerank?.status === 'applied' && response.docs.some(row => !Number.isFinite(row.retrievalScore) || !Number.isFinite(row.score) || row.score < 0 || row.score > 1)) throw new Error('Missing applied reranking scores.');
        trace.queries.push({ text, input, hits, scores: response.docs.map(({ doc, score, retrievalScore }) => ({ id: doc.id, score, retrievalScore })), rerank: response.rerank, elapsedMs: performance.now() - start });
        return hits;
    };
}
