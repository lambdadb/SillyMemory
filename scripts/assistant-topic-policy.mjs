// Frozen development policies; not used by the extension runtime.
export function assistantTopicQueries(snapshot, type = 'normal') {
    const messages = snapshot.messages;
    let anchor = messages.findLastIndex(m => (type === 'continue' || m.user) && m.text.trim());
    if (anchor < 0) anchor = messages.findLastIndex(m => m.text.trim());
    if (anchor < 0) return { baseline: [], 'user-first': [], 'assistant-first': [] };
    const primary = messages[anchor].text.trim().slice(0, 6000);
    const prior = messages.slice(0, anchor);
    const user = prior.findLast(m => m.user && m.text.trim())?.text.trim().slice(0, 6000);
    const assistant = prior.findLast(m => !m.user && m.text.trim())?.text.trim().slice(0, 6000);
    const unique = values => [...new Set(values.filter(Boolean))];
    return { baseline: unique([primary, user]), 'user-first': unique([primary, user, assistant]), 'assistant-first': unique([primary, assistant, user]) };
}
