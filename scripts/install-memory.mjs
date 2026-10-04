// Real-LambdaDB acceptance for the current published per-chat baseline upgrade.
// Only synthetic history and this profile's recorded owned collections are used.
import { isDeepStrictEqual } from 'node:util';
export function installMemory({ page, field, settings, check, credentials, entries, upserts }) {
    const base = '/scripts/extensions/third-party/SillyMemory';
    const status = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 180000 });
    const idle = () => page.waitForFunction(() => !document.querySelector('[data-sm="checkpoint-refresh"]').disabled);
    const state = () => page.evaluate(() => {
        const c = SillyTavern.getContext(), owner = c.extensionSettings.sillymemory.owner;
        return { owner, ...JSON.parse(localStorage.getItem(`sillymemory:state:${owner}`)) };
    });
    const connect = async () => {
        await settings(); await field('endpoint').fill(credentials.endpoint); await field('project').fill(credentials.project);
        await field('key').fill(credentials.key); await field('connect').click();
    };
    const inspect = entry => page.evaluate(async ({ base, credentials, entry }) => {
        const { LambdaClient, scopeFilter } = await import(`${base}/src/client.js`);
        const client = new LambdaClient(credentials, credentials.key), owner = SillyTavern.getContext().extensionSettings.sillymemory.owner;
        try { await client.assertOwned(entry.collection, owner, undefined, entry.scope); return await client.query(entry.collection, scopeFilter(owner, entry.scope), { branch: entry.branch || 'main' }); }
        finally { client.forget(); }
    }, { base, credentials, entry });
    const absent = entry => page.evaluate(async ({ base, credentials, entry }) => {
        const { LambdaClient } = await import(`${base}/src/client.js`);
        const client = new LambdaClient(credentials, credentials.key);
        try { if (entry.branch) return !(await client.branches(entry.collection)).some(b => b.name === entry.branch); await client.get(entry.collection); return false; }
        catch (error) { if (error.status === 404) return true; throw error; }
        finally { client.forget(); }
    }, { base, credentials, entry });
    const identity = () => page.evaluate(async base => {
        const c = SillyTavern.getContext(), { capture } = await import(`${base}/src/memory.js`);
        const { chatCollection } = await import(`${base}/src/chat-collections.js`);
        return { ...await chatCollection(capture(c), c.extensionSettings.sillymemory.owner), file: c.getCurrentChatId() };
    }, base);
    const select = async () => {
        await page.locator('#rightNavHolder .drawer-toggle').click();
        await page.locator('.character_select').filter({ hasText: 'Upgrade Acceptance' }).click();
        await page.waitForFunction(() => SillyTavern.getContext().chat.length === 18);
    };
    const sorted = docs => [...docs].sort((a, b) => a.id.localeCompare(b.id));
    const submitted = () => upserts.reduce((n, r) => n + r.documents, 0);
    let baseline, baselineDocs, parent, branch;
    return {
        async beforeUpdate() {
            await connect(); await field('gate').click(); await status('Transport gate passed');
            await field('provision').click(); await status('Chat memory is ready');
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
            baseline = await identity(); baselineDocs = sorted(await inspect(baseline));
            check('published baseline indexes synthetic history into its per-chat collection', baseline.collection.startsWith('smchat_') && baselineDocs.length > 4 && baselineDocs.some(d => d.text.includes('cedar tree')));
            await field('enabled').uncheck();
        },
        async afterUpdate() {
            const before = await state();
            check('upgrade preserves the existing per-chat cleanup pointer and documents', before.ready && before.chatCollections.some(e => e.collection === baseline.collection) && isDeepStrictEqual(sorted(await inspect(baseline)), baselineDocs));
            await select(); await connect();
            let count = submitted(); await field('enabled').check(); await status('synchronized');
            check('ordinary upgraded sync reuses existing per-chat memory without opt-in or reindexing', (await identity()).collection === baseline.collection && submitted() === count && isDeepStrictEqual(sorted(await inspect(baseline)), baselineDocs));
            await field('enabled').uncheck(); await field('versioned').click(); await status('Versioned story memory is ready');
            await field('enabled').check(); await status('synchronized'); parent = await identity();
            const actual = await inspect(parent);
            const expected = await page.evaluate(async base => {
                const c = SillyTavern.getContext(), { capture, documents } = await import(`${base}/src/memory.js`);
                return (await documents(capture(c), c.extensionSettings.sillymemory.owner, { recent: 14, chunkChars: 800 })).docs;
            }, base);
            check('explicit opt-in indexes exact documents in a new story branch and preserves old memory', parent.collection.startsWith('smstory_') && Boolean(parent.branch) && parent.collection !== baseline.collection && isDeepStrictEqual(sorted(actual), sorted(expected)) && isDeepStrictEqual(sorted(await inspect(baseline)), baselineDocs));
            count = submitted();
            await page.evaluate(async () => { const c = SillyTavern.getContext(), { createBranch } = await import('/scripts/bookmarks.js'); await c.openCharacterChat(await createBranch(c.chat.length - 1)); });
            await status('synchronized'); branch = await identity();
            check('native fork inherits committed memory without new upserts', branch.collection === parent.collection && branch.branch !== parent.branch && submitted() === count && isDeepStrictEqual(sorted(await inspect(branch)), sorted(actual)));
            await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'The blue compass is in the stone tower.'; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); });
            await status('synchronized');
            check('branch edit preserves original story path and pre-upgrade memory', (await inspect(branch)).some(d => d.text.includes('stone tower')) && !(await inspect(branch)).some(d => d.text.includes('cedar tree')) && (await inspect(parent)).some(d => d.text.includes('cedar tree')) && isDeepStrictEqual(sorted(await inspect(baseline)), baselineDocs));
            await settings(); count = submitted();
            await field('checkpoint-name').fill('Upgrade checkpoint'); await field('checkpoint-save').click(); await status('Checkpoint saved:'); await idle();
            const row = field('checkpoint-list').locator('.sm-checkpoint').filter({ has: page.locator('strong', { hasText: 'Upgrade checkpoint' }) });
            check('upgraded manager saves a ready checkpoint without re-embedding', (await row.innerText()).includes('Ready') && submitted() === count);
            await row.getByRole('button', { name: 'Resume', exact: true }).click(); await status('Checkpoint resumed as'); await idle();
            await field('enabled').check(); await status('synchronized');
            const resumed = await identity();
            check('checkpoint resume creates an independent path with zero inherited upserts', resumed.collection === parent.collection && resumed.branch !== branch.branch && submitted() === count && (await inspect(resumed)).some(d => d.text.includes('stone tower')));
            const recalled = await page.evaluate(async () => {
                const c = SillyTavern.getContext(), chat = c.chat.map((m, index) => ({ ...m, index })); let aborted = false;
                await globalThis.sillymemory_intercept(chat, 4096, () => { aborted = true; }, 'normal');
                const memories = chat.filter(m => m.mes.startsWith('[Past conversation excerpt:'));
                if (!aborted) await c.eventSource.emit(c.eventTypes.GENERATE_AFTER_DATA, { prompt: chat.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })) }, false);
                return { aborted, text: memories.map(m => m.mes).join('\n'), recent: chat.at(-1)?.mes };
            });
            check('resumed interceptor recalls current facts through managed queryText and keeps recent history', !recalled.aborted && recalled.text.includes('stone tower') && !recalled.text.includes('cedar tree') && recalled.recent.includes('turn 17'));
            await settings(); await field('delete-chat').click(); await status('no longer accessible');
            check('current-chat deletion removes only the resumed branch', await absent(resumed) && (await inspect(branch)).some(d => d.text.includes('stone tower')) && (await inspect(parent)).some(d => d.text.includes('cedar tree')));
            await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' }); await select();
            await page.evaluate(async file => SillyTavern.getContext().openCharacterChat(file), parent.file);
            count = submitted(); await connect(); await field('enabled').check(); await status('synchronized');
            check('reload and key re-entry reuse story memory without reindexing or another collection', (await identity()).branch === parent.branch && submitted() === count && entries.length === 3);
            await settings(); await field('delete').click(); await status('no longer accessible');
            check('all-owned deletion removes pre-upgrade and versioned story collections', await absent(baseline) && await absent({ collection: parent.collection }));
        },
        async cleanup() {
            if (entries.length) {
                await connect(); await settings(); await field('delete').click(); await status('no longer accessible');
                await page.evaluate(async ({ base, credentials, entries }) => {
                    const { LambdaClient } = await import(`${base}/src/client.js`);
                    const client = new LambdaClient(credentials, credentials.key);
                    try { for (const e of entries) await client.deleteOwnedCollection(e.collection, e.owner, e.scope); }
                    finally { client.forget(); }
                }, { base, credentials, entries });
                for (const e of entries) if (!await absent({ collection: e.collection })) throw new Error('Owned collection cleanup is not confirmed');
            }
        },
    };
}
