// Offline excerpt candidates only. Never imported by the extension runtime.
import assert from 'node:assert/strict';
import { memoryMessages } from '../src/memory.js';
export const sentencePolicies = ['sentence-1', 'sentence-2'];

export function sentenceSpans(text) {
    const spans = []; let start = 0;
    // Keep whitespace in the preceding span so partitions round-trip exactly.
    const boundary = /[.!?。！？]["'”’」』)\]]*(?:\s+|$)/gu;
    for (const match of text.matchAll(boundary)) {
        const end = match.index + match[0].length;
        if (end > start) spans.push({ start, end });
        start = end;
    }
    if (start < text.length) spans.push({ start, end: text.length });
    return spans;
}
const terms = text => {
    const result = new Set();
    for (const word of text.trim().slice(0, 6000).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
        const chars = Array.from(word);
        for (let i = 0; i + 2 < chars.length; i++) result.add(chars.slice(i, i + 3).join(''));
    }
    return result;
};
export function bestWindow(text, queries, width) {
    assert(width === 1 || width === 2, 'Unknown sentence width');
    const spans = sentenceSpans(text), queryTerms = queries.map(terms);
    if (!spans.length) return { start: 0, end: 0 };
    let best, bestScore = -1;
    const size = Math.min(width, spans.length);
    for (let i = 0; i + size <= spans.length; i++) {
        const span = { start: spans[i].start, end: spans[i + size - 1].end };
        const words = terms(text.slice(span.start, span.end));
        const score = Math.max(0, ...queryTerms.map(query => words.size && query.size
            ? [...query].filter(word => words.has(word)).length / Math.sqrt(words.size * query.size) : 0));
        if (score > bestScore) { best = span; bestScore = score; }
    }
    return best;
}

export function excerptMessages(passages) {
    return memoryMessages(passages.map(({ doc, start, end }) => {
        assert(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= doc.text.length, 'Invalid source span');
        return { ...doc, text: `${start ? '[Earlier source text omitted]\n' : ''}${doc.text.slice(start, end)}${end < doc.text.length ? '\n[Later source text omitted]' : ''}` };
    }));
}
const textOf = passages => excerptMessages(passages).map(message => message.mes).join('\n');

export async function selectSentencePassages(hits, expected, queries, budget, policy, countTokens) {
    assert(sentencePolicies.includes(policy), 'Unknown sentence policy');
    assert(Number.isFinite(budget) && budget >= 0, 'Invalid budget');
    const local = new Map(expected.map(doc => [doc.id, doc])), seen = new Set(), ordered = [];
    for (const hit of hits) {
        const doc = local.get(hit?.id);
        if (!doc || seen.has(doc.id) || ['owner', 'scope', 'revision', 'text'].some(field => hit[field] !== doc[field])) continue;
        seen.add(doc.id); ordered.push(doc);
    }
    const count = async passages => {
        const text = textOf(passages), tokens = text ? await countTokens(text) : 0;
        assert(Number.isFinite(tokens) && tokens >= 0, 'Token counting unavailable');
        return tokens;
    };
    let selected = [];
    for (const doc of ordered) {
        if (!doc.text.trim()) continue;
        const span = bestWindow(doc.text, queries, policy === 'sentence-1' ? 1 : 2);
        const candidate = [...selected, { doc, ...span }];
        if (await count(candidate) <= budget) selected = candidate;
    }
    // Restore context only for already selected parents; all trials count the
    // full rendering, not a sum of independent token estimates.
    for (let i = 0; i < selected.length; i++) {
        const candidate = selected.map((entry, j) => j === i ? { doc: entry.doc, start: 0, end: entry.doc.text.length } : entry);
        if (await count(candidate) <= budget) selected = candidate;
    }
    const tokens = await count(selected); assert(tokens <= budget, 'Memory budget exceeded');
    return { passages: selected, messages: excerptMessages(selected), text: textOf(selected), tokens };
}

export function excerptEvidence(passages, evidence) {
    return evidence.map(ref => ({ message: ref.message,
        selected: passages.some(({ doc, start, end }) => doc.message === ref.message && doc.text.slice(start, end).includes(ref.quote)),
        parentSelected: passages.some(({ doc }) => doc.message === ref.message && doc.text.includes(ref.quote)),
    }));
}
