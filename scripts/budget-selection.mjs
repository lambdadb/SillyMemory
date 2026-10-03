// Offline candidates only. No runtime imports this module.
import assert from 'node:assert/strict';
import { interleaveHits, memoryMessages } from '../src/memory.js';

export const policies = ['baseline', 'rrf0', 'rrf60', 'density', 'lexical', 'lexical-rrf'];
const grams = text => {
    const result = new Set();
    for (const word of text.trim().slice(0, 6000).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
        const chars = Array.from(word);
        for (let i = 0; i + 2 < chars.length; i++) result.add(chars.slice(i, i + 3).join(''));
    }
    return result;
};

// Inputs are already matched to synthetic local source documents by the loader.
// This is not a replacement for runtime validation before deduplication.
export function rankPassages(lists, queries, policy, countTokens) {
    assert(policies.includes(policy), 'Unknown selection policy');
    if (policy === 'baseline') return interleaveHits(lists);
    const docs = [...new Map(interleaveHits(lists).map(doc => [doc.id, doc])).values()];
    const terms = docs.map(doc => grams(doc.text)), frequency = new Map();
    for (const set of terms) for (const term of set) frequency.set(term, (frequency.get(term) || 0) + 1);
    const weight = term => (1 + Math.log((docs.length + 1) / ((frequency.get(term) || 0) + 1))) ** 2;
    const norm = set => [...set].reduce((sum, term) => sum + weight(term), 0);
    const queryTerms = queries.map(grams), queryNorms = queryTerms.map(norm), docNorms = terms.map(norm);
    return docs.map((doc, index) => {
        const ranks = lists.map(list => list.findIndex(hit => hit.id === doc.id));
        const rrf = k => ranks.reduce((sum, rank) => sum + (rank < 0 ? 0 : 1 / (k + rank + 1)), 0);
        const lexical = Math.max(0, ...queryTerms.map((query, i) => queryNorms[i] && docNorms[index]
            ? [...query].reduce((sum, term) => sum + (terms[index].has(term) ? weight(term) : 0), 0) / Math.sqrt(queryNorms[i] * docNorms[index]) : 0));
        let score;
        if (policy === 'rrf0') score = rrf(0);
        if (policy === 'rrf60') score = rrf(60);
        if (policy === 'density') {
            const cost = countTokens(memoryMessages([doc])[0].mes);
            assert(Number.isFinite(cost) && cost > 0, 'Invalid passage cost');
            score = rrf(0) / cost;
        }
        if (policy === 'lexical') score = lexical;
        if (policy === 'lexical-rrf') score = lexical + rrf(60);
        return { doc, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.doc);
}

export function summarizeSelection(rows) {
    assert(rows.length && new Set(rows.map(row => `${row.id}/${row.budget}`)).size === rows.length, 'Missing/duplicate replay rows');
    return Object.fromEntries(policies.map(policy => {
        let selected = 0, total = 0;
        const losses = [], gains = [];
        for (const row of rows) {
            const baseline = row.variants.baseline.evidence, variant = row.variants[policy];
            assert(Number.isFinite(variant.tokens) && variant.tokens >= 0 && variant.tokens <= row.budget, 'Budget exceeded');
            assert.deepEqual(variant.evidence.map(e => [e.message, e.quote]), baseline.map(e => [e.message, e.quote]), 'Evidence alignment');
            for (const [index, evidence] of variant.evidence.entries()) {
                assert.equal(typeof evidence.selected, 'boolean');
                selected += Number(evidence.selected); total++;
                const ref = { id: row.id, budget: row.budget, message: evidence.message };
                if (baseline[index].selected && !evidence.selected) losses.push(ref);
                if (!baseline[index].selected && evidence.selected) gains.push(ref);
            }
        }
        return [policy, { selected, total, losses, gains,
            // Necessary development gate only, never authority to ship a policy.
            eligibleForFreshValidation: policy !== 'baseline' && gains.length > 0 && losses.length === 0 }];
    }));
}
