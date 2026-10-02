import { ConnectionError } from './client.js';
import { digest } from './memory.js';

const idPattern = /^[a-f0-9]{32}$/;
export const ownedMemoryName = name => /^(smchat_[a-f0-9]{40}|sillymemory_[a-f0-9]{32})$/.test(name);
export async function chatCollection(snapshot, owner) {
    const scope = await digest(JSON.stringify([owner, snapshot.character, snapshot.chat]));
    return { collection: `smchat_${scope.slice(0, 40)}`, scope };
}

// Native branches change integrity but can inherit extension metadata. Imports
// can copy both, so also check the host inventory before accepting an ID.
export async function ensureChatIdentity(ctx, saveChat, valid = () => true, fetcher = fetch) {
    const avatar = ctx.characters[ctx.characterId]?.avatar, file = ctx.getCurrentChatId();
    if (ctx.groupId || !avatar || !file) throw new ConnectionError('Select a supported character chat.');
    const request = async (url, body) => {
        const response = await fetcher(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
        if (!response.ok) throw new ConnectionError('Could not verify chat identity on the SillyTavern server.');
        return response.json();
    };
    const inventory = await request('/api/characters/chats', { avatar_url: avatar, metadata: true });
    if (!Array.isArray(inventory)) throw new ConnectionError('Could not read the chat inventory. Save the chat and retry.');
    if (!valid()) return false;
    let id = ctx.chatMetadata.sillymemory?.id;
    const duplicate = inventory.some(chat => chat.file_name !== `${file}.jsonl` && chat.chat_metadata?.sillymemory?.id === id);
    let changed = false;
    if (!idPattern.test(id || '') || duplicate || ctx.chatMetadata.sillymemory?.integrity !== ctx.chatMetadata.integrity) {
        id = crypto.randomUUID().replaceAll('-', '');
        ctx.chatMetadata.sillymemory = { id, integrity: ctx.chatMetadata.integrity };
        changed = true;
    }
    const saved = inventory.find(chat => chat.file_name === `${file}.jsonl`)?.chat_metadata;
    if (changed || saved?.sillymemory?.id !== id || saved?.integrity !== ctx.chatMetadata.integrity) {
        // saveChat captures filename, metadata, avatar and chat before its first
        // await. Unlike the debounced metadata helper it cannot switch targets.
        await saveChat();
        if (!valid()) return false;
    }
    const stored = await request('/api/chats/get', { avatar_url: avatar, file_name: file });
    if (!valid()) return false;
    if (stored?.[0]?.chat_metadata?.sillymemory?.id !== id || stored?.[0]?.chat_metadata?.integrity !== ctx.chatMetadata.integrity) throw new ConnectionError('Chat identity was not saved. Save the chat and retry.');
    return true;
}

export class ChatCollections {
    constructor(client, owner, remember, forget) {
        Object.assign(this, { client, owner, remember, forget });
    }
    async ensure(snapshot, valid = () => true) {
        const entry = await chatCollection(snapshot, this.owner);
        if (!valid()) return null;
        this.remember(entry); // Persist intent before even a possibly ambiguous create.
        try { await this.client.assertOwned(entry.collection, this.owner, undefined, entry.scope); }
        catch (error) {
            if (error.status !== 404) throw error;
            if (!valid()) return null;
            try { await this.client.create(entry.collection, this.owner, entry.scope); }
            catch (error) { if (error.status !== 409) throw error; }
            await this.client.assertOwned(entry.collection, this.owner, undefined, entry.scope);
        }
        return valid() ? entry : null;
    }
    async delete(entry) {
        await this.client.deleteOwnedCollection(entry.collection, this.owner, entry.scope);
        this.forget(entry.collection); // Retain a failed or uncertain deletion for retry.
    }
    async discover() {
        return (await this.client.listOwned(this.owner)).filter(c => ownedMemoryName(c.collectionName))
            .map(c => ({ collection: c.collectionName, ...(c.tags.chat ? { scope: c.tags.chat } : {}) }));
    }
}
