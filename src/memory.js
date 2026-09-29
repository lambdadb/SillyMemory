export const DEFAULTS = Object.freeze({ recent: 12, budget: 800, chunkChars: 800 });
export function options(value = {}) {
    const integer = (x, fallback, min, max) => Number.isInteger(Number(x)) ? Math.min(max, Math.max(min, Number(x))) : fallback;
    return { recent: integer(value.recent, 12, 2, 100), budget: integer(value.budget, 800, 64, 4096), chunkChars: integer(value.chunkChars, 800, 200, 2000) };
}
export async function digest(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
export function capture(context) {
    if (context.groupId || context.characterId === undefined || !context.getCurrentChatId()) return null;
    if (context.chat.some(m => m.is_system && m.extra?.tool_invocations?.length)) return null;
    const avatar = context.characters[context.characterId]?.avatar;
    if (!avatar) return null;
    const messages = context.chat.filter(x => !x.is_system).map((m, index) => ({
        index, text: typeof m.mes === 'string' ? m.mes : '', name: String(m.name || (m.is_user ? 'User' : 'Character')),
        user: Boolean(m.is_user), swipe: m.swipe_id ?? 0,
        eligible: !m.extra?.file && !m.extra?.media?.length && !m.extra?.tool_invocations?.length,
    }));
    return { character: avatar, chat: context.getCurrentChatId(), messages };
}
export function fingerprint(snapshot) { return JSON.stringify(snapshot); }
export const RETRIEVAL_POLICY = 'latest-anchor-with-assistant-fallback-v4';
export function retrievalQueries(snapshot, type = 'normal') {
    const messages = snapshot.messages;
    // Swipe/regenerate may retain an assistant answer in the source. Anchor on
    // the last user message so that answer cannot steer its own replacement.
    // Explicit continuation follows the message being extended. Regenerate and
    // swipe still exclude the old answer from the query for its replacement.
    let anchor = messages.findLastIndex(m => (type === 'continue' || m.user) && m.text.trim());
    if (anchor < 0) anchor = messages.findLastIndex(m => m.text.trim());
    if (anchor < 0) return [];
    const primary = messages[anchor].text.trim().slice(0, 6000);
    // Search the prior user topic independently: generic questions and assistant
    // acknowledgments can dilute its embedding when concatenated together.
    // An imported assistant-only history has no preceding user topic. Use its
    // last assistant turn only in that case, never the answer after the anchor.
    const prior = messages.slice(0, anchor);
    const context = prior.findLast(m => m.user && m.text.trim()) ?? prior.findLast(m => !m.user && m.text.trim());
    const contextual = context?.text.trim().slice(0, 6000);
    return [...new Set([primary, contextual].filter(Boolean))];
}
export function interleaveHits(lists) {
    const hits = [];
    for (let rank = 0; rank < Math.max(0, ...lists.map(list => list.length)); rank++) {
        for (const list of lists) if (rank < list.length) hits.push(list[rank]);
    }
    // Validate before deduplicating in selectMemory: an invalid remote copy must
    // not suppress a valid copy of the same source ID from the other query.
    return hits;
}
export function chunks(text, limit) {
    const chars = Array.from(text); // Do not split surrogate pairs.
    const result = [];
    for (let start = 0; start < chars.length; start += limit) result.push(chars.slice(start, start + limit).join(''));
    return result;
}
export async function documents(snapshot, owner, config) {
    const scope = await digest(JSON.stringify([owner, snapshot.character, snapshot.chat]));
    const docs = [];
    for (const m of snapshot.messages.slice(0, -config.recent)) {
        if (!m.eligible || !m.text.trim()) continue;
        const revision = await digest(JSON.stringify([m.index, m.name, m.user, m.swipe, m.text]));
        for (const [chunk, text] of chunks(m.text, config.chunkChars).entries()) {
            docs.push({ id: `${scope}_${revision}_${chunk}`, owner, scope, revision, text, message: m.index, chunk, speaker: m.name, role: m.user ? 'user' : 'assistant' });
        }
    }
    return { scope, docs };
}
// The host expands macros after interceptors. Keep recalled text literal so
// it cannot execute variable macros or grow after token budgeting.
export function literal(text) {
    return String(text).replaceAll('{', '｛').replaceAll('}', '｝')
        .replace(/<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/gi, '＜$1＞');
}
export function memoryMessages(passages) {
    return [...passages].sort((a, b) => a.message - b.message || a.chunk - b.chunk).map(d => ({
        index: d.message, name: literal(d.speaker), is_user: d.role === 'user', is_system: false,
        mes: `[Past conversation excerpt: ${d.role} ${JSON.stringify(literal(d.speaker))}, message ${d.message + 1}, passage ${d.chunk + 1}]\n${literal(d.text)}`,
    }));
}
const wrap = passages => memoryMessages(passages).map(m => m.mes).join('\n');
export async function selectMemory(hits, expected, budget, countTokens) {
    const valid = new Map(expected.map(x => [x.id, x]));
    const selected = []; const seen = new Set();
    for (const hit of hits) {
        const doc = valid.get(hit?.id);
        // The remote response is only a ranking signal. Inject current local source text.
        if (!doc || seen.has(doc.id) || hit.scope !== doc.scope || hit.owner !== doc.owner || hit.revision !== doc.revision || hit.text !== doc.text) continue;
        seen.add(doc.id);
        const candidate = wrap([...selected, doc]);
        const tokens = await countTokens(candidate);
        if (!Number.isFinite(tokens) || tokens < 0) throw new Error('Token counting unavailable.');
        if (tokens <= budget) selected.push(doc);
    }
    const text = wrap(selected);
    const tokens = text ? await countTokens(text) : 0;
    if (!Number.isFinite(tokens) || tokens > budget) throw new Error('Memory budget exceeded.');
    return { text, tokens, passages: selected, messages: memoryMessages(selected) };
}

export class Journal {
    constructor(storage, namespace) { this.storage = storage; this.namespace = namespace; }
    key(scope) { return `sillymemory:journal:${this.namespace}:${scope}`; }
    read(scope) {
        const value = JSON.parse(this.storage.getItem(this.key(scope)) || '[]');
        if (!Array.isArray(value) || !value.every(x => typeof x === 'string')) throw new Error('Invalid synchronization journal.');
        return value;
    }
    write(scope, ids) { this.storage.setItem(this.key(scope), JSON.stringify([...new Set(ids)])); }
    clear() {
        const keys = [];
        for (let i = this.storage.length - 1; i >= 0; i--) {
            const key = this.storage.key(i);
            if (key?.startsWith(`sillymemory:journal:${this.namespace}:`)) keys.push(key);
        }
        // Storage enumeration can reorder after removal; snapshot keys first.
        for (const key of keys) this.storage.removeItem(key);
    }
}

export class MemoryEngine {
    constructor({ client, owner, collection, journal, lock = job => job() }) {
        Object.assign(this, { client, owner, collection, journal, lock });
        this.queue = Promise.resolve(); this.acknowledged = new Set(); this.generation = 0;
        this.pendingReads = new AbortController();
    }
    cancelReads() { this.pendingReads.abort(); this.pendingReads = new AbortController(); }
    invalidate() { this.generation++; this.cancelReads(); }
    serial(job) {
        const task = this.queue.catch(() => {}).then(() => this.lock(job));
        this.queue = task; return task;
    }
    async sync(snapshot, config, valid = () => true, progress = () => {}) {
        const generation = this.generation;
        const current = () => generation === this.generation && valid();
        const report = value => { if (current()) progress(value); };
        if (!current()) return null;
        report({ phase: 'preparing' });
        const prepared = await documents(snapshot, this.owner, config);
        if (!current()) return null;
        report({ phase: 'queued' });
        return this.serial(async () => {
            if (!current()) return null;
            report({ phase: 'checking' });
            await this.client.assertOwned(this.collection, this.owner);
            if (!current()) return null;
            const { scope, docs } = prepared;
            const ids = docs.map(d => d.id); const desired = new Set(ids);
            const previous = this.journal.read(scope);
            // Persist intent BEFORE requests; include uncertain writes after a timeout/reload.
            this.journal.write(scope, [...previous, ...ids]);
            const removed = previous.filter(id => !desired.has(id));
            if (removed.length) report({ phase: 'deleting', completed: 0, total: removed.length });
            for (let i = 0; i < removed.length; i += 100) {
                if (!current()) return null;
                const batch = removed.slice(i, i + 100);
                await this.client.deleteIds(this.collection, batch);
                batch.forEach(id => this.acknowledged.delete(id));
                report({ phase: 'deleting', completed: i + batch.length, total: removed.length });
            }
            const pending = docs.filter(d => !this.acknowledged.has(d.id));
            const confirmed = docs.length - pending.length;
            report({ phase: 'uploading', completed: confirmed, total: docs.length });
            for (let i = 0; i < pending.length; i += 50) {
                if (!current()) return null;
                const batch = pending.slice(i, i + 50);
                await this.client.upsert(this.collection, batch);
                batch.forEach(d => this.acknowledged.add(d.id));
                report({ phase: 'uploading', completed: confirmed + i + batch.length, total: docs.length });
            }
            if (!current()) return null;
            this.journal.write(scope, ids);
            return prepared;
        });
    }
    async retrieve(snapshot, config, countTokens, valid = () => true, progress = () => {}, type = 'normal') {
        const generation = this.generation;
        const pendingReads = this.pendingReads.signal;
        const sourceCurrent = () => generation === this.generation && valid();
        const current = () => !pendingReads.aborted && sourceCurrent();
        // Canceling a prompt's reads must not cancel its source reconciliation.
        const prepared = await this.sync(snapshot, config, sourceCurrent, progress);
        if (!prepared || !current()) return null;
        if (!prepared.docs.length) return { text: '', tokens: 0, passages: [] };
        const queries = retrievalQueries(snapshot, type);
        if (!queries.length) return null;
        const reads = new AbortController();
        const signal = AbortSignal.any([pendingReads, reads.signal]);
        let results;
        try {
            let completed = 0;
            progress({ phase: 'searching', completed, total: queries.length });
            results = await Promise.all(queries.map(async query => {
                const hits = await this.client.search(this.collection, this.owner, prepared.scope, query, signal);
                if (current() && !signal.aborted) progress({ phase: 'searching', completed: ++completed, total: queries.length });
                return hits;
            }));
        } finally { reads.abort(); }
        if (!current()) return null;
        progress({ phase: 'budgeting' });
        const result = await selectMemory(interleaveHits(results), prepared.docs, config.budget, countTokens);
        return current() ? result : null;
    }
    async deleteAll() {
        this.invalidate();
        await this.serial(async () => {
            await this.client.deleteOwnedCollection(this.collection, this.owner);
            this.journal.clear(); this.acknowledged.clear();
        });
    }
}
