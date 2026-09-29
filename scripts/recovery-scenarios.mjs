// Real host process death and browser reload; remote writes remain emulated.
export async function runRecoveryScenarios({ page, field, waitStatus, prompt, check, faults, collections, calls, seed, edit, entered, remoteMatches, reconnect, restartHost }) {
    const started = performance.now(), cycles = [];
    const docs = () => [...collections.values()][0].docs;
    for (const mode of ['hold-before', 'hold']) {
        await seed();
        const marker = `CRASH_${mode.toUpperCase().replace('-', '_')}`;
        const item = faults.arm('upsert', mode);
        await edit(`${marker}: The repaired clock is in the west gallery.`); await entered(item);
        check(`${mode}: remote acceptance matches the crash boundary`, [...docs().values()].some(d => d.text.includes(marker)) === (mode === 'hold'));
        const chatId = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
        const persisted = await page.evaluate(() => SillyTavern.getContext().chat.map(m => m.mes));
        await restartHost(); item.release();
        await page.reload(); await reconnect(chatId);
        check(`${mode}: SIGKILL/restart preserves saved source`, JSON.stringify(await page.evaluate(() => SillyTavern.getContext().chat.map(m => m.mes))) === JSON.stringify(persisted));
        check(`${mode}: restart reconciles exact remote IDs`, await remoteMatches());
        // Delete the uncertain write's source and verify both remote and prompt absence.
        await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(0); await c.saveChat(); });
        await waitStatus('synchronized');
        const result = await prompt();
        check(`${mode}: deleted crash-time write cannot reappear`, await remoteMatches() && ![...docs().values()].some(d => d.text.includes(marker)) && !result.injection?.includes(marker));
    }
    await seed();
    const parent = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    const branch = await page.evaluate(async () => { const c = SillyTavern.getContext(); const { createBranch } = await import('/scripts/bookmarks.js'); const name = await createBranch(c.chat.length - 1); if (!name) throw new Error('Recovery branch creation failed'); return name; });
    for (let i = 0; i < 24; i++) {
        const cycleStarted = performance.now(), chatId = i % 2 ? branch : parent;
        await page.evaluate(async id => SillyTavern.getContext().openCharacterChat(id), chatId);
        await waitStatus('synchronized');
        const marker = `CYCLE_${i}`;
        await edit(`${marker}: A restored clock stands in gallery ${i}.`); await waitStatus('synchronized');
        await page.evaluate(async i => {
            const c = SillyTavern.getContext();
            c.chat[1].mes = `SWIPE_${i}: The current visitor has ticket ${i}.`; c.chat[1].swipe_id = i + 1;
            await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_SWIPED, 1);
        }, i);
        await waitStatus('synchronized');
        check(`cycle ${i}: edit/swipe remote state matches source`, await remoteMatches());
        const before = await prompt();
        check(`cycle ${i}: scoped memory preserves recent messages and budget`, !before.aborted && before.injection?.includes(marker) && !new RegExp(`CYCLE_(?!${i}\\b)\\d+`).test(before.injection) && before.chat.filter(m => !m.mes.startsWith('[Past conversation excerpt:')).length === 2 && before.before === before.after && before.renderedTokens <= 800);
        await page.evaluate(async i => {
            const c = SillyTavern.getContext(); await c.deleteMessage(0);
            c.chat.push({ mes: `Recent arrival ${i}: ready for tomorrow.`, name: 'User', is_user: true, is_system: false, send_date: 0, extra: {} });
            await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, c.chat.length - 1);
        }, i);
        await waitStatus('synchronized');
        const after = await prompt();
        check(`cycle ${i}: deletion/addition leaves exact remote state and no deleted recall`, await remoteMatches() && !after.injection?.includes(marker));
        const writes = calls.filter(c => c.path.endsWith('/docs/upsert')).length;
        await field('sync').click(); await waitStatus('synchronized');
        check(`cycle ${i}: unchanged explicit sync performs no duplicate upsert`, calls.filter(c => c.path.endsWith('/docs/upsert')).length === writes);
        if ((i + 1) % 6 === 0) { await page.reload(); await reconnect(chatId); check(`cycle ${i}: reload remains consistent`, await remoteMatches()); }
        cycles.push({ index: i, chat: i % 2 ? 'branch' : 'parent', elapsedMs: performance.now() - cycleStarted });
    }
    return { cycles, elapsedMs: performance.now() - started, hostKills: 2, limits: 'Bounded 24-cycle sequential exercise, not a long-duration soak or live LambdaDB outage test.' };
}
