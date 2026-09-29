// Compare local context turns without additional search or model requests.
function grams(text) {
    const words = text.trim().slice(0, 6000).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const result = new Set();
    for (const word of words) {
        const chars = Array.from(word);
        for (let i = 0; i + 2 < chars.length; i++) result.add(chars.slice(i, i + 3).join(''));
    }
    return result;
}

export function preferAssistantContext(messages, user, assistant) {
    if (user < 0 || assistant <= user) return false;
    // Both context candidates and the generation anchor stay outside the corpus.
    const corpus = messages.slice(0, user).filter(m => m.eligible !== false && m.text.trim()).slice(-256).map(m => grams(m.text)).filter(g => g.size);
    if (corpus.length) {
        const frequency = new Map();
        for (const doc of corpus) for (const term of doc) frequency.set(term, (frequency.get(term) || 0) + 1);
        const weight = term => (1 + Math.log((corpus.length + 1) / ((frequency.get(term) || 0) + 1))) ** 2;
        const norm = terms => [...terms].reduce((sum, term) => sum + weight(term), 0);
        const norms = corpus.map(norm);
        const score = text => {
            const terms = grams(text), queryNorm = norm(terms);
            if (!queryNorm) return 0;
            let best = 0;
            for (const [i, doc] of corpus.entries()) {
                const dot = [...terms].reduce((sum, term) => sum + (doc.has(term) ? weight(term) : 0), 0);
                best = Math.max(best, dot / Math.sqrt(queryNorm * norms[i]));
            }
            return best;
        };
        const scores = { user: score(messages[user].text), assistant: score(messages[assistant].text) };
        return scores.assistant > scores.user * 1.25;
    }
    return false;
}
