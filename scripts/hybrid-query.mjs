// Experimental candidate only; production stays vector-only unless adopted.
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
