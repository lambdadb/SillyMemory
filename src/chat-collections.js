import { clearCommit, recordCommitted, waitForCommit } from './commit.js';
import { ConnectionError, analyzerList, collectionAnalyzers } from './client.js';
import { poll } from './gate.js';
import { chatOwner, digest, documents, options, withoutText } from './memory.js';

const idPattern = /^[a-f0-9]{32}$/;
export const ownedMemoryName = name => /^smstory_[a-f0-9]{40}$/.test(name);
export async function chatCollection(snapshot, owner) {
    if (!snapshot.memory || (!idPattern.test(snapshot.memory.story || '') || !idPattern.test(snapshot.chat || '') || (snapshot.memory.source && !idPattern.test(snapshot.memory.source)))) throw new ConnectionError('Invalid story memory identity.');
    const scope = await digest(JSON.stringify([owner, snapshot.character, snapshot.memory.story]));
    return { collection: `smstory_${scope.slice(0, 40)}`, scope, branch: `chat_${snapshot.chat}`, ...(snapshot.memory.source ? { source: `chat_${snapshot.memory.source}` } : {}) };
}

// Saved chats of the open chat's owner. A character chat is read under its
// avatar. A group chat is read by its ID; the group's chat list with each
// file's metadata header forms the inventory. read() returns null on failure.
export function hostChats(ctx, fetcher = fetch) {
    const post = (url, body) => fetcher(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
    const json = async (url, body) => {
        const response = await post(url, body);
        if (!response.ok) throw new ConnectionError('Could not verify chat identity on the SillyTavern server.');
        return response.json();
    };
    const read = (url, body) => post(url, body).then(response => response.ok ? response.json() : null);
    if (ctx.groupId) {
        const group = ctx.groups?.find(g => g.id === ctx.groupId);
        return {
            read: file => read('/api/chats/group/get', { id: file }),
            async inventory() {
                if (!Array.isArray(group?.chats)) return null;
                const chats = [];
                for (const id of group.chats) {
                    const rows = await json('/api/chats/group/get', { id });
                    chats.push({ file_name: `${id}.jsonl`, chat_metadata: Array.isArray(rows) ? rows[0]?.chat_metadata : undefined });
                }
                return chats;
            },
        };
    }
    const avatar = chatOwner(ctx);
    return {
        read: file => read('/api/chats/get', { avatar_url: avatar, file_name: file }),
        inventory: () => json('/api/characters/chats', { avatar_url: avatar, metadata: true }),
    };
}

// Native branches change integrity but can inherit extension metadata. Imports
// can copy both, so also check the host inventory before accepting an ID.
export async function ensureChatIdentity(ctx, saveChat, valid = () => true, fetcher = fetch) {
    const file = ctx.getCurrentChatId();
    if (!chatOwner(ctx) || !file) throw new ConnectionError('Select a supported chat.');
    const chats = hostChats(ctx, fetcher);
    const inventory = await chats.inventory();
    if (!Array.isArray(inventory)) throw new ConnectionError('Could not read the chat inventory. Save the chat and retry.');
    if (!valid()) return false;
    const memory = ctx.chatMetadata.sillymemory;
    if (memory && (memory.version !== 1 || !idPattern.test(memory.id || '') || !idPattern.test(memory.story || '') || (memory.source && !idPattern.test(memory.source)))) throw new ConnectionError('Invalid story memory identity.');
    let id = memory?.id;
    const duplicate = inventory.some(chat => chat.file_name !== `${file}.jsonl` && chat.chat_metadata?.sillymemory?.id === id
        && chat.chat_metadata?.sillymemory?.integrity === chat.chat_metadata?.integrity);
    let changed = false;
    if (!idPattern.test(id || '') || duplicate || ctx.chatMetadata.sillymemory?.integrity !== ctx.chatMetadata.integrity) {
        const old = ctx.chatMetadata.sillymemory;
        const parent = inventory.find(c => c.file_name === `${ctx.chatMetadata.main_chat}.jsonl`)?.chat_metadata;
        const nativeFork = old && old.integrity !== ctx.chatMetadata.integrity
            && parent?.sillymemory?.id === old.id && parent?.integrity === old.integrity
            && parent?.sillymemory?.story === old.story;
        id = crypto.randomUUID().replaceAll('-', '');
        ctx.chatMetadata.sillymemory = { version: 1, id, story: nativeFork ? old.story : id, integrity: ctx.chatMetadata.integrity,
            ...(nativeFork ? { source: old.id } : {}) };
        changed = true;
    }
    const saved = inventory.find(chat => chat.file_name === `${file}.jsonl`)?.chat_metadata;
    if (changed || JSON.stringify(saved?.sillymemory) !== JSON.stringify(ctx.chatMetadata.sillymemory) || saved?.integrity !== ctx.chatMetadata.integrity) {
        // saveChat and saveGroupChat capture the target file, metadata and chat
        // before their first await. Unlike the debounced metadata helper they
        // cannot switch targets.
        await saveChat();
        if (!valid()) return false;
    }
    const stored = await chats.read(file);
    if (stored === null) throw new ConnectionError('Could not verify chat identity on the SillyTavern server.');
    if (!valid()) return false;
    if (JSON.stringify(stored?.[0]?.chat_metadata?.sillymemory) !== JSON.stringify(ctx.chatMetadata.sillymemory) || stored?.[0]?.chat_metadata?.integrity !== ctx.chatMetadata.integrity) throw new ConnectionError('Chat identity was not saved. Save the chat and retry.');
    return true;
}

// A story keeps the memory mode and embedding identity it was created with.
// Before any sync or search, a different current setting stops with a rebuild offer.
export function checkStoryMode(result, textPrivate) {
    const tags = result?.collection?.tags || {};
    let message;
    if (!textPrivate) {
        if (tags.memory_mode === undefined) return;
        message = 'This story’s memory is text-private, but text-private memory is now off. Use Rebuild story memory to switch this story to the default mode, or turn text-private memory back on.';
    } else if (tags.memory_mode !== 'text_private') {
        message = 'This story’s memory was created in the default mode. Use Rebuild story memory to make it text-private, or turn text-private memory off.';
    } else if (tags.embedding !== textPrivate.tags.embedding) {
        message = 'This story’s memory was created with a different embedding model, prefixes or vector dimension. Use Rebuild story memory to apply the current embedding settings, or restore the previous ones.';
    } else return;
    throw new ConnectionError(message, 0, 'memory-mode');
}

export class ChatCollections {
    constructor(client, owner, remember, forget) {
        Object.assign(this, { client, owner, remember, forget });
    }
    async ensure(snapshot, valid = () => true, config = options(), progress = () => {}) {
        const entry = await chatCollection(snapshot, this.owner);
        if (!valid()) return null;
        this.remember(entry); // Persist intent before even a possibly ambiguous create.
        let collection, analyzers;
        try { collection = await this.client.assertOwned(entry.collection, this.owner, undefined, entry.scope); }
        catch (error) {
            if (error.status !== 404) throw error;
            if (!valid()) return null;
            let created;
            try { created = await this.client.create(entry.collection, this.owner, entry.scope, config.analyzers, config.textPrivate); }
            catch (error) { if (error.status !== 409) throw error; }
            // A 201 body describes the new collection; a conflict or lost response needs a fresh read.
            if (created?.collection) {
                collection = this.client.verifyOwned(created, this.owner, entry.scope);
                // The service's 201 body omits indexConfigs; it accepted exactly the requested schema.
                if (!created.collection.indexConfigs) analyzers = analyzerList(config.analyzers);
            } else collection = await this.client.assertOwned(entry.collection, this.owner, undefined, entry.scope);
        }
        checkStoryMode(collection, config.textPrivate);
        // The analyzers actually indexed; the setting only applies when a collection is created.
        // A text-private story has no text field and no analyzers.
        if (config.textPrivate) analyzers = undefined;
        else analyzers ??= collectionAnalyzers(collection);
        {
            const branches = await this.client.branches(entry.collection);
            if (!valid()) return null;
            if (!branches.some(b => b.name === entry.branch)) {
                const source = branches.some(b => b.name === entry.source) ? entry.source : 'main';
                if (source !== 'main' && !await waitForCommit(this.client, entry.collection, source, valid)) {
                    progress({ phase: 'committing' });
                    const { docs: local } = await documents(snapshot, this.owner, config);
                    // A text-private story stores every field except the text.
                    const docs = config.textPrivate ? local.map(withoutText) : local;
                    // Wait for acknowledged, matching inherited text to commit. A
                    // consistent read alone is not proof that a fork will copy it.
                    for (let i = 0; i < docs.length; i += 100) {
                        if (!valid()) return null;
                        const batch = docs.slice(i, i + 100), desired = new Map(batch.map(d => [d.id, d]));
                        const pending = (await this.client.fetchDocs(entry.collection, batch.map(d => d.id), source))
                            .filter(d => desired.has(d.id) && Object.keys(desired.get(d.id)).every(k => d[k] === desired.get(d.id)[k]));
                        if (pending.length) await poll(async () => {
                            if (!valid()) throw new ConnectionError('Chat changed before memory fork.');
                            const committed = await this.client.fetchDocs(entry.collection, pending.map(d => d.id), source, false);
                            return pending.every(d => committed.some(c => c.id === d.id && Object.keys(desired.get(d.id)).every(k => c[k] === d[k])));
                        }, { attempts: 120, delayMs: 1000 });
                    }
                }
                if (!valid()) return null;
                clearCommit(this.client, entry.collection, entry.branch);
                let created = false, confirmed = false;
                try { confirmed = (await this.client.createBranch(entry.collection, entry.branch, source))?.branch?.name === entry.branch; created = true; }
                catch (error) { if (error.status !== 409) throw error; }
                // A 201 body names the new branch; a conflict or other response needs a fresh list.
                if (!confirmed && !(await this.client.branches(entry.collection)).some(b => b.name === entry.branch)) throw new ConnectionError('Memory branch creation is not confirmed. Retry synchronization.');
                if (created) recordCommitted(this.client, entry.collection, entry.branch);
            }
        }
        return valid() ? { ...entry, analyzers } : null;
    }
    async delete(entry) {
        clearCommit(this.client, entry.collection, entry.branch);
        if (entry.branch) {
            try {
                await this.client.assertOwned(entry.collection, this.owner, undefined, entry.scope);
                await this.client.deleteBranch(entry.collection, entry.branch);
            } catch (e) { if (e.status !== 404) throw e; }
        } else await this.client.deleteOwnedCollection(entry.collection, this.owner, entry.scope);
        this.forget(entry.collection, entry.branch); // Retain a failed or uncertain deletion for retry.
    }
    async discover() {
        return (await this.client.listOwned(this.owner)).filter(c => ownedMemoryName(c.collectionName))
            .map(c => ({ collection: c.collectionName, ...(c.tags.chat ? { scope: c.tags.chat } : {}) }));
    }
}
