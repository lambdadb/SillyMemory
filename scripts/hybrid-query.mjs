// Historical RRF comparison; retain its explicit query policies.
import { scopeFilter } from '../src/client.js';
export function hybridQuery(owner, scope, text) {
    const filter = scopeFilter(owner, scope);
    const vector = { knn: { field: 'embedding', queryText: text, k: 30, filter } };
    // Analyze literal words/codes, never execute user-supplied Lucene syntax.
    // Quoted tokens also make AND/OR/NOT ordinary words. Bound clause count.
    const terms = [...new Set(text.match(/[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*/gu) || [])].slice(0, 128);
    if (!terms.length) return vector;
    return { rrf: [vector, { bool: [
        { ...filter, occur: 'filter' },
        { queryString: { query: terms.map(term => `"${term}"`).join(' OR '), defaultField: 'text' }, occur: 'must' },
    ] }] };
}

// Preserve the engine's branch and cancellation across both comparison modes.
// This hook is test infrastructure; it never changes the shipped query policy.
export function comparisonSearch(trace) {
    return async function (collection, owner, scope, text, signal, branch) {
        if (!branch || branch === 'main') throw new Error('A comparison requires the active chat branch.');
        const start = performance.now(), query = hybridQuery(owner, scope, text);
        const hits = await (trace.mode === 'hybrid'
            ? this.query(collection, query, { signal, branch })
            : this.query(collection, query.rrf?.[0] || query, { signal, branch }));
        if (hits.some(d => d.owner !== owner || d.scope !== scope)) throw new Error('Unfiltered candidate in comparison');
        trace.queries.push({ text, query: trace.mode === 'hybrid' ? query : query.rrf?.[0] || query, hits, elapsedMs: performance.now() - start });
        return hits;
    };
}
