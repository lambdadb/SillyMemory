// Real LambdaDB operations, with response loss/delay injected in the browser.
// The failures are synthetic; this does not provoke an outage in the service.
export async function runLiveFaultScenarios(run, report) {
    report.faultInjection = 'Browser fetch wrapper withholds/discards real proxy responses; no service outage or load injection';
    await run('accepted live upsert with lost response remains in durable intent journal', async () => {
        const t = globalThis.liveTest;
        t.snapshot.messages[0].text = 'LIVE_UNCERTAIN: The compass is inside an amber box.';
        t.engine.invalidate();
        const fetcher = t.client.fetcher; let injected = false, failed = false;
        t.client.fetcher = async (...args) => {
            const response = await fetcher(...args);
            const target = decodeURIComponent(String(args[0]));
            if (!injected && target.endsWith('/docs/upsert') && response.ok) {
                injected = true; await response.arrayBuffer();
                throw new TypeError('Synthetic response loss after successful upstream write');
            }
            return response;
        };
        try { await t.engine.sync(t.snapshot, t.config); }
        catch (e) { failed = e.name === 'ConnectionError' && e.status === 0; }
        finally { t.client.fetcher = fetcher; }
        if (!injected || !failed) throw new Error('Response loss was not exercised');
        const desired = await t.documents(t.snapshot, t.owner, t.config);
        const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        await t.poll(async () => (await t.client.query(t.memoryCollection, scopeFilter(t.owner, desired.scope))).some(d => d.id === desired.docs[0].id));
        const journal = new t.Journal(localStorage, `live:${t.owner}`);
        if (!journal.read(desired.scope).includes(desired.docs[0].id)) throw new Error('Uncertain write missing from journal');
        t.uncertainId = desired.docs[0].id;
    });
    await run('fresh engine removes accepted live write after its source is deleted', async () => {
        const t = globalThis.liveTest;
        t.snapshot.messages.splice(0, 1); t.snapshot.messages.forEach((m, i) => { m.index = i; });
        t.engine = new t.MemoryEngine({ client: t.client, owner: t.owner, collection: t.memoryCollection, journal: new t.Journal(localStorage, `live:${t.owner}`) });
        await t.engine.sync(t.snapshot, t.config);
        const expected = await t.documents(t.snapshot, t.owner, t.config);
        const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        await t.poll(async () => {
            const docs = await t.client.query(t.memoryCollection, scopeFilter(t.owner, expected.scope));
            return !docs.some(d => d.id === t.uncertainId) && docs.length === expected.docs.length;
        });
        const recalled = await t.engine.retrieve(t.snapshot, t.config, text => SillyTavern.getContext().getTokenCountAsync(text));
        if (recalled?.text.includes('LIVE_UNCERTAIN')) throw new Error('Deleted uncertain write recalled');
    });
    await run('delayed real query response cannot cross an edit and engine invalidation', async () => {
        const t = globalThis.liveTest;
        t.snapshot.messages.unshift({ index: 0, text: 'LIVE_OLD_QUERY: The compass is in a silver chest.', name: 'Mira', user: false, swipe: 0, eligible: true });
        t.snapshot.messages.forEach((m, i) => { m.index = i; });
        await t.engine.sync(t.snapshot, t.config);
        const old = await t.documents(t.snapshot, t.owner, t.config);
        await t.poll(async () => (await t.client.search(t.memoryCollection, t.owner, old.scope, 'Where is the compass?')).some(d => d.id === old.docs[0].id));
        const { retrievalQueries } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const expectedQueries = retrievalQueries(t.snapshot).length;
        const fetcher = t.client.fetcher; let release, captured, claimed = 0, completed = 0;
        const ready = new Promise(r => { captured = r; });
        const barrier = new Promise(r => { release = r; });
        t.client.fetcher = async (...args) => {
            const response = await fetcher(...args);
            if (claimed < expectedQueries && decodeURIComponent(String(args[0])).endsWith('/query') && response.ok) {
                claimed++;
                const body = await response.text();
                if (!body.includes(old.docs[0].id)) throw new Error('Expected old live record missing');
                // Capture every parallel response before invalidation, otherwise a
                // sibling may abort normally instead of exercising late delivery.
                if (++completed === expectedQueries) captured();
                await barrier;
                // Deliberately deliver a completed response despite cancellation.
                // Source/generation guards must also work when abort arrives too late.
                return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return response;
        };
        const staleSnapshot = structuredClone(t.snapshot);
        const pending = t.engine.retrieve(staleSnapshot, t.config, text => SillyTavern.getContext().getTokenCountAsync(text));
        try {
            await Promise.race([ready, pending.then(() => { throw new Error('Query was not held'); })]);
            t.engine.invalidate(); t.snapshot.messages[0].text = 'LIVE_NEW_QUERY: The compass is in a stone tower.';
            await t.engine.sync(t.snapshot, t.config);
            release();
            if (await pending !== null) throw new Error('Late live result was accepted');
        } finally { release(); t.client.fetcher = fetcher; await pending.catch(() => {}); }
        let current;
        await t.poll(async () => { current = await t.engine.retrieve(t.snapshot, t.config, text => SillyTavern.getContext().getTokenCountAsync(text)); return current?.text.includes('LIVE_NEW_QUERY'); });
        if (current.text.includes('LIVE_OLD_QUERY')) throw new Error('Obsolete text survived recovery');
    });
}
