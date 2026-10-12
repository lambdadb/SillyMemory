// Request state belongs to the selected native reply, never to global chat state.
export const REQUEST_GUIDANCE = 'Return a reply and request_status. Use needs_clarification ONLY when the user request or its referent is ambiguous and the user must clarify what they mean; ask one concise question. Missing, conflicting or ambiguous retrieved evidence for a clear request is NOT a reason to use needs_clarification: use insufficient_evidence and explain what cannot be established without inventing facts or asking the user to supply forgotten historical facts. Use answered when you answer the request, even if you append an optional conversational question. Status is not a factual-correctness certificate. Follow the latest user intent, including an explicit topic change or cancellation.';
export const REPLY_SCHEMA = Object.freeze({ name: 'sillymemory_reply', strict: true, value: {
    type: 'object', properties: { reply: { type: 'string' }, request_status: { type: 'string', enum: ['needs_clarification', 'answered', 'insufficient_evidence'] } },
    required: ['reply', 'request_status'], additionalProperties: false,
} });
const statuses = REPLY_SCHEMA.value.properties.request_status.enum;
export function isReplyTarget(chat, anchor, type = 'normal') {
    // The pinned host removes regenerated replies before interception; swipes
    // replace the final assistant slot. Normal replies append after the user.
    const message = chat[anchor];
    return ['normal', 'regenerate', 'swipe'].includes(type) && anchor === chat.length - (type === 'swipe' ? 2 : 1)
        && Boolean(message?.is_user) && !message.is_system && typeof message.mes === 'string' && Boolean(message.mes.trim())
        && !message.extra?.file && !message.extra?.media?.length && !message.extra?.tool_invocations?.length
        && (type !== 'swipe' || !chat.at(-1)?.is_user && !chat.at(-1)?.is_system);
}
export function conflictsWithReplyProtocol(included, excluded) {
    // Match the pinned host's YAML merge/exclusion shapes, including arrays of
    // objects for inclusion and a scalar key for exclusion.
    const includes = Array.isArray(included) ? included : [included];
    const excludes = Array.isArray(excluded) ? excluded : typeof excluded === 'string' ? [excluded] : Object.keys(excluded || {});
    return ['json_schema', 'response_format', 'messages', 'tools', 'n', 'stream'].some(key =>
        includes.some(value => value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key)) || excludes.includes(key));
}
const projection = (chat, end, includeLastState = true) => JSON.stringify(chat.slice(0, end + 1).map((m, i) => [
    m.mes, Boolean(m.is_user), Boolean(m.is_system), m.name, m.swipe_id ?? 0,
    m.extra?.file, m.extra?.media, m.extra?.tool_invocations,
    includeLastState || i !== end ? m.extra?.sillymemoryRequest : undefined,
]));
async function hash(text) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), x => x.toString(16).padStart(2, '0')).join('');
}

export async function pendingRequestStart(chat, anchor) {
    const index = chat.findLastIndex((m, i) => i < anchor && !m.is_user && !m.is_system);
    if (index < 0) return anchor;
    const record = chat[index].extra?.sillymemoryRequest;
    if (record?.version !== 1 || !['needs_clarification', 'unknown'].includes(record.status)
        || !Number.isInteger(record.root) || record.root < 0 || record.root >= index || !chat[record.root]?.is_user) return anchor;
    const source = projection(chat, index, false);
    const valid = await hash(source) === record.sourceHash;
    return valid && projection(chat, index, false) === source ? record.root : anchor;
}

