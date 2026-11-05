import { answerMemoryPopup, expandMemorySettings } from './settings-panel.mjs';

// Native confirmation popups guard memory deletion.
export async function runSetupRecoveryScenarios({ page, field, check, calls, waitStatus, nativeChats }) {
    const original = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    const open = file => page.evaluate(file => SillyTavern.getContext().openCharacterChat(file), file);
    const writes = () => calls.filter(call => call.method !== 'GET').length;
    await open(nativeChats.source);
    const sourceWasOn = await field('enabled').isChecked();
    if (!sourceWasOn) await field('enabled').check();
    await waitStatus('synchronized');
    const before = writes();
    for (const control of ['delete-chat', 'delete']) {
        const changes = writes();
        // Deleting all memory is a settings action; one chat's deletion is in its Memory panel.
        if (control === 'delete') await expandMemorySettings(page);
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
    await expandMemorySettings(page);
    await open(nativeChats.source); await waitStatus('synchronized');
    if (!sourceWasOn) await field('enabled').uncheck();
    // Native scenarios may leave either an enabled or a disabled chat selected.
    if (original !== nativeChats.source) {
        await open(original); await waitStatus(await field('enabled').isChecked() ? 'synchronized' : 'Memory is off');
    }
    await expandMemorySettings(page);
}
