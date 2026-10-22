import { openChatMemory } from './settings-panel.mjs';

// Synthetic native transcripts only; no real provider or personal chat data.
export async function runPerChatMemoryScenarios({ page, field, waitStatus, check, calls, prompt, screenshot }) {
    const drawerWasOpen = await page.locator('#extensions-settings-button .drawer-content').evaluate(el => el.classList.contains('openDrawer'));
    const original = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    const other = 'SillyMemory independent setting';
    const open = async file => page.evaluate(file => SillyTavern.getContext().openCharacterChat(file), file);
    const read = async file => page.evaluate(async file => {
        const c = SillyTavern.getContext();
        const response = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, file_name: file }) });
        if (!response.ok) throw new Error('Could not read synthetic chat');
        return response.json();
    }, file);
    const writes = () => calls.filter(call => call.path.endsWith('/docs/upsert')).length;
    await page.evaluate(async file => {
        const c = SillyTavern.getContext();
        const response = await fetch('/api/chats/save', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({
            avatar_url: c.characters[c.characterId].avatar, file_name: file,
            chat: [{ chat_metadata: { integrity: crypto.randomUUID() } }, ...structuredClone(c.chat)],
        }) });
        if (!response.ok) throw new Error('Could not create synthetic chat');
    }, other);
    const beforeOff = calls.length;
    await open(other); await waitStatus('Memory disabled');
    const native = await prompt();
    check('a new chat defaults off without remote reads or uploads despite another enabled chat', !await field('enabled').isChecked() && !native.injection && !native.aborted && calls.length === beforeOff);
    await field('enabled').check(); await waitStatus('synchronized');
    await field('enabled').uncheck();
    check('chat on/off is saved in native metadata without a global browser preference', (await read(other))[0].chat_metadata.sillymemoryEnabled === false && await page.evaluate(() => !Object.hasOwn(JSON.parse(localStorage.getItem(`sillymemory:state:${SillyTavern.getContext().extensionSettings.sillymemory.owner}`)), 'enabled')));
    await open(original); await waitStatus('synchronized');
    check('turning the second chat off leaves the first chat enabled and LambdaDB connected', await field('enabled').isChecked() && (await field('connection-state').textContent()).startsWith('Connected'));
    await field('enabled').uncheck();
    await open(other); await waitStatus('Memory disabled');
    await openChatMemory(page);
    const beforeFailedSave = writes();
    await page.route('**/api/chats/save', route => route.fulfill({ status: 503, json: { error: true } }), { times: 1 });
    await page.locator('#sillymemory-chat [data-sm-chat="toggle"]').click();
    await waitStatus('preference could not be saved');
    check('a failed native preference save rolls activation back before any memory uploads', !await field('enabled').isChecked() && writes() === beforeFailedSave && (await read(other))[0].chat_metadata.sillymemoryEnabled === false);
    let entered, release;
    const reached = new Promise(resolve => { entered = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/chats/save', async route => { entered(); await held; await route.continue(); }, { times: 1 });
    await page.locator('#sillymemory-chat [data-sm-chat="toggle"]').click(); await reached;
    check('preference writes use the native chat save lock', await page.evaluate(async () => (await import('/script.js')).isChatSaving));
    const switching = open(original);
    release(); await switching;
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="connect"]').disabled);
    check('switching chats during a preference save cannot activate or overwrite the newly selected chat', !await field('enabled').isChecked() && (await read(original))[0].chat_metadata.sillymemoryEnabled === false && (await read(other))[0].chat_metadata.sillymemoryEnabled === true && writes() === beforeFailedSave);
    await open(other); await waitStatus('synchronized');
    check('reopening the saved target restores its own enabled preference', await field('enabled').isChecked());
    await openChatMemory(page); await screenshot?.('per-chat-memory-on');
    await field('enabled').uncheck();
    await screenshot?.('per-chat-memory-off');
    await open(original); await waitStatus('Memory disabled');
    check('both saved off preferences remain independent when reopening either chat', !await field('enabled').isChecked() && (await read(other))[0].chat_metadata.sillymemoryEnabled === false);
    await field('enabled').check(); await waitStatus('synchronized');
    if (drawerWasOpen) await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click();
}
