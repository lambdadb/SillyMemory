// Optional real-LambdaDB upgrade acceptance inside the Git URL installation run.
// Only synthetic history and this profile's recorded owned collections are used.
export function installMemory({ page, field, settings, check, credentials, entries }) {
    const base = '/scripts/extensions/third-party/SillyMemory';
    const status = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 90000 });
    const state = () => page.evaluate(() => {
        const c = SillyTavern.getContext(), owner = c.extensionSettings.sillymemory.owner;
        return { owner, ...JSON.parse(localStorage.getItem(`sillymemory:state:${owner}`)) };
    });
    const connect = async () => {
        await settings(); await field('endpoint').fill(credentials.endpoint); await field('project').fill(credentials.project);
        await field('key').fill(credentials.key); await field('connect').click();
    };
    const inspect = (collection, owner) => page.evaluate(async ({ base, credentials, collection, owner }) => {
        const { LambdaClient } = await import(`${base}/src/client.js`);
        const client = new LambdaClient(credentials, credentials.key, { headers: () => SillyTavern.getContext().getRequestHeaders() });
        try { await client.assertOwned(collection, owner); return await client.query(collection, { queryString: { query: `owner:${owner}` } }); }
        finally { client.forget(); }
    }, { base, credentials, collection, owner });
    const identity = () => page.evaluate(async base => {
        const c = SillyTavern.getContext(), { capture } = await import(`${base}/src/memory.js`);
        const { chatCollection } = await import(`${base}/src/chat-collections.js`);
        return { ...await chatCollection(capture(c), c.extensionSettings.sillymemory.owner), file: c.getCurrentChatId() };
    }, base);
    let legacy, legacyDocs, parent, branch;
    const sorted = docs => [...docs].sort((a, b) => a.id.localeCompare(b.id));
    return {
        async beforeUpdate() {
            // Connecting again is safe before any real collection exists.
            await connect(); await field('gate').click(); await status('Transport gate passed');
            await field('provision').click(); await status('Memory collection created');
            await page.evaluate(async () => {
                const c = SillyTavern.getContext(), body = new FormData(); body.set('ch_name', 'Upgrade Acceptance'); body.set('first_mes', 'Synthetic upgrade history.');
                const response = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body });
                if (!response.ok) throw new Error('Synthetic character creation failed');
            });
            await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
            await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'Upgrade Acceptance' }).click();
            await connect();
            await page.evaluate(async () => {
                const c = SillyTavern.getContext();
                c.chat.splice(0, c.chat.length, ...Array.from({ length: 18 }, (_, i) => ({
                    mes: i === 0 ? 'The blue compass is beneath the cedar tree. ' + 'We recorded ordinary details in the travel diary. '.repeat(36) : `Synthetic turn ${i}: Where is the blue compass?`,
                    name: i % 2 ? 'User' : 'Upgrade Acceptance', is_user: Boolean(i % 2), is_system: false, send_date: 0, extra: {},
                })));
                await c.saveChat();
            });
            await field('enabled').check(); await status('synchronized');
            legacy = await state(); legacyDocs = sorted(await inspect(legacy.collection, legacy.owner));
            check('published 0.1.0 indexes synthetic history into its shared managed collection', legacyDocs.length > 4 && legacyDocs.some(d => d.text.includes('cedar tree')));
            await field('enabled').uncheck();
        },
        async afterUpdate() {
            const before = await state();
            check('upgrade preserves the legacy shared collection cleanup pointer', before.collection === legacy.collection && before.ready && before.chatCollections.length === 0);
            check('upgrade leaves all legacy remote documents byte-equivalent', JSON.stringify(sorted(await inspect(legacy.collection, legacy.owner))) === JSON.stringify(legacyDocs));
            await connect(); await field('enabled').check(); await status('synchronized'); parent = await identity();
            const actual = await inspect(parent.collection, legacy.owner);
            const expected = await page.evaluate(async base => {
                const c = SillyTavern.getContext(), { capture, documents } = await import(`${base}/src/memory.js`);
                return (await documents(capture(c), c.extensionSettings.sillymemory.owner, { recent: 14, chunkChars: 800 })).docs;
            }, base);
            check('first upgraded sync builds a separate chat collection with exact boundary-aware documents', parent.collection !== legacy.collection && JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected)) && actual.every(d => d.id.includes('_boundary-v1_')));
            check('new indexing preserves the legacy shared remote data', JSON.stringify(sorted(await inspect(legacy.collection, legacy.owner))) === JSON.stringify(legacyDocs));
            await page.evaluate(async () => { const { renameChat } = await import('/script.js'); await renameChat(SillyTavern.getContext().getCurrentChatId(), 'Upgrade renamed'); });
            await status('synchronized'); parent = { ...parent, file: (await identity()).file };
            check('renaming upgraded chat preserves its collection', (await identity()).collection === parent.collection);
            await page.evaluate(async () => { const c = SillyTavern.getContext(), { createBranch } = await import('/scripts/bookmarks.js'); await c.openCharacterChat(await createBranch(c.chat.length - 1)); });
            await status('synchronized'); branch = await identity();
            check('native branch after upgrade provisions a distinct collection', branch.collection !== parent.collection && (await inspect(branch.collection, legacy.owner)).length === actual.length);
            await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'The blue compass is in the stone tower.'; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); });
            await status('synchronized');
            const branchDocs = await inspect(branch.collection, legacy.owner);
            check('branch edit removes old chunks without changing parent or legacy facts', branchDocs.some(d => d.text.includes('stone tower')) && !branchDocs.some(d => d.text.includes('cedar tree')) && (await inspect(parent.collection, legacy.owner)).some(d => d.text.includes('cedar tree')) && JSON.stringify(sorted(await inspect(legacy.collection, legacy.owner))) === JSON.stringify(legacyDocs));
            const recalled = await page.evaluate(async () => {
                const c = SillyTavern.getContext(), chat = c.chat.map((m, index) => ({ ...m, index })); let aborted = false;
                await globalThis.sillymemory_intercept(chat, 4096, () => { aborted = true; }, 'normal');
                const memories = chat.filter(m => m.mes.startsWith('[Past conversation excerpt:'));
                if (!aborted) await c.eventSource.emit(c.eventTypes.GENERATE_AFTER_DATA, { prompt: chat.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })) }, false);
                return { aborted, text: memories.map(m => m.mes).join('\n'), recent: chat.at(-1)?.mes };
            });
            check('upgraded interceptor recalls branch facts through managed queryText and keeps recent history', !recalled.aborted && recalled.text.includes('stone tower') && !recalled.text.includes('cedar tree') && recalled.recent.includes('turn 17'));
            page.once('dialog', d => d.accept()); await field('delete-chat').click(); await status('no longer accessible');
            check('current-chat deletion preserves the upgraded parent and legacy data', (await inspect(parent.collection, legacy.owner)).length === actual.length && JSON.stringify(sorted(await inspect(legacy.collection, legacy.owner))) === JSON.stringify(legacyDocs));
            await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
            await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'Upgrade Acceptance' }).click();
            await page.evaluate(async file => SillyTavern.getContext().openCharacterChat(file), parent.file);
            await connect(); await field('enabled').check(); await status('synchronized');
            check('reload and key re-entry reuse the renamed upgraded parent', (await identity()).collection === parent.collection && entries.length === 4);
            page.once('dialog', d => d.accept()); await field('delete').click(); await status('no longer accessible');
            check('all-owned deletion clears the old shared collection pointer', !(await state()).collection);
        },
        async cleanup() {
            // UI deletion drains queued writes; a failure keeps the pending record.
            if (entries.length) {
                await connect(); page.once('dialog', d => d.accept()); await field('delete').click();
                await status('no longer accessible');
                await page.evaluate(async ({ base, credentials, entries }) => {
                    const c = SillyTavern.getContext(), { LambdaClient } = await import(`${base}/src/client.js`);
                    const client = new LambdaClient(credentials, credentials.key, { headers: () => c.getRequestHeaders() });
                    try { for (const e of entries) await client.deleteOwnedCollection(e.collection, e.owner, e.scope); }
                    finally { client.forget(); }
                }, { base, credentials, entries });
            }
        },
    };
}
