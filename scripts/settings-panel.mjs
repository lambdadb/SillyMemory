// Expand optional controls before exercising them through the real settings UI.
// Older installed revisions have these controls directly in the main drawer.
export async function expandMemorySettings(page) {
    for (const name of ['advanced', 'checkpoints']) {
        const section = page.locator(`#sillymemory details[data-sm="${name}"]`);
        if (await section.count() && await section.getAttribute('open') === null) {
            await section.locator(':scope > summary').click();
        }
    }
}
