import { ConnectionError, connectionConfig } from './client.js';
import { embeddingConfig } from './embedding.js';

// Browser persistence is a convenience, not an isolated or encrypted secret vault.
// Keep credentials separate from ordinary settings, scoped to the native account
// owner and exact normalized LambdaDB endpoint/project.
export class SavedKey {
    constructor(storage, owner) {
        if (!/^[a-f0-9]{32}$/.test(owner)) throw new ConnectionError('Invalid account identity.');
        this.storage = storage;
        this.owner = owner;
    }
    id() { return `sillymemory:credential:${this.owner}`; }
    scope(config) { return connectionConfig(config); }
    get forgetAction() { return 'Forget key'; }
    read(config) {
        try {
            const raw = this.storage.getItem(this.id());
            if (raw === null) return null;
            const record = JSON.parse(raw);
            if (record?.version !== 1 || typeof record.key !== 'string' || !record.key.trim()) throw new Error();
            return JSON.stringify(this.scope(record)) === JSON.stringify(this.scope(config)) ? record.key.trim() : null;
        } catch {
            throw new ConnectionError(`Saved key could not be read. Click ${this.forgetAction}, then save your key again.`, 0, 'credential-storage');
        }
    }
    save(config, key) {
        if (typeof key !== 'string' || !key.trim()) throw new ConnectionError('Enter your project API key.');
        try { this.storage.setItem(this.id(), JSON.stringify({ version: 1, ...this.scope(config), key: key.trim() })); }
        catch { throw new ConnectionError('The key could not be saved. Allow browser storage, then save and connect again.', 0, 'credential-storage'); }
    }
    commit(config, key, state) {
        const stateId = `sillymemory:state:${this.owner}`;
        let previous;
        try {
            previous = this.storage.getItem(stateId);
            this.storage.setItem(stateId, JSON.stringify(state));
        } catch {
            throw new ConnectionError('Connection could not be saved. Previous saved connection preserved. Allow browser storage, then save and connect again.', 0, 'credential-storage');
        }
        // Write the credential last: a failed atomic setItem cannot replace the
        // previous key. If that write fails, restore the ordinary settings bytes.
        try { this.save(config, key); }
        catch {
            try {
                if (previous === null) this.storage.removeItem(stateId);
                else this.storage.setItem(stateId, previous);
            } catch {
                throw new ConnectionError(`Connection save failed and settings rollback could not finish. The previous key was preserved; allow browser storage, then click ${this.forgetAction} before reconnecting.`, 0, 'credential-storage');
            }
            throw new ConnectionError('Connection could not be saved. Previous saved connection preserved. Allow browser storage, then save and connect again.', 0, 'credential-storage');
        }
    }
    forget() {
        try { this.storage.removeItem(this.id()); }
        catch { throw new ConnectionError(`The saved key could not be removed. Allow browser storage, then click ${this.forgetAction} again.`, 0, 'credential-storage'); }
    }
    forgetMatching(config, key) {
        if (this.read(config) !== key.trim()) return false;
        this.forget();
        return true;
    }
}

// The optional text-private embedding key: its own record, scoped to the native
// account owner and the exact normalized embedding base URL and model.
export class EmbeddingKey extends SavedKey {
    id() { return `sillymemory:embedding-credential:${this.owner}`; }
    scope(config) { const { baseUrl, model } = embeddingConfig(config); return { baseUrl, model }; }
    get forgetAction() { return 'Forget embedding key'; }
}
