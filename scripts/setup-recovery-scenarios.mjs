import { answerMemoryPopup, expandMemorySettings, openChatMemory } from './settings-panel.mjs';

export async function runSetupRecoveryScenarios({ page, field, check, calls, waitStatus, nativeChats, screenshot }) {
    const original = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    const open = file => page.evaluate(file => SillyTavern.getContext().openCharacterChat(file), file);
    const list = field('checkpoint-list');
    const settled = () => page.waitForFunction(() => {
        const text = document.querySelector('#sillymemory [data-sm="checkpoint-list"]').textContent;
        return text && !text.includes('Checking saved') && !text.startsWith('Refresh to');
    });
    const writes = () => calls.filter(call => call.method !== 'GET').length;
    await open(nativeChats.source);
    const sourceWasOn = await field('enabled').isChecked();
    if (!sourceWasOn) await field('enabled').check();
    await waitStatus('synchronized');
    await expandMemorySettings(page); await settled();
    await field('checkpoints').locator(':scope > summary').click();
    const before = writes(), statusBefore = await field('status').textContent();
    let reached, release, requests = 0;
    const entered = new Promise(resolve => { reached = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const hold = async route => { requests++; reached(); await held; await route.continue(); };
    await page.route('**/api/characters/chats', hold);
    await field('checkpoints').locator(':scope > summary').click(); await entered;
    try {
        await field('checkpoints').evaluate(element => { element.open = false; element.dispatchEvent(new Event('toggle')); element.open = true; element.dispatchEvent(new Event('toggle')); });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        check('opening snapshots shares in-flight automatic reads without blocking chat operations', requests === 1 && !await field('connect').isDisabled() && (await field('status').textContent()) === statusBefore);
    } finally { release(); }
    await settled(); await page.unroute('**/api/characters/chats', hold);
    check('opening snapshots refreshes availability without uploads, searches or generation', await list.locator('.sm-checkpoint').count() > 0 && writes() === before && await field('enabled').isChecked());
    await screenshot?.('snapshots-auto');
    let inventoryReads = 0;
    const observe = request => { if (new URL(request.url()).pathname === '/api/characters/chats') inventoryReads++; };
    page.on('request', observe);
    try {
        await openChatMemory(page);
        await open('SillyMemory independent setting'); await waitStatus('Memory disabled');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        check('closed extension settings do not refresh snapshot lists when chats change', inventoryReads === 0);
        await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click();
        await page.waitForFunction(() => document.querySelector('#sillymemory [data-sm="checkpoint-list"]').textContent.includes('No saved checkpoints'));
        check('reopening settings refreshes an already-expanded snapshot panel once', inventoryReads === 1);
    } finally { page.off('request', observe); }
    await open(nativeChats.source); await waitStatus('synchronized'); await settled();
    await field('checkpoints').locator(':scope > summary').click();
    await page.route('**/api/characters/chats', route => route.fulfill({ status: 400, json: { error: true } }), { times: 1 });
    await field('checkpoints').locator(':scope > summary').click();
    await page.waitForFunction(() => document.querySelector('#sillymemory [data-sm="checkpoint-list"]').textContent.includes('unavailable'));
    check('automatic snapshot errors stay in the list without replacing reply status', (await list.textContent()).includes('unavailable') && (await field('status').textContent()) === statusBefore && !await field('connect').isDisabled());
    await field('checkpoint-refresh').click(); await settled();
    check('manual refresh recovers an unavailable automatic snapshot list', await list.locator('.sm-checkpoint').count() > 0);
    const row = list.locator(`.sm-checkpoint[data-file="${nativeChats.snapshot}"]`);
    await answerMemoryPopup(page, () => row.getByRole('button', { name: 'Rename', exact: true }).click(), { value: 'Renamed UX snapshot' });
    await waitStatus('Checkpoint name saved'); await settled();
    check('native input popup renames the selected snapshot without changing chat activation', (await row.textContent()).includes('Renamed UX snapshot') && await field('enabled').isChecked());
    for (const control of ['delete-chat', 'delete']) {
        const changes = writes();
        await answerMemoryPopup(page, () => field(control).click(), { accept: false });
        check(`${control} native confirmation cancellation leaves remote data and chat preference intact`, writes() === changes && await field('enabled').isChecked());
    }
    await field('delete-chat').click();
    const popup = page.locator('dialog.popup[open]').last(); await popup.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape'); await popup.waitFor({ state: 'hidden' });
    check('escaping a native deletion popup is cancellation', writes() === before && await field('enabled').isChecked());
    const beforeStalePopup = writes();
    await field('delete-chat').click(); await popup.waitFor({ state: 'visible' });
    await open('SillyMemory independent setting');
    await popup.locator('.popup-button-ok').click(); await popup.waitFor({ state: 'hidden' });
    await waitStatus('Chat changed while the popup was open');
    check('confirming after a programmatic chat switch cannot delete the newly selected chat', writes() === beforeStalePopup && !await field('enabled').isChecked());
    await open(nativeChats.source); await waitStatus('synchronized'); await settled();
    await field('checkpoints').locator(':scope > summary').click();
    let enteredLate, releaseLate;
    const reachedLate = new Promise(resolve => { enteredLate = resolve; });
    const heldLate = new Promise(resolve => { releaseLate = resolve; });
    await page.route('**/api/characters/chats', async route => { enteredLate(); await heldLate; await route.continue(); }, { times: 1 });
    await field('checkpoints').locator(':scope > summary').click(); await reachedLate;
    let olderResponse;
    try {
        await open('SillyMemory independent setting'); await settled();
        olderResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/characters/chats');
    } finally { releaseLate(); }
    await olderResponse;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check('a late automatic list cannot restore another story after a chat switch', (await list.textContent()).includes('No saved checkpoints') && !await field('enabled').isChecked());
    await open(nativeChats.source); await waitStatus('synchronized');
    if (!sourceWasOn) await field('enabled').uncheck();
    await open(original); await waitStatus('Memory disabled'); await settled();
    await expandMemorySettings(page);
}
