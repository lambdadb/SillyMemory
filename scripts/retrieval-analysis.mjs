import assert from 'node:assert/strict';
export const normalize = text => text.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase();
export function cosine(a, b) {
    assert(a.length && a.length === b.length, 'Vector dimension mismatch');
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { assert(Number.isFinite(a[i]) && Number.isFinite(b[i]), 'Invalid vector'); dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
    assert(na > 0 && nb > 0, 'Zero vector');
    return dot / Math.sqrt(na * nb);
}
export function exactSearch(docs, vector, owner, scope) {
    return docs.filter(d => d.owner === owner && d.scope === scope).map(d => ({ id: d.id, cosine: cosine(vector, d.embedding) })).sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
}
export function recall(exact, returned, k = 30, tolerance = 1e-6) {
    const top = exact.slice(0, k), ids = new Set(top.map(d => d.id)), all = new Map(exact.map(d => [d.id, d.cosine]));
    assert(returned.length === top.length && new Set(returned.map(d => d.id)).size === returned.length, 'Wrong or duplicate candidate count');
    assert(returned.every(d => all.has(d.id)), 'Foreign candidate');
    const cutoff = top.at(-1).cosine;
    return { recallAtK: returned.filter(d => ids.has(d.id)).length / top.length, tieAwareRecallAtK: returned.filter(d => all.get(d.id) >= cutoff - tolerance).length / top.length, worstCosineGap: Math.max(0, ...returned.map(d => cutoff - all.get(d.id))) };
}
export function queryVariants(messages, question) {
    const full = `${question} 설명 없이 답만 짧게 쓰세요. 대화에 정보가 없으면 반드시 UNKNOWN이라고 답하세요.`;
    const recent = [...messages.slice(-2).map(m => m.mes), full];
    return { current: recent.join('\n').slice(-6000), reverse: recent.toReversed().join('\n'), latest: full, question };
}