export function decodeReply(text) {
    try {
        const value = JSON.parse(text);
        if (value && typeof value.reply === 'string' && value.reply.trim()) {
            const valid = Object.keys(value).length === 2 && statuses.includes(value.request_status);
            return { reply: value.reply, status: valid ? value.request_status : 'unknown', incomplete: false };
        }
    } catch { /* A truncated structured response must never be indexed as dialogue. */ }
    const structured = /^\s*[\[{]/.test(text);
    return { reply: structured || !text.trim() ? '[SillyMemory: no complete reply was received. Please regenerate.]' : text,
        status: 'unknown', incomplete: structured || !text.trim() };
}

export class ClarificationRequest {
    current = null;
    async prepare(chat, anchor, key) {
        const prefix = projection(chat, anchor);
        const start = await pendingRequestStart(chat, anchor);
        const prefixHash = await hash(prefix);
        if (prefix !== projection(chat, anchor)) throw new Error('Chat changed while preparing clarification context. Generate again.');
        this.current = { chat, key, anchor, start, prefix, prefixHash, requested: false, canceled: false };
        return start;
    }
    configure(data, chat, key) {
        const current = this.current;
        if (!current || current.chat !== chat || current.key !== key || current.prefix !== projection(chat, current.anchor)) return false;
        if (current.requested) throw new Error('A clarification response is already pending.');
        if (data.json_schema || data.response_format || data.tools?.length || Number(data.n || 1) !== 1) {
            throw new Error('Clarification continuity requires one reply without another response schema or tool calls. Disable the conflicting setting or clarification continuity.');
        }
        data.json_schema = structuredClone(REPLY_SCHEMA);
        current.requested = true;
        return true;
    }
    cancel() { if (this.current) this.current.canceled = true; }
    streaming(chat, key) {
        const current = this.current, message = chat[current?.anchor + 1];
        if (!current?.requested || current.chat !== chat || current.key !== key || !message || message.is_user) return null;
        current.responseSeen = true;
        message.extra ??= {};
        message.extra.sillymemoryPending = { version: 1, anchor: current.anchor, root: current.start, prefixHash: current.prefixHash };
        return current.anchor + 1;
    }
    async finish(chat, key, index, valid = () => true) {
        const current = this.current;
        if (!valid() || !current?.requested || current.chat !== chat || current.key !== key || index !== current.anchor + 1 || !chat[index] || chat[index].is_user) return null;
        const message = chat[index];
        message.extra ??= {};
        // Non-streaming replies need the same recoverable in-flight identity as
        // streams while asynchronous validation is pending.
        message.extra.sillymemoryPending ??= { version: 1, anchor: current.anchor, root: current.start, prefixHash: current.prefixHash };
        this.current = null;
        const unchanged = projection(chat, current.anchor) === current.prefix;
        const decoded = decodeReply(String(chat[index].mes || ''));
        if (current.canceled || !unchanged) decoded.status = 'unknown';
        const root = unchanged && ['needs_clarification', 'unknown'].includes(decoded.status) ? current.start : null;
        const source = projection(chat, index, false);
        const candidate = chat.slice(0, index + 1);
        candidate[index] = { ...message, mes: decoded.reply };
        const sourceHash = await hash(projection(candidate, index, false));
        // No decoded text, existing marker or selected-swipe state changes before the final
        // source/ownership check. Invalidated candidates remain recoverable.
        if (!valid() || chat[index] !== message || projection(chat, index, false) !== source) return null;
        message.mes = decoded.reply;
        message.extra ??= {};
        delete message.extra.sillymemoryPending;
        message.extra.sillymemoryRequest = { version: 1, status: decoded.status, root, sourceHash, incomplete: decoded.incomplete };
        if (Array.isArray(message.swipes)) message.swipes[message.swipe_id ?? 0] = message.mes;
        if (message.swipe_info?.[message.swipe_id ?? 0]) message.swipe_info[message.swipe_id ?? 0].extra = structuredClone(message.extra);
        return decoded;
    }
}

// A chat may have been saved while a stream was interrupted or while switching
// chats. A persisted in-flight marker permits recovery without parsing unrelated
// messages that happen to contain JSON.
export async function recoverPendingReplies(chat, valid = () => true) {
    const recovered = [];
    for (let index = 0; index < chat.length; index++) {
        if (!valid()) break;
        const message = chat[index], marker = message.extra?.sillymemoryPending;
        if (marker?.version !== 1 || marker.anchor !== index - 1 || !Number.isInteger(marker.root) || marker.root < 0 || marker.root > marker.anchor || !chat[marker.root]?.is_user) continue;
        const prefix = projection(chat, marker.anchor);
        const prefixHash = await hash(prefix);
        if (!valid() || chat[index] !== message || projection(chat, marker.anchor) !== prefix) continue;
        const request = new ClarificationRequest();
        request.current = { chat, key: '', anchor: marker.anchor, start: marker.root, prefix: prefixHash === marker.prefixHash ? prefix : '', requested: true, canceled: true };
        if (await request.finish(chat, '', index, valid)) recovered.push(index);
    }
    return recovered;
}
