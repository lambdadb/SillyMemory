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

// Persist provenance separately from embedding text. Missing or unsupported
// source time stays unknown; capture supplies only the selected host message.
export function conversationTime(message) {
    const timestamp = hostTimestamp(message.recordedAt);
    return timestamp ? { conversationTimestamp: timestamp, timestampSource: 'host_message' } : {};
}

export const SENT_GUIDANCE = "[Sent dates mark conversation time, not necessarily event time. Resolve today/yesterday only if the local conversation date is known; UTC alone is insufficient. Otherwise keep date ambiguity; do not infer an undated event's date. Z means UTC; no offset means unknown timezone. Session timestamps may be shared; absent dates are unknown.]";

// The caller supplies a source-validated clock, with its original precision.
export const sentLabel = time => time ? `, sent: ${time}` : '';
export const conversationTimeLabel = document => sentLabel(document.conversationTimestamp);
