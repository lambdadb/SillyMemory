import { ConnectionError, connectionConfig } from './client.js';

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
    read(config) {
        try {
            const raw = this.storage.getItem(this.id());
            if (raw === null) return null;
            const record = JSON.parse(raw);
            if (record?.version !== 1 || typeof record.key !== 'string' || !record.key.trim()) throw new Error();
            const stored = connectionConfig(record), target = connectionConfig(config);
            return stored.endpoint === target.endpoint && stored.project === target.project ? record.key.trim() : null;
        } catch {
            throw new ConnectionError('Saved key could not be read. Click Forget key, then save your key again.', 0, 'credential-storage');
        }
    }
    save(config, key) {
        if (typeof key !== 'string' || !key.trim()) throw new ConnectionError('Enter your project API key.');
        try { this.storage.setItem(this.id(), JSON.stringify({ version: 1, ...connectionConfig(config), key: key.trim() })); }
        catch { throw new ConnectionError('The key could not be saved. Allow browser storage, then save and connect again.', 0, 'credential-storage'); }
    }
    forget() {
        try { this.storage.removeItem(this.id()); }
        catch { throw new ConnectionError('The saved key could not be removed. Allow browser storage, then click Forget key again.', 0, 'credential-storage'); }
    }
    forgetMatching(config, key) {
        if (this.read(config) !== key.trim()) return false;
        this.forget();
        return true;
    }
}
