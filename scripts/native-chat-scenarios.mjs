// Native chat/checkpoint/branch actions on a disposable host and local emulator.
import assert from 'node:assert/strict';
import { expandMemorySettings, openChatMemory } from './settings-panel.mjs';

export async function runNativeChatScenarios({ page, field, waitStatus, check, faults, collections, calls, prompt, screenshot }) {
    if (!await field('enabled').isChecked()) { await field('enabled').check(); await waitStatus('synchronized'); }
    const selected = () => page.evaluate(() => {
        const c = SillyTavern.getContext();
        return { file: c.getCurrentChatId(), memory: c.chatMetadata.sillymemory, messages: c.chat.map(m => m.mes) };
    });
    const open = async file => {
        await page.evaluate(async file => { await SillyTavern.getContext().openCharacterChat(file); }, file);
        await waitStatus('synchronized');
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
    await open(source.file);
    await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click();
    await field('enabled').uncheck();
    await page.evaluate(async () => { await (await import('/scripts/bookmarks.js')).branchChat(7); });
    check('native Branch preserves an explicitly disabled memory preference', !await field('enabled').isChecked());
    await field('enabled').check(); await waitStatus('synchronized');
    await open(source.file);
    await expandMemorySettings(page);
    const held = faults.arm('upsert', 'hold');
    await field('checkpoint-save').click(); await held.entered;
    try {
        check('saving a frozen memory snapshot preserves the enabled preference', await field('enabled').isChecked());
        check('snapshot progress is visible in the chat header', (await page.locator('#sillymemory-chat [data-sm-chat="label"]').innerText()).includes('Saving snapshot'));
        await openChatMemory(page);
        await page.evaluate(() => toastr.clear());
        await screenshot('snapshot-saving.png');
        const blocked = await prompt();
        check('generation during snapshot preparation stops explicitly instead of falling back to native history', blocked.aborted && !blocked.injection);
    } finally { held.release(); }
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="checkpoint-save"]').disabled);
    await waitStatus('synchronized');
    check('successful snapshot saving returns to the original chat with memory on', (await selected()).file === source.file && await field('enabled').isChecked());
    await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click(); await expandMemorySettings(page);
    const rows = field('checkpoint-list').locator('.sm-checkpoint');
    const snapshotFile = await rows.first().getAttribute('data-file');
    const frozenMemory = (await saved(snapshotFile))[0].chat_metadata.sillymemory;
    const frozenDocuments = structuredClone(remote(frozenMemory));
    check('a frozen snapshot is saved without replacing the native checkpoint', snapshotFile?.startsWith('SillyMemory checkpoint ') && (await saved(checkpoint.file)).length === 13);
    await rows.first().getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="checkpoint-resume"]').disabled);
    await waitStatus('synchronized');
    const resumed = await selected();
    check('snapshot Resume opens a new chat and automatically prepares enabled memory', resumed.file.startsWith('SillyMemory resume ') && resumed.messages.length === 12 && await field('enabled').isChecked());
    await page.evaluate(async file => { await SillyTavern.getContext().openCharacterChat(file); }, snapshotFile);
    await page.waitForFunction(() => document.querySelector('#sillymemory-chat [data-sm-chat="label"]').textContent.includes('Saved snapshot'));
    const beforeBranch = calls.length;
    await page.evaluate(async () => { await (await import('/scripts/bookmarks.js')).branchChat(7); });
    await waitStatus('synchronized');
    const fromSnapshot = await selected();
    check('native Branch from a frozen snapshot becomes writable without inheriting its read-only marker', !fromSnapshot.memory.checkpoint && fromSnapshot.memory.story === source.memory.story && fromSnapshot.messages.length === 8 && await field('enabled').isChecked() && calls.length > beforeBranch);
    assert.deepEqual(remote(frozenMemory), frozenDocuments, 'Branching must not modify the frozen snapshot');
    await openChatMemory(page);
    await page.locator('#options_button').click(); await page.locator('#option_back_to_main').click();
    await page.waitForFunction(file => SillyTavern.getContext().getCurrentChatId() === file, snapshotFile);
    check('native Back to parent chat returns to the preserved snapshot', (await selected()).file === snapshotFile && await field('enabled').isChecked());
    await page.locator('#options_button').click(); await page.locator('#option_back_to_main').click();
    await waitStatus('synchronized');
    check('the snapshot native parent link returns to the original conversation', (await selected()).file === source.file && await field('enabled').isChecked());
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
    await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click(); await expandMemorySettings(page);
    const beforeFailedSave = calls.length;
    const rejectSnapshot = async route => {
        if (route.request().postDataJSON().file_name?.startsWith('SillyMemory checkpoint ')) await route.fulfill({ status: 400, json: { error: true } });
        else await route.continue();
    };
    await page.route('**/api/chats/save', rejectSnapshot);
    await field('checkpoint-save').click(); await waitStatus('Checkpoint chat save failed');
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="checkpoint-save"]').disabled);
    await page.unroute('**/api/chats/save', rejectSnapshot);
    check('a rejected snapshot save keeps memory on, reports the failure and makes no remote writes', await field('enabled').isChecked() && calls.length === beforeFailedSave && (await selected()).file === source.file);
    await field('enabled').uncheck();
    await field('checkpoint-save').click();
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="checkpoint-save"]').disabled);
    check('snapshot save preserves an explicitly disabled memory preference', !await field('enabled').isChecked());
    await field('checkpoint-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="checkpoint-refresh"]').disabled);
    await rows.first().getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="checkpoint-resume"]').disabled);
    check('snapshot Resume preserves an explicitly disabled memory preference', !await field('enabled').isChecked());
    // Later harness scenarios replace this disposable transcript themselves.
    return { source: source.file, nativeCheckpoint: checkpoint.file, branch: branch.file, snapshot: snapshotFile, resumed: resumed.file, sourceMessages: source.messages.length, initialFile: original.file };
}
