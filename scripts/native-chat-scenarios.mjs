import { expandMemorySettings, openChatMemory } from './settings-panel.mjs';
// Native chat/checkpoint/branch actions on a disposable host and local emulator.
import assert from 'node:assert/strict';

export async function runNativeChatScenarios({ page, field, waitStatus, check, faults, collections, calls, screenshot }) {
    if (!await field('enabled').isChecked()) { await field('enabled').check(); await waitStatus('synchronized'); }
    const selected = () => page.evaluate(() => {
        const c = SillyTavern.getContext();
        return { file: c.getCurrentChatId(), memory: c.chatMetadata.sillymemory, messages: c.chat.map(m => m.mes) };
    });
    const open = async file => {
        await page.evaluate(async file => { await SillyTavern.getContext().openCharacterChat(file); }, file);
        await waitStatus(await field('enabled').isChecked() ? 'synchronized' : 'Memory is off');
    };
    const saved = async file => page.evaluate(async file => {
        const c = SillyTavern.getContext();
        const r = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, file_name: file }) });
        if (!r.ok) throw new Error('Native chat read failed');
        return r.json();
    }, file);
    const remote = memory => [...collections.values()].flatMap(c => [...(c.branches.get(`chat_${memory.id}`)?.values() || [])]);
    const original = await selected();
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chat.splice(0, c.chat.length, ...Array.from({ length: 12 }, (_, i) => ({ name: i % 2 ? 'Mira' : 'User', is_user: i % 2 === 0, extra: {}, mes: `Native path fact ${i}.`,
            ...(i === 7 ? { swipe_id: 0, swipes: ['Native path fact 7.', 'Native alternate reply 7.'], swipe_info: [{ extra: {} }, { extra: {} }] } : {}) })));
        await c.saveChat(); await c.reloadCurrentChat();
    });
    await waitStatus('synchronized');
    await expandMemorySettings(page);
    // A pending sync waits while another action is busy; a failed action then stays visible.
    // Hold the connection test's collection creation to keep that global action busy.
    const writes = () => calls.filter(call => call.path.endsWith('/docs/upsert')).length;
    for (const outcome of ['success', 'failure']) {
        const held = faults.arm('create', outcome === 'success' ? 'hold' : 'hold-before');
        const before = writes();
        await page.evaluate(async outcome => {
            const c = SillyTavern.getContext(); c.chat[0].mes += ` Deferred source ${outcome}.`;
            await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
        }, outcome);
        await field('gate').click(); await held.entered;
        try {
            await page.waitForTimeout(900); // Cross two 400 ms debounce ticks while busy.
            check(`pending sync waits through a slow ${outcome} action without writing`, await field('gate').isDisabled() && writes() === before);
        } finally { held.release(); }
        await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="gate"]').disabled);
        if (outcome === 'success') {
            // The action reports its own result, which supersedes the deferred sync; sync explicitly.
            await waitStatus('Connection test passed');
            await field('sync').click(); await waitStatus('synchronized');
            check('the deferred edit synchronizes after the busy action completes', remote((await selected()).memory).some(doc => doc.text.includes('Deferred source success.')));
        } else {
            await page.waitForTimeout(600);
            check('a failed action supersedes deferred sync and keeps its failure visible', writes() === before && (await field('status').textContent()).includes('Wait, then') && await field('progress').isHidden());
            await field('cleanup').click(); await waitStatus('Test data deleted');
            await field('sync').click(); await waitStatus('synchronized');
        }
    }
    const source = await selected();
    const sourceDocuments = structuredClone(remote(source.memory));
    await openChatMemory(page);
    await page.locator('#options_button').click(); await page.locator('#option_new_bookmark').click();
    await page.locator('.popup .popup-input').fill('Native checkpoint fixture');
    await page.locator('.popup .popup-button-ok').click();
    await page.waitForFunction(() => SillyTavern.getContext().chat.at(-1)?.extra?.bookmark_link === 'Native checkpoint fixture');
    check('native Save checkpoint keeps the original chat and memory preference', (await selected()).file === source.file && await field('enabled').isChecked());
    await open('Native checkpoint fixture');
    const checkpoint = await selected();
    check('opening a native checkpoint automatically prepares an isolated memory path', checkpoint.memory.id !== source.memory.id && checkpoint.memory.story === source.memory.story && checkpoint.memory.source === source.memory.id && !checkpoint.memory.checkpoint && await field('enabled').isChecked());
    await page.evaluate(async () => { await (await import('/scripts/bookmarks.js')).branchChat(7, { swipeId: 1 }); });
    await waitStatus('synchronized');
    const branch = await selected();
    check('native Branch selects the requested swipe without changing the source chat', branch.messages.at(-1) === 'Native alternate reply 7.' && (await saved(source.file))[8].mes === 'Native path fact 7.');
    check('native earlier-message Branch keeps memory on and excludes the later transcript', branch.messages.length === 8 && branch.memory.source === checkpoint.memory.id && branch.memory.story === source.memory.story && await field('enabled').isChecked() && remote(branch.memory).length === 2 && remote(branch.memory).every(d => d.message < 2));
    assert.deepEqual(remote(source.memory), sourceDocuments, 'A native branch must not mutate its source memory');
    assert.deepEqual((await saved(source.file)).slice(1).map(m => m.mes), source.messages);
    check('native checkpoint and branch keep their source transcript intact', (await saved(source.file)).length === 13 && (await saved(checkpoint.file)).length === 13);
    // Snapshot fixtures used to cover native Back to parent; keep it on an ordinary branch.
    await openChatMemory(page);
    await page.locator('#options_button').click(); await page.locator('#option_back_to_main').click();
    await page.waitForFunction(file => SillyTavern.getContext().getCurrentChatId() === file, checkpoint.file);
    await waitStatus('synchronized');
    check('native Back to parent chat returns from a branch to its checkpoint with memory on', (await selected()).file === checkpoint.file && await field('enabled').isChecked());
    await open(source.file);
    await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click();
    await field('enabled').uncheck();
    await page.evaluate(async () => { await (await import('/scripts/bookmarks.js')).branchChat(7); });
    check('native Branch preserves an explicitly disabled memory preference', !await field('enabled').isChecked());
    await field('enabled').check(); await waitStatus('synchronized');
    await open(source.file);
    check('enabling an off native branch leaves its parent off and an earlier checkpoint on', !await field('enabled').isChecked() && (await saved('Native checkpoint fixture'))[0].chat_metadata.sillymemoryEnabled === true);
    await field('enabled').check(); await waitStatus('synchronized');
    await openChatMemory(page);
    await page.locator('#sillymemory-chat [data-sm-chat="history"]').click();
    const sourceRow = page.locator(`#select_chat_div .select_chat_block[file_name=${JSON.stringify(source.file)}]`);
    await sourceRow.waitFor({ state: 'visible' });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('shadow_select_chat_popup')).opacity === '1');
    check('chat status opens the native history list containing the original conversation', await page.locator('#select_chat_div').isVisible());
    await screenshot('native-chat-history.png');
    await sourceRow.click();
    await page.locator('#shadow_select_chat_popup').waitFor({ state: 'hidden' });
    await waitStatus('synchronized');
    check('the native history list returns to the original conversation with memory on', (await selected()).file === source.file && await field('enabled').isChecked());
    await screenshot('native-original-chat.png');
    // Later harness scenarios replace this disposable transcript themselves.
    return { source: source.file, nativeCheckpoint: checkpoint.file, branch: branch.file, sourceMessages: source.messages.length, initialFile: original.file };
}
