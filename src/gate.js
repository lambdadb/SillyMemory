import { ConnectionError, scopeFilter } from './client.js';

export async function poll(check, { attempts = 30, delayMs = 1000 } = {}) {
    for (let i = 0; i < attempts; i++) {
        try { if (await check()) return; } catch (e) {
            if (![429, 500, 502, 503, 504].includes(e.status)) throw e;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new ConnectionError('Timed out waiting for query visibility. Cleanup is still required.');
}

// This gate only sends synthetic text. Keep the collection name before creating it,
// so an ambiguous create timeout can be recovered by the cleanup button after reload.
export async function runTransportGate(client, owner, collection, report = () => {}) {
    const scope = 'a'.repeat(64);
    const id = `gate_${owner}`;
    const doc = { id, owner, scope, revision: '1', text: 'Synthetic story: Mira hid the blue compass beneath the cedar tree.' };
    let passed = false;
    try {
        report('Creating dedicated synthetic test collection…');
        await client.create(collection, owner);
        await poll(async () => { await client.upsert(collection, [doc]); return true; });
        report('Checking managed queryText retrieval directly from this browser…');
        await poll(async () => (await client.search(collection, owner, scope, 'Where is the blue compass?')).some(x => x.id === id && x.text === doc.text));
        await client.deleteIds(collection, [id]);
        await poll(async () => !(await client.query(collection, scopeFilter(owner, scope))).some(x => x.id === id));
        passed = true;
    } finally {
        report('Deleting the owned test collection and checking disappearance…');
        await client.deleteOwnedCollection(collection, owner);
    }
    if (passed) report('Transport gate passed: synthetic upsert, managed query, document deletion, and collection cleanup.');
    return passed;
}
