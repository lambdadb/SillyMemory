// Deterministic upstream failures. Only used by the local HTTPS emulator harness.
import assert from 'node:assert/strict';
import { runRecoveryScenarios } from './recovery-scenarios.mjs';

export function faultController() {
    let armed;
    const held = new Set(), observations = [];
    return {
        observations,
        arm(operation, mode, status) {
            assert(!armed, 'A fault is already armed');
            let enter, release;
            const item = { operation, mode, status, entered: new Promise(r => { enter = r; }), released: new Promise(r => { release = r; }), release };
            item.release = release; item.enter = enter; armed = item;
            return item;
        },
        async respond(operation, normal, send) {
            if (!armed || armed.operation !== operation) return send(...normal());
            const item = armed; armed = undefined;
            observations.push({ operation, mode: item.mode, status: item.status });
            if (item.mode === 'http') { item.enter(); return send(item.status); }
            // Apply writes / capture query results BEFORE withholding the response.
            // This models an uncertain accepted write and genuinely stale query data.
            const response = item.mode === 'hold-before' ? undefined : normal(); held.add(item); item.enter();
            await item.released; held.delete(item);
            // A pre-acceptance request lost with the proxy must never commit later.
            if (item.mode === 'hold-before') return send(503);
            send(...response);
        },
        releaseAll() { for (const item of held) item.release(); armed = undefined; },
    };
}
async function entered(item) {
    let timer;
    try { await Promise.race([item.entered, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Fault not reached: ${item.operation}`)), 20000); })]); }
    finally { clearTimeout(timer); }
}

export async function runFaultScenarios({ page, field, waitStatus, prompt, check, faults, collections, calls, screenshot, restartHost }) {
    const timings = {};
    const activeCollection = () => [...collections.values()][0];
    const sync = async () => { await field('sync').click(); await waitStatus('synchronized'); };
    async function seed() {
        await page.evaluate(async () => {
            const c = SillyTavern.getContext();
            c.chat.splice(0, c.chat.length, ...Array.from({ length: 8 }, (_, i) => ({ name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: Date.now(), extra: {}, mes: i === 0 ? 'FAULT_OLD: The compass is in the cedar chest.' : `Fault fixture ${i}: ordinary paper and empty baskets.` })));
            await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
        });
        await waitStatus('synchronized');
    }
    async function edit(text) {
        await page.evaluate(async text => { const c = SillyTavern.getContext(); c.chat[0].mes = text; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); }, text);
    }
    async function expectedRemote() {
        return page.evaluate(async () => {
            const c = SillyTavern.getContext();
            const { capture, documents, options } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
            const owner = c.extensionSettings.sillymemory.owner;
            const state = JSON.parse(localStorage.getItem(`sillymemory:state:${owner}`));
            return documents(capture(c), owner, options(state));
        });
    }
    async function remoteMatches() {
        const expected = await expectedRemote();
        const actual = [...activeCollection().docs.values()].filter(d => d.scope === expected.scope).map(d => d.id).sort();
        return JSON.stringify(actual) === JSON.stringify(expected.docs.map(d => d.id).sort());
    }
    async function reconnect(chatId) {
        await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
        check('fault reload clears the key and keeps memory disabled', await field('key').inputValue() === '' && !await field('enabled').isChecked());
        check('reload discards transient progress and previous failure status', await field('progress').isHidden() && !(await field('status').innerText()).includes('chunks confirmed'));
        if (await page.evaluate(() => SillyTavern.getContext().characterId === undefined)) {
            await page.locator('#rightNavHolder .drawer-toggle').click();
            await page.locator('.character_select').filter({ hasText: 'SillyMemory Synthetic' }).click();
        }
        await page.evaluate(async chatId => { await SillyTavern.getContext().openCharacterChat(chatId); }, chatId);
        if (!await field('endpoint').isVisible()) {
            if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
            if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
        }
        await field('key').fill('synthetic-session-key'); await field('connect').click();
        await field('enabled').check(); await waitStatus('synchronized');
    }
    await seed();
    // A quiet prompt must not consume a chat event's pending debounce timer.
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chat[0].mes = 'QUIET_SYNC: The compass is in the copper cabinet.';
        await c.saveChat();
        await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
        await globalThis.sillymemory_intercept([], 8192, () => {}, 'quiet');
    });
    await waitStatus('synchronized');
    check('quiet generation preserves pending event synchronization', await remoteMatches());
    const quietWrite = faults.arm('upsert', 'hold');
    await edit('QUIET_IN_FLIGHT: The compass is in the oak cabinet.'); await entered(quietWrite);
    await page.evaluate(() => globalThis.sillymemory_intercept([], 8192, () => {}, 'quiet'));
    quietWrite.release(); await waitStatus('synchronized');
    check('quiet generation preserves in-flight synchronization and its completion status', await remoteMatches() && await field('progress').isHidden());

    const quietQuery = faults.arm('query', 'hold');
    const overlapping = prompt(); await entered(quietQuery);
    const quietPrompt = await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        const chat = c.chat.map((m, index) => ({ ...m, index }));
        const before = JSON.stringify(chat);
        const { runGenerationInterceptors } = await import('/scripts/extensions.js');
        const aborted = await runGenerationInterceptors(chat, 8192, 'quiet');
        return { aborted, unchanged: before === JSON.stringify(chat), injection: c.extensionPrompts.sillymemory?.value };
    });
    quietQuery.release(); const oldPrompt = await overlapping;
    check('quiet prompt cancels overlapping normal retrieval without pruning or reinjection', !quietPrompt.aborted && quietPrompt.unchanged && !quietPrompt.injection && oldPrompt.aborted && oldPrompt.chat.length === 8 && !oldPrompt.injection && await field('progress').isHidden());
    const afterQuiet = await prompt();
    check('normal retrieval recovers after quiet cancellation', !afterQuiet.aborted && Boolean(afterQuiet.injection) && await remoteMatches());

    const blockedTab = await page.context().newPage();
    let blockedProxyRequests = 0;
    blockedTab.on('request', request => { if (new URL(request.url()).pathname.startsWith('/proxy/')) blockedProxyRequests++; });
    try {
        await blockedTab.goto(page.url());
        await blockedTab.waitForFunction(() => document.querySelector('#sillymemory [data-sm="status"]')?.textContent.includes('already open in another tab'), null, { timeout: 45000 });
        const retained = await blockedTab.evaluate(async () => {
            const status = () => document.querySelector('#sillymemory [data-sm="status"]').textContent;
            const before = status(), c = SillyTavern.getContext();
            await c.eventSource.emit(c.eventTypes.CHAT_CHANGED);
            await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
            await globalThis.sillymemory_intercept([], 8192, () => {}, 'quiet');
            return status() === before && [...document.querySelectorAll('#sillymemory button, #sillymemory input')].every(e => e.disabled);
        });
        check('lock-conflict explanation survives chat events and quiet generation with controls disabled', retained && blockedProxyRequests === 0);
    } finally { await blockedTab.close(); }
    // Exercise multiple batches in the real adapter with a failed second write.
    const firstBatch = faults.arm('upsert', 'hold');
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chat.splice(0, c.chat.length, ...Array.from({ length: 122 }, (_, i) => ({ name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: Date.now(), extra: {}, mes: `Progress fixture ${i}: a compass in a wooden box.` })));
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
    });
    await entered(firstBatch);
    const firstIds = new Set(calls.filter(c => c.path.endsWith('/docs/upsert')).at(-1).body.docs.map(d => d.id));
    check('unacknowledged first upload shows zero of 120 chunks', (await field('status').innerText()).includes('0 / 120') && await field('progress').isVisible() && await field('progress').evaluate(e => e.value === 0 && e.max === 120));
    const failedBatch = faults.arm('upsert', 'http', 503); firstBatch.release();
    await entered(failedBatch); await waitStatus('HTTP 503');
    check('failed second batch keeps 50 of 120 and offers explicit retry', /50 \/ 120.*HTTP 503.*Sync this chat/.test(await field('status').innerText()) && await field('progress').isHidden());
    await field('status').scrollIntoViewIfNeeded(); await screenshot?.('sync-failure');
    const uploadsBefore = calls.filter(c => c.path.endsWith('/docs/upsert')).length;
    await sync();
    const retried = calls.filter(c => c.path.endsWith('/docs/upsert')).slice(uploadsBefore);
    check('manual retry skips confirmed chunks and completes the current source', JSON.stringify(retried.map(c => c.body.docs.length)) === '[50,20]' && retried.every(c => c.body.docs.every(d => !firstIds.has(d.id))) && await remoteMatches() && (await field('status').innerText()).includes('120 older chunks') && await field('progress').isHidden());

    const queuedWrite = faults.arm('upsert', 'hold');
    await edit('Progress fixture changed: compass moved to an oak chest.'); await entered(queuedWrite);
    check('upload progress includes chunks already confirmed in this session', (await field('status').innerText()).includes('119 / 120'));
    await field('progress').scrollIntoViewIfNeeded(); await screenshot?.('sync-progress');
    await field('sync').click(); await waitStatus('earlier memory write');
    const queuedCalls = calls.filter(c => c.path.endsWith('/docs/upsert')).length;
    queuedWrite.release(); await waitStatus('synchronized');
    check('overlapping manual sync waits without duplicating the confirmed write', calls.filter(c => c.path.endsWith('/docs/upsert')).length === queuedCalls && await remoteMatches() && await field('progress').isHidden());
    await seed();
    for (const status of [429, 503]) {
        assert((await prompt()).injection);
        const before = calls.filter(c => c.path.endsWith('/query')).length;
        const failure = faults.arm('query', 'http', status);
        const result = await prompt(); await entered(failure);
        check(`HTTP ${status} clears previous memory and preserves source/full prompt`, !result.injection && result.before === result.after && result.chat.length === 8 && !result.aborted);
        check(`HTTP ${status} explains how to retry and clears progress`, (await field('status').innerText()).includes('Sync this chat') && await field('progress').isHidden());
        const queries = calls.filter(c => c.path.endsWith('/query')).slice(before).map(c => c.body.query.knn.queryText);
        check(`HTTP ${status} does not immediately retry retrieval`, queries.length >= 1 && queries.length <= 2 && new Set(queries).size === queries.length);
        check(`HTTP ${status} recovers on the next generation`, Boolean((await prompt()).injection));
    }
    const stalled = faults.arm('query', 'hold');
    const started = performance.now(), timingOut = prompt(); await entered(stalled);
    const timeout = await timingOut; timings.queryTimeoutMs = performance.now() - started; stalled.release();
    check('real 15-second query timeout retains the original prompt without injection', !timeout.injection && timeout.chat.length === 8 && timeout.before === timeout.after && !timeout.aborted && timings.queryTimeoutMs >= 14000 && timings.queryTimeoutMs < 25000);
    check('timeout is distinct from an HTTP error and includes recovery guidance', /timed out.*Sync this chat/.test(await field('status').innerText()) && await field('progress').isHidden());
    check('query timeout recovers on a subsequent generation', Boolean((await prompt()).injection));

    for (const operation of ['edit', 'delete', 'branch', 'disable']) {
        await seed();
        const delayed = faults.arm('query', 'hold');
        const pending = prompt(); await entered(delayed);
        check(`held query exposes search progress before ${operation}`, (await field('status').innerText()).includes('Searching memory:') && await field('progress').isVisible());
        if (operation === 'edit') await edit('FAULT_NEW: The compass moved to the stone tower.');
        if (operation === 'delete') await page.evaluate(async () => { await SillyTavern.getContext().deleteMessage(0); });
        if (operation === 'branch') await page.evaluate(async () => { const c = SillyTavern.getContext(); const { createBranch } = await import('/scripts/bookmarks.js'); const branch = await createBranch(c.chat.length - 1); if (!branch) throw new Error('Branch creation failed'); await c.openCharacterChat(branch); });
        if (operation === 'disable') await field('enabled').uncheck();
        delayed.release(); const canceled = await pending;
        check(`held query during ${operation} aborts the old generation and cannot inject`, canceled.aborted && !canceled.injection && canceled.chat.length === 8);
        if (operation === 'disable') check('disabled state cannot be overwritten by late query progress', (await field('status').innerText()).includes('Memory disabled') && await field('progress').isHidden());
        if (operation === 'disable') { await field('enabled').check(); }
        await waitStatus('synchronized');
        const fresh = await prompt();
        check(`${operation} recovers using only current source`, !fresh.aborted && Boolean(fresh.injection) && fresh.before === fresh.after && (operation === 'edit' || operation === 'delete' ? !fresh.injection.includes('FAULT_OLD') : true) && await remoteMatches());
    }

    // A failed document deletion must prevent retrieval until reconciliation succeeds.
    await seed(); const blockedDelete = faults.arm('delete-docs', 'http', 503);
    await edit('FAULT_DELETE_RETRY: The compass is in the attic.'); await entered(blockedDelete); await waitStatus('HTTP 503');
    check('failed deletion reports its own stage without claiming removed chunks', /Removing outdated memory: 0 \/ 1.*HTTP 503/.test(await field('status').innerText()) && await field('progress').isHidden());
    const retrievalBlocked = faults.arm('delete-docs', 'http', 503);
    const queryCount = calls.filter(c => c.path.endsWith('/query')).length;
    const failedSync = await prompt(); await entered(retrievalBlocked);
    check('failed source deletion prevents retrieval and preserves full prompt', !failedSync.injection && failedSync.chat.length === 8 && calls.filter(c => c.path.endsWith('/query')).length === queryCount);
    await sync();
    check('retrying failed source deletion reconciles exact IDs', await remoteMatches() && (await prompt()).injection.includes('FAULT_DELETE_RETRY'));

    // Keep the full default timeout; do not replace the shipped client's clock.
    await seed(); const uncertain = faults.arm('upsert', 'hold');
    const writeStarted = performance.now(); await edit('FAULT_UNCERTAIN: A secret is in the amber box.'); await entered(uncertain);
    check('upsert can be accepted remotely before the browser sees success', [...activeCollection().docs.values()].some(d => d.text.includes('FAULT_UNCERTAIN')));
    await waitStatus('timed out'); timings.acceptedWriteTimeoutMs = performance.now() - writeStarted; uncertain.release();
    // Delete while disabled, then perform a real page reload. Only the durable
    // intent journal can remember the timed-out write in the newly created engine.
    await field('enabled').uncheck();
    const savedSource = await page.evaluate(async () => {
        const c = SillyTavern.getContext(); await c.deleteMessage(0);
        // deleteMessage only schedules a debounced host save. Wait for persistence
        // before reloading, otherwise the old on-disk source is correctly restored.
        await c.saveChat();
        return c.chat.map(m => m.mes);
    });
    assert(!savedSource.some(text => text.includes('FAULT_UNCERTAIN')));
    const chatId = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    await page.reload(); await reconnect(chatId);
    check('host reload preserves the saved post-deletion source', JSON.stringify(await page.evaluate(() => SillyTavern.getContext().chat.map(m => m.mes))) === JSON.stringify(savedSource));
    const reloaded = await prompt();
    check('reload reconciles an accepted timed-out write after its source was deleted', await remoteMatches() && ![...activeCollection().docs.values()].some(d => d.text.includes('FAULT_UNCERTAIN')) && !reloaded.injection.includes('FAULT_UNCERTAIN'));

    const recovery = restartHost ? await runRecoveryScenarios({ page, field, waitStatus, prompt, check, faults, collections, calls, seed, edit, entered, remoteMatches, reconnect, restartHost }) : undefined;

    // Collection removal must await an in-flight write before sending DELETE.
    await seed(); const inFlight = faults.arm('upsert', 'hold');
    await edit('FAULT_DRAIN: Pending write before full deletion.'); await entered(inFlight);
    const deletesBefore = calls.filter(c => c.method === 'DELETE').length;
    page.once('dialog', dialog => dialog.accept()); await field('delete').click();
    await page.waitForFunction(() => document.querySelector('[data-sm="delete"]').disabled && !document.querySelector('[data-sm="enabled"]').checked);
    check('owned collection deletion waits for the outstanding write', collections.size === 1 && calls.filter(c => c.method === 'DELETE').length === deletesBefore);
    inFlight.release(); await waitStatus('no longer accessible');
    check('drained collection deletion leaves no remote data or journal', collections.size === 0 && await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('sillymemory:journal:'))));
    return { timings, recovery, injectedFaults: faults.observations };
}
