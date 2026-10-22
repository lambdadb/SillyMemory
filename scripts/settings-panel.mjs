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
    for (const name of ['advanced', 'checkpoints']) {
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
    if (await view.getAttribute('open') === null) await view.locator('summary').click();
    return view;
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
