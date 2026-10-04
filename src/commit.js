import { ConnectionError } from './client.js';
import { poll } from './gate.js';

// Session-only knowledge: never infer write order from transcript order or a
// persisted ID journal. LambdaDB commits a branch's ordered writes in order.
const receipts = new WeakMap();
const key = (collection, branch) => `${collection}:${branch}`;
export const sameDocument = (expected, actual) => Boolean(actual) && Object.keys(expected).every(k => expected[k] === actual[k]);
function entries(client) {
    if (!receipts.has(client)) receipts.set(client, new Map());
    return receipts.get(client);
}
export function clearCommit(client, collection, branch) {
    const saved = entries(client);
    if (branch) saved.delete(key(collection, branch));
    else for (const k of saved.keys()) if (k.startsWith(`${collection}:`)) saved.delete(k);
}
export function recordCommitted(client, collection, branch) {
    entries(client).set(key(collection, branch), { known: true, committed: true, writes: new Set() });
}
export function beginWrites(client, collection, branch, documents) {
    const saved = entries(client), name = key(collection, branch), previous = saved.get(name);
    const writes = new Set(previous?.writes), last = documents.at(-1);
    const usable = Boolean(previous?.known && last && !writes.has(last.id));
    documents.forEach(d => writes.add(d.id));
    saved.set(name, { known: previous?.known === true, committed: false, writes });
    return usable;
}
export function recordWrite(client, collection, branch, document) {
    const receipt = entries(client).get(key(collection, branch));
    if (receipt?.known) receipt.document = structuredClone(document);
}
export async function waitForCommit(client, collection, branch, valid = () => true) {
    const saved = entries(client), receipt = saved.get(key(collection, branch));
    const current = () => {
        if (!valid() || saved.get(key(collection, branch)) !== receipt) throw new ConnectionError('Chat changed before memory commit confirmation.');
    };
    current();
    if (!receipt?.known || (!receipt.committed && !receipt.document)) return false; // Unknown order or no distinct write witness.
    if (!receipt.committed) {
        await poll(async () => {
            current();
            const docs = await client.fetchDocs(collection, [receipt.document.id], branch, false);
            current();
            return docs.some(doc => sameDocument(receipt.document, doc));
        }, { attempts: 120, delayMs: 1000 });
        current(); receipt.committed = true; receipt.writes.clear();
    }
    return true;
}
