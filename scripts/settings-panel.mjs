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
