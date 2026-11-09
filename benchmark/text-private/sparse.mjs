// Client-computed BM25 as a LambdaDB sparseVector: documents carry hashed BM25
// term-frequency weights; queries carry IDF weights computed locally over exactly
// the searched document range. The dot product equals Lucene BM25 up to the
// constant (k1 + 1) factor, a fixed average length and FeatureField quantization.
import { createHmac } from 'node:crypto';
import { analyze } from './analyzer.mjs';

export const K1 = 1.2, B = 0.75;
// Fixed length normalizer: rounded mean analyzed-term count of 800-character-limit
// LongMemEval chunks (see docs/text-private-retrieval.md). Not updated as a chat grows.
export const AVERAGE_LENGTH = 60;
// The service accepts weights in (0, 64]; 0 returns HTTP 500. It validates <= 4096 terms, but
// 4095 terms (plus filter clauses) returned HTTP 500 in the live probe while 3000 succeeded.
export const MAX_QUERY_WEIGHT = 64, MAX_QUERY_TERMS = 3000;

export const termKey = (secret, term) => createHmac('sha256', secret).update(term, 'utf8').digest('hex').slice(0, 16);

export function counts(terms) {
    const result = new Map();
    for (const term of terms) result.set(term, (result.get(term) || 0) + 1);
    return result;
}

// Returns null when the text has no indexed terms; LambdaDB rejects an empty object.
export function documentWeights(terms, key = term => term) {
    if (!terms.length) return null;
    const norm = K1 * (1 - B + B * terms.length / AVERAGE_LENGTH), weights = {};
    for (const [term, tf] of counts(terms)) weights[key(term)] = tf * (K1 + 1) / (tf + norm);
    return weights;
}

export const idf = (n, df) => Math.log(1 + (n - df + 0.5) / (df + 0.5));

// documentTerms: analyzed term arrays of exactly the searched range.
export function documentFrequencies(documentTerms) {
    const df = new Map();
    for (const terms of documentTerms) for (const term of new Set(terms)) df.set(term, (df.get(term) || 0) + 1);
    return { n: documentTerms.length, df };
}

// Duplicate query terms sum (Lucene SHOULD clauses do), capped at 64. Terms absent
// from the range match nothing and are omitted. Returns null for an empty query.
export function queryWeights(queryText, { n, df }, key = term => term) {
    const weighted = [];
    for (const [term, count] of counts(analyze(queryText))) {
        const frequency = df.get(term) || 0;
        if (frequency) weighted.push([term, idf(n, frequency), count]);
    }
    if (!weighted.length) return null;
    weighted.sort((a, b) => b[1] - a[1]);
    const weights = {};
    for (const [term, value, count] of weighted.slice(0, MAX_QUERY_TERMS)) weights[key(term)] = Math.min(MAX_QUERY_WEIGHT, value * count);
    return weights;
}

// Lucene FeatureField stores Float.floatToIntBits(value) >>> 15 as a term frequency.
const view = new DataView(new ArrayBuffer(4));
export function featureFieldValue(value) {
    view.setFloat32(0, value);
    view.setUint32(0, (view.getUint32(0) >>> 15) << 15);
    return view.getFloat32(0);
}
