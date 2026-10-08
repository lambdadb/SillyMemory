// Use the entire recent partition, without selecting or truncating its turns.
export function conversationQuery(messages, anchor, recent) {
    const primary = messages[anchor].text.trim();
    // Match the source boundary used by documents(), including retained answers.
    const start = Math.max(0, messages.length - recent);
    const turns = messages.slice(start, anchor).flatMap((message, offset) =>
        message.eligible === false || !message.text.trim() ? [] : [{
            turnId: message.index ?? start + offset,
            role: message.user ? 'user' : 'assistant',
            text: message.text,
        }]);
    if (!turns.length) return primary;
    return `Recent conversation (context only):\n${JSON.stringify(turns)}\nCurrent question (retrieval purpose):\n${primary}`;
}
