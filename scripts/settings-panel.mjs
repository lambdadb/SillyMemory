// Expand optional controls before exercising them through the real settings UI.
// Older installed revisions have these controls directly in the main drawer.
export async function openMemoryConnection(page) {
    const connection = page.locator('#sillymemory details[data-sm="connection"]');
    if (await connection.count() && await connection.getAttribute('open') === null) {
        await connection.locator(':scope > summary').click();
    }
}

export async function expandMemorySettings(page) {
    const drawer = page.locator('#extensions-settings-button .drawer-content');
    if (!await drawer.evaluate(el => el.classList.contains('openDrawer'))) {
        await page.locator('#extensions-settings-button .drawer-toggle').click();
        await drawer.waitFor({ state: 'visible' });
    }
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) {
        await page.locator('#sillymemory .inline-drawer-toggle').click();
    }
    await openMemoryConnection(page);
    for (const name of ['advanced']) {
        const section = page.locator(`#sillymemory details[data-sm="${name}"]`);
        if (await section.count() && await section.getAttribute('open') === null) {
            await section.locator(':scope > summary').click();
        }
    }
}

// Native drawers overlay the composer. Close the settings drawer before using
// chat-facing controls, as a user returning to the conversation would do.
export async function openChatMemory(page) {
    const drawer = page.locator('#extensions-settings-button .drawer-content');
    if (await drawer.evaluate(el => el.classList.contains('openDrawer'))) {
        await page.locator('#extensions-settings-button .drawer-toggle').click();
        await drawer.waitFor({ state: 'hidden' });
    }
    const view = page.locator('#sillymemory-chat');
    if (await view.getAttribute('open') === null) await view.locator(':scope > summary').click();
    // Older revisions show the last prompt directly; newer ones collapse it.
    const lastPrompt = view.locator('details[data-sm-chat="last-prompt"]');
    if (await lastPrompt.count() && await lastPrompt.getAttribute('open') === null) {
        await lastPrompt.evaluate(element => { element.open = true; });
    }
    return view;
}

// Sync and delete for one chat live in that chat's Memory panel under This
// chat's memory. Existing runners keep their settings names for these actions;
// click the chat control as a user would and restore the settings drawer the
// next step expects. Deletion leaves its confirmation popup to the caller.
export function chatMemoryAction(page, name) {
    const button = page.locator(`#sillymemory-chat [data-sm-chat="${name}"]`);
    const click = async () => {
        const drawer = page.locator('#extensions-settings-button .drawer-content');
        const wasOpen = await drawer.evaluate(el => el.classList.contains('openDrawer'));
        const view = await openChatMemory(page);
        const section = view.locator('details[data-sm-chat="manage"]');
        if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
        await button.click();
        if (wasOpen && name !== 'delete') await page.locator('#extensions-settings-button .drawer-toggle').click();
    };
    return { click, isVisible: () => button.isVisible() };
}

// Synchronization has no standalone button: it runs on every chat event, and
// Retry synchronization appears only after a failure (browser-smoke clicks that
// button directly). Runners re-run synchronization the way a source edit does,
// through the host event, which schedules the same synchronization.
export function chatMemorySync(page) {
    const click = () => page.evaluate(async () => {
        const c = SillyTavern.getContext();
        await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, Math.max(0, c.chat.length - 1));
    });
    return { click, isVisible: () => page.locator('#sillymemory-chat [data-sm-chat="sync"]').isVisible() };
}

// Existing runners express memory state as check/uncheck. Exercise the real
// chat button while preserving the settings drawer used by their next step.
export function memoryControl(page) {
    const button = page.locator('#sillymemory-chat [data-sm-chat="toggle"]');
    const isChecked = async () => await button.getAttribute('aria-pressed') === 'true';
    const setChecked = async value => {
        if (await isChecked() === value) return;
        const drawer = page.locator('#extensions-settings-button .drawer-content');
        const wasOpen = await drawer.evaluate(el => el.classList.contains('openDrawer'));
        await openChatMemory(page);
        try {
            await button.click();
            await page.waitForFunction(value => document.querySelector('#sillymemory-chat [data-sm-chat="toggle"]').getAttribute('aria-pressed') === String(value), value);
            await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="connect"]').disabled);
            if (await isChecked() !== value) throw new Error('Chat memory switch did not retain the requested state.');
        } finally {
            if (wasOpen) await page.locator('#extensions-settings-button .drawer-toggle').click();
        }
    };
    return { isChecked, setChecked, check: () => setChecked(true), uncheck: () => setChecked(false),
        isVisible: () => button.isVisible() };
}

export async function answerMemoryPopup(page, action, { accept = true, value } = {}) {
    await action();
    const popup = page.locator('dialog.popup[open]').last();
    await popup.waitFor({ state: 'visible' });
    if (value !== undefined) await popup.locator('.popup-input').fill(value);
    await popup.locator(accept ? '.popup-button-ok' : '.popup-button-cancel').click();
    await popup.waitFor({ state: 'hidden' });
}
