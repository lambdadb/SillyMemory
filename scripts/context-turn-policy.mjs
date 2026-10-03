// Development candidate. No network, model calls, language-specific stopwords or oracle.
function grams(text) {
    const words = text.trim().slice(0, 6000).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const result = new Set();
    for (const word of words) {
        const chars = Array.from(word);
        for (let i = 0; i + 2 < chars.length; i++) result.add(chars.slice(i, i + 3).join(''));
    }
    return result;
}
export function contextTurnQueries(snapshot, type = 'normal', margin = 1.25, minimumScore = null) {
    const messages = snapshot.messages;
    let anchor = messages.findLastIndex(m => (type === 'continue' || m.user) && m.text.trim());
    if (anchor < 0) anchor = messages.findLastIndex(m => m.text.trim());
    if (anchor < 0) return { queries: [], switched: false, scores: null };
    const prior = messages.slice(0, anchor);
    const user = prior.findLastIndex(m => m.user && m.text.trim());
    const assistant = prior.findLastIndex(m => !m.user && m.text.trim());
    let context = user >= 0 ? user : assistant, scores = null;
    if (user >= 0 && assistant > user) {
        // Exclude both candidate context turns and the anchor from the corpus.
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
            scores = { user: score(prior[user].text), assistant: score(prior[assistant].text) };
            if (minimumScore === null ? scores.assistant > scores.user * margin : scores.assistant >= minimumScore) context = assistant;
        }
    }
    const queries = [...new Set([messages[anchor].text, prior[context]?.text].filter(Boolean).map(text => text.trim().slice(0, 6000)))];
    return { queries, switched: user >= 0 && context === assistant, scores };
}
