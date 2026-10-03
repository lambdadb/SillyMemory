// Frozen candidate, retained separately for comparison with runtime integration.
export function assistantFallbackQueries(snapshot, type = 'normal') {
    const messages = snapshot.messages;
    let anchor = messages.findLastIndex(m => (type === 'continue' || m.user) && m.text.trim());
    if (anchor < 0) anchor = messages.findLastIndex(m => m.text.trim());
    if (anchor < 0) return [];
    const prior = messages.slice(0, anchor);
    const context = prior.findLast(m => m.user && m.text.trim()) ?? prior.findLast(m => !m.user && m.text.trim());
    return [...new Set([messages[anchor].text, context?.text].filter(Boolean).map(text => text.trim().slice(0, 6000)))];
}
