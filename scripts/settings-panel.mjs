// Expand optional controls before exercising them through the real settings UI.
// Older installed revisions have these controls directly in the main drawer.
export async function openMemoryConnection(page) {
    const connection = page.locator('#sillymemory details[data-sm="connection"]');
    if (await connection.count() && await connection.getAttribute('open') === null) {
        await connection.locator(':scope > summary').click();
    }
}

export async function expandMemorySettings(page) {
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
