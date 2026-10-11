import { beginWrites, clearCommit, recordWrite, sameDocument } from './commit.js';
import { queryAnchor } from './context.js';
import { chunkSpans, CHUNKING_POLICY } from './chunking.js';
import { hostTimestamp, conversationTime, conversationTimeLabel } from './time.js';

export const DEFAULTS = Object.freeze({ budget: 4096, chunkChars: 800 });
export function options(value = {}) {
    const integer = (x, fallback, min, max) => Number.isInteger(Number(x)) ? Math.min(max, Math.max(min, Number(x))) : fallback;
    return { budget: integer(value.budget, DEFAULTS.budget, 64, 4096), chunkChars: integer(value.chunkChars, 800, 200, 2000) };
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
    const messages = context.chat.filter(x => !x.is_system).map((m, index) => {
        const recordedAt = hostTimestamp(m.send_date);
        return {
            index, text: typeof m.mes === 'string' ? m.mes : '', name: String(m.name || (m.is_user ? 'User' : 'Character')),
            user: Boolean(m.is_user), swipe: m.swipe_id ?? 0,
            eligible: !m.extra?.file && !m.extra?.media?.length && !m.extra?.tool_invocations?.length,
            ...(recordedAt ? { recordedAt } : {}),
        };
    });
    const metadata = context.chatMetadata?.sillymemory;
    return { character: avatar, chat: metadata?.id, messages, memory: { story: metadata?.story, source: metadata?.source } };
}
export function fingerprint(snapshot) { return JSON.stringify(snapshot); }
export const RETRIEVAL_POLICY = 'current-question-v8';
export function retrievalQueries(snapshot, type = 'normal') {
    const messages = snapshot.messages;
    const anchor = queryAnchor(messages, type);
    if (anchor < 0) return [];
    return [messages[anchor].text.trim()];
}
// Storage is independent of generation input retention. A trailing
// user input is pending until the assistant replies; completed replies are stored.
export function completedMessages(snapshot) {
    return snapshot.messages.at(-1)?.user ? snapshot.messages.slice(0, -1) : snapshot.messages;
}
export function memoryBoundary(snapshot, type = 'normal') {
    // Normal/regenerate/swipe keep only their question; Continue keeps the
    // message being extended. Replacement answers never enter retrieval.
    return Math.max(0, queryAnchor(snapshot.messages, type));
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
export function chunks(text, limit) { return chunkSpans(text, limit).map(span => span.text); }
export async function documents(snapshot, owner, config) {
    if (!snapshot.memory?.story || !snapshot.chat) throw new Error('Missing story memory identity.');
    const scope = await digest(JSON.stringify([owner, snapshot.character, snapshot.memory.story]));
    const docs = [];
    for (const m of completedMessages(snapshot)) {
        if (!m.eligible || !m.text.trim()) continue;
        const time = conversationTime(m);
        const revision = await digest(JSON.stringify([m.index, m.name, m.user, m.swipe, m.text, time]));
        for (const [chunk, { start, end, text }] of chunkSpans(m.text, config.chunkChars).entries()) {
            docs.push({ id: `${scope}_${revision}_${CHUNKING_POLICY}_${chunk}_${start}_${end}`, owner, scope, revision, text, start, end, message: m.index, chunk, speaker: m.name, role: m.user ? 'user' : 'assistant', ...time });
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
        mes: `[Past conversation excerpt: ${d.role} ${JSON.stringify(literal(d.speaker))}, message ${d.message + 1}, passage ${d.chunk + 1}]\n${conversationTimeLabel(d)}${literal(d.text)}`,
    }));
}
const wrap = passages => memoryMessages(passages).map(m => m.mes).join('\n');
export async function selectMemory(hits, expected, budget, countTokens) {
    const valid = new Map(expected.map(x => [x.id, x]));
    const selected = []; const seen = new Set();
    for (const hit of hits) {
        const doc = valid.get(hit?.id);
        // The remote response is only a ranking signal. Inject current local source text.
        if (!doc || seen.has(doc.id) || hit.scope !== doc.scope || hit.owner !== doc.owner || hit.revision !== doc.revision || hit.text !== doc.text || hit.conversationTimestamp !== doc.conversationTimestamp || hit.timestampSource !== doc.timestampSource) continue;
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

const repeatedKey = doc => JSON.stringify([doc.owner, doc.scope, doc.role, doc.speaker, doc.text, doc.conversationTimestamp, doc.timestampSource]);

// Preserve every selected source coordinate and full verbatim body. A repeated
// excerpt is placed at its latest occurrence, with all occurrences named, so a
// later repetition is not silently presented as an earlier, superseded state.
function repeatedEntries(passages) {
    const groups = new Map();
    for (const doc of [...passages].sort((a, b) => a.message - b.message || a.chunk - b.chunk)) {
        const key = repeatedKey(doc), group = groups.get(key) || [];
        group.push(doc); groups.set(key, group);
    }
    return [...groups.values()].map(group => {
        const last = group.at(-1), message = memoryMessages([last])[0];
        if (group.length > 1) {
            message.mes = `[Past conversation excerpt: ${last.role} ${JSON.stringify(literal(last.speaker))}, identical text at message:passage ${group.map(doc => `${doc.message + 1}:${doc.chunk + 1}`).join(', ')}]\n${conversationTimeLabel(last)}${literal(last.text)}`;
        }
        return { docs: group, last, message };
    }).sort((a, b) => a.last.message - b.last.message || a.last.chunk - b.last.chunk);
}

const repeatedMessages = passages => repeatedEntries(passages).map(entry => entry.message);
const messageIdentity = doc => JSON.stringify([doc.owner, doc.scope, doc.revision, doc.message, doc.role, doc.speaker, doc.conversationTimestamp, doc.timestampSource]);
const passageNumbers = docs => {
    const ranges = [];
    for (const number of [...new Set(docs.map(doc => doc.chunk + 1))].sort((a, b) => a - b)) {
        const last = ranges.at(-1);
        if (last && number === last[1] + 1) last[1] = number;
        else ranges.push([number, number]);
    }
    return ranges.map(([start, end]) => start === end ? String(start) : `${start}-${end}`).join(', ');
};

// Join only returned text. Offsets are UTF-16 positions, not code-point counts.
// Missing intervals stay explicit; conflicting overlaps retain separate excerpts.
function joinedText(docs) {
    const ranges = [];
    const sorted = [...docs].sort((a, b) => a.start - b.start || a.end - b.end);
    for (const [index, doc] of sorted.entries()) {
        if (!Number.isInteger(doc.start) || !Number.isInteger(doc.end) || doc.start < 0 || doc.end <= doc.start
            || doc.end - doc.start !== doc.text.length || !Number.isInteger(doc.chunk) || doc.chunk < 0
            || (index && doc.chunk < sorted[index - 1].chunk)) return null;
        const last = ranges.at(-1);
        if (!last || doc.start > last.end) { ranges.push({ start: doc.start, end: doc.end, text: doc.text }); continue; }
        const overlap = Math.min(last.end, doc.end) - doc.start;
        if (last.text.slice(doc.start - last.start, doc.start - last.start + overlap) !== doc.text.slice(0, overlap)) return null;
        if (doc.end > last.end) { last.text += doc.text.slice(last.end - doc.start); last.end = doc.end; }
    }
    return ranges.map(range => literal(range.text)).join('\n[Omitted original text between excerpts]\n');
}

export function packedMemoryMessages(passages) {
    const runs = [];
    for (const entry of repeatedEntries(passages)) {
        const previous = runs.at(-1);
        // Repeated text keeps all citations at its latest occurrence as an opaque block.
        if (entry.docs.length === 1 && previous?.every(item => item.docs.length === 1)
            && messageIdentity(previous[0].last) === messageIdentity(entry.last)) previous.push(entry);
        else runs.push([entry]);
    }
    return runs.flatMap(run => {
        if (run.length === 1) return [run[0].message];
        const docs = run.map(entry => entry.last), body = joinedText(docs), last = docs.at(-1);
        if (body === null) return run.map(entry => entry.message);
        return [{ index: last.message, name: literal(last.speaker), is_user: last.role === 'user', is_system: false,
            mes: `[Past conversation excerpt: ${last.role} ${JSON.stringify(literal(last.speaker))}, message ${last.message + 1}, passages ${passageNumbers(docs)}]\n${conversationTimeLabel(last)}${body}` }];
    });
}

async function selectRepeatedMemory(hits, expected, budget, countTokens) {
    // Establish the shipped whole-passage selection first. Packing may add
    // sources but can never evict any passage that the baseline already kept.
    const baseline = await selectMemory(hits, expected, budget, countTokens);
    if (!baseline.passages.length) return baseline;
    const selected = [...baseline.passages], content = new Set(selected.map(repeatedKey));
    if (content.size === selected.length) return baseline;
    return refillMemory(hits, expected, baseline, budget, countTokens, repeatedMessages);
}

async function refillMemory(hits, expected, baseline, budget, countTokens, renderMessages, tryCandidateAssembly = false) {
    const selected = [...baseline.passages], content = new Set(selected.map(repeatedKey));
    const render = docs => {
        const messages = renderMessages(docs);
        return { messages, text: messages.map(message => message.mes).join('\n') };
    };
    const count = async text => {
        const tokens = await countTokens(text);
        if (!Number.isFinite(tokens) || tokens < 0) throw new Error('Token counting unavailable.');
        return tokens;
    };
    let result = render(selected);
    let tokens = result.text === baseline.text ? baseline.tokens : await count(result.text);
    if (result.text === baseline.text || tokens >= baseline.tokens) {
        if (!tryCandidateAssembly) return baseline; // Short repetitions may cost more to label.
        // Adding a rejected adjacent chunk can save its header even when the
        // selected chunks alone do not assemble. Keep the exact floor meanwhile.
        result = { text: baseline.text, messages: baseline.messages }; tokens = baseline.tokens;
    }
    const valid = new Map(expected.map(doc => [doc.id, doc])), seen = new Set(selected.map(doc => doc.id));
    for (const hit of hits) {
        const doc = valid.get(hit?.id);
        if (!doc || seen.has(doc.id) || ['scope', 'owner', 'revision', 'text', 'conversationTimestamp', 'timestampSource'].some(key => hit[key] !== doc[key])) continue;
        seen.add(doc.id);
        // Spend the saved space on distinct content, not more repeat citations.
        if (content.has(repeatedKey(doc))) continue;
        const candidate = render([...selected, doc]), trial = await count(candidate.text);
        if (trial <= budget) { selected.push(doc); content.add(repeatedKey(doc)); result = candidate; tokens = trial; }
    }
    return { ...result, tokens, passages: selected };
}

export async function selectPackedMemory(hits, expected, budget, countTokens) {
    // Preserve the current repeated-passage selection, including its refilled sources.
    const baseline = await selectRepeatedMemory(hits, expected, budget, countTokens);
    if (!baseline.passages.length) return baseline;
    return refillMemory(hits, expected, baseline, budget, countTokens, packedMemoryMessages, true);
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
    constructor({ client, owner, collection, scope, branch, journal, lock = job => job() }) {
        if (!branch || branch === 'main') throw new Error('A chat memory branch is required.');
        Object.assign(this, { client, owner, collection, scope, branch, journal, lock });
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
            if (this.scope && prepared.scope !== this.scope) throw new Error('Chat collection scope changed.');
            await this.client.assertOwned(this.collection, this.owner, undefined, this.scope);
            if (!current()) return null;
            const { scope, docs } = prepared;
            const ids = docs.map(d => d.id); const desired = new Set(ids);
            let previous = this.journal.read(scope), committed;
            if (!this.remoteLoaded) {
                // A journal is not an acknowledgement. Inspect remote content after
                // fork/reload or an uncertain write before deciding what to resubmit.
                const remote = await this.client.listDocs(this.collection, this.branch);
                committed = new Map(remote.map(d => [d.id, d]));
                if (!current()) return null;
                if (remote.some(d => d.owner !== this.owner || d.scope !== scope || typeof d.id !== 'string')) throw new Error('Unexpected document ownership in memory branch.');
                previous = [...new Set([...previous, ...remote.map(d => d.id)])];
                this.acknowledged.clear();
                const expected = new Map(docs.map(d => [d.id, d]));
                for (let i = 0; i < ids.length; i += 100) {
                    const found = await this.client.fetchDocs(this.collection, ids.slice(i, i + 100), this.branch);
                    if (!current()) return null;
                    for (const d of found) {
                        const wanted = expected.get(d.id);
                        if (wanted && Object.keys(wanted).every(k => wanted[k] === d[k])) this.acknowledged.add(d.id);
                    }
                }
                this.remoteLoaded = true;
            }
            // Persist intent BEFORE requests; include uncertain writes after a timeout/reload.
            this.journal.write(scope, [...previous, ...ids]);
            const removed = previous.filter(id => !desired.has(id));
            const pending = docs.filter(d => !this.acknowledged.has(d.id));
            let witness;
            if (removed.length || pending.length) {
                const usable = beginWrites(this.client, this.collection, this.branch, pending);
                const last = pending.at(-1); // Last actual upsert, not last transcript chunk.
                if (usable) {
                    const old = committed ? committed.get(last.id)
                        : (await this.client.fetchDocs(this.collection, [last.id], this.branch, false)).find(d => d.id === last.id);
                    if (!current()) return null;
                    // A reinsert may already be visible in old committed data while
                    // its deletion/reinsert is pending. It cannot prove this write.
                    if (!sameDocument(last, old)) witness = last;
                }
            }
            if (removed.length) report({ phase: 'deleting', completed: 0, total: removed.length });
            for (let i = 0; i < removed.length; i += 100) {
                if (!current()) return null;
                const batch = removed.slice(i, i + 100);
                await this.client.deleteIds(this.collection, batch, undefined, this.branch);
                batch.forEach(id => this.acknowledged.delete(id));
                report({ phase: 'deleting', completed: i + batch.length, total: removed.length });
            }
            const confirmed = docs.length - pending.length;
            report({ phase: 'uploading', completed: confirmed, total: docs.length });
            for (let i = 0; i < pending.length; i += 50) {
                if (!current()) return null;
                const batch = pending.slice(i, i + 50);
                await this.client.upsert(this.collection, batch, undefined, this.branch);
                batch.forEach(d => this.acknowledged.add(d.id));
                report({ phase: 'uploading', completed: confirmed + i + batch.length, total: docs.length });
            }
            if (!current()) return null;
            this.journal.write(scope, ids);
            if (witness) recordWrite(this.client, this.collection, this.branch, witness);
            return prepared;
        }).catch(error => { this.remoteLoaded = false; clearCommit(this.client, this.collection, this.branch); throw error; });
    }
    async retrieve(snapshot, config, countTokens, valid = () => true, progress = () => {}, type = 'normal') {
        const generation = this.generation;
        const pendingReads = this.pendingReads.signal;
        const sourceCurrent = () => generation === this.generation && valid();
        const current = () => !pendingReads.aborted && sourceCurrent();
        // Canceling a prompt's reads must not cancel its source reconciliation.
        const prepared = await this.sync(snapshot, config, sourceCurrent, progress);
        if (!prepared || !current()) return null;
        const before = memoryBoundary(snapshot, type);
        const expected = prepared.docs.filter(doc => doc.message < before);
        if (!expected.length) return { text: '', tokens: 0, passages: [], messages: [] };
        const queries = retrievalQueries(snapshot, type);
        if (!queries.length) return null;
        const reads = new AbortController();
        const signal = AbortSignal.any([pendingReads, reads.signal]);
        let results;
        try {
            progress({ phase: 'searching', completed: 0, total: 1 });
            results = await this.client.search(this.collection, this.owner, prepared.scope, queries[0], signal, this.branch, before);
            if (current() && !signal.aborted) progress({ phase: 'searching', completed: 1, total: 1 });
        } finally { reads.abort(); }
        if (!current()) return null;
        progress({ phase: 'budgeting' });
        const result = await selectPackedMemory(results, expected, config.budget, countTokens);
        return current() ? result : null;
    }
    async deleteAll() {
        this.invalidate();
        await this.serial(async () => {
            await this.client.assertOwned(this.collection, this.owner, undefined, this.scope);
            await this.client.deleteBranch(this.collection, this.branch);
            this.journal.clear(); this.acknowledged.clear();
        });
    }
}
