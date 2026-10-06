// The pinned host writes ISO UTC send_date and can also store epoch milliseconds.
// Do not guess a timezone, parse narration, or substitute the current clock.
export function hostTimestamp(value) {
    let date;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
        date = new Date(value);
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
        date = new Date(value);
        if (!Number.isFinite(date.getTime())) return null;
        const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction) => `.${(fraction || '').padEnd(3, '0')}Z`);
        if (date.toISOString() !== canonical) return null; // Reject calendar rollover.
    } else return null;
    if (!Number.isFinite(date.getTime())) return null;
    const timestamp = date.toISOString();
    return /^\d{4}-/.test(timestamp) ? timestamp : null;
}

// Annotate only after selection. Never spend provenance tokens by evicting a
// chosen passage, collapsing occurrences, or trusting remote timestamp fields.
export async function annotateHostTime(result, snapshot, budget, countTokens) {
    if (!result.messages?.length) return result;
    const source = new Map(snapshot.messages.map(message => [message.index, message]));
    const seen = new Set(), entries = [];
    let annotated = result;
    for (const passage of result.passages) {
        const index = passage.message;
        if (seen.has(index)) continue;
        seen.add(index);
        const timestamp = hostTimestamp(source.get(index)?.recordedAt);
        if (!Number.isInteger(index) || index < 0 || !timestamp) continue;
        const candidate = [...entries, `${index + 1}=${timestamp}`];
        const header = `[Host message timestamps (UTC; not story/event dates): ${candidate.join('; ')}]\n`;
        const messages = result.messages.map((message, i) => i ? { ...message } : { ...message, mes: message.mes.replace('\n', `\n${header}`) });
        const text = messages.map(message => message.mes).join('\n');
        const tokens = await countTokens(text);
        if (!Number.isFinite(tokens) || tokens < 0) throw new Error('Token counting unavailable.');
        if (tokens <= budget) {
            entries.push(candidate.at(-1));
            annotated = { ...result, messages, text, tokens };
        }
    }
    return annotated;
}
