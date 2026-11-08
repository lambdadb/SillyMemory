// Native group chats on the pinned host with controlled plain completions and
// the local LambdaDB emulator. Synthetic data only; not answer-quality evidence.
import { createHash } from 'node:crypto';
import { expandMemorySettings, openChatMemory } from './settings-panel.mjs';

export async function runGroupChatScenarios({ page, field, waitStatus, check, calls, collections, screenshot }) {
    const completions = [];
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [{ id: 'group-reply-fixture' }] } }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
        const body = route.request().postDataJSON();
        const member = await page.evaluate(() => SillyTavern.getContext().name2);
        completions.push({ member, messages: body.messages });
        await route.fulfill({ json: { model: body.model, choices: [{ message: { role: 'assistant', content: `${member} reply ${completions.length}.` }, finish_reason: 'stop' }] } });
    });
    const groupReads = [];
    const observeReads = request => { if (new URL(request.url()).pathname === '/api/chats/group/get') groupReads.push(Date.now()); };
    page.on('request', observeReads);
    const original = await page.evaluate(() => {
        const c = SillyTavern.getContext();
        return { character: c.characters[c.characterId]?.name, file: c.getCurrentChatId() };
    });
    const groupId = await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        for (const [name, greeting] of [['Group Alice', 'Alice greets the travellers at the harbor.'], ['Group Bob', 'Bob waves from the lighthouse.']]) {
            const data = new FormData(); data.set('ch_name', name); data.set('description', `Synthetic group member ${name}`); data.set('first_mes', greeting);
            const response = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data });
            if (!response.ok) throw new Error('Could not create a synthetic group member');
        }
        await c.getCharacters();
        const members = ['Group Alice', 'Group Bob'].map(name => SillyTavern.getContext().characters.find(x => x.name === name).avatar);
        // List activation: every member answers each input, in order.
        const response = await fetch('/api/groups/create', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name: 'SillyMemory Group', members, activation_strategy: 1, disabled_members: [] }) });
        if (!response.ok) throw new Error('Could not create a synthetic group');
        const group = await response.json();
        const groups = await import('/scripts/group-chats.js');
        await groups.getGroups(); await groups.openGroupById(group.id);
        return group.id;
    });
    await page.waitForFunction(() => SillyTavern.getContext().chat.length === 2);
    const groupKey = `group:${groupId}`;
    const state = () => page.evaluate(() => {
        const c = SillyTavern.getContext();
        return { groupId: c.groupId, characterId: c.characterId, file: c.getCurrentChatId(), memory: c.chatMetadata.sillymemory, enabled: c.chatMetadata.sillymemoryEnabled,
            messages: c.chat.map(m => ({ name: m.name, user: m.is_user, mes: m.mes })) };
    });
    const saved = file => page.evaluate(async file => {
        const c = SillyTavern.getContext();
        const response = await fetch('/api/chats/group/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ id: file }) });
        if (!response.ok) throw new Error('Native group chat read failed');
        return response.json();
    }, file);
    const fresh = await state();
    check('a fresh group chat opens with member greetings and no generating member', fresh.groupId === groupId && fresh.characterId === undefined && fresh.messages.map(m => m.name).join() === 'Group Alice,Group Bob');
    await openChatMemory(page);
    check('group chats offer chat memory instead of the unsupported-chat blocker', await page.locator('#sillymemory-chat [data-sm-chat="toggle"]').isVisible()
        && !(await page.locator('#sillymemory-chat [data-sm-chat="label"]').textContent()).includes('Unavailable'));
    const readsBeforeActivation = groupReads.length, activationStarted = Date.now();
    await field('enabled').check(); await waitStatus('synchronized');
    const activationMs = Date.now() - activationStarted, activationReads = groupReads.length - readsBeforeActivation;
    const enabled = await state();
    const owner = await page.evaluate(() => SillyTavern.getContext().extensionSettings.sillymemory.owner);
    const scope = memory => createHash('sha256').update(JSON.stringify([owner, groupKey, memory.story])).digest('hex');
    const collectionName = memory => `smstory_${scope(memory).slice(0, 40)}`;
    const remote = memory => [...(collections.get(collectionName(memory))?.branches.get(`chat_${memory.id}`)?.values() || [])];
    check('turning memory on in a group saves and verifies the choice in the group chat file', (await saved(enabled.file))[0].chat_metadata.sillymemoryEnabled === true
        && JSON.stringify((await saved(enabled.file))[0].chat_metadata.sillymemory) === JSON.stringify(enabled.memory));
    check('a group story collection is scoped to the group owner key', collections.has(collectionName(enabled.memory)) && enabled.memory.story === enabled.memory.id);

    // Two answered bundles of one input and two member replies after the greetings.
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), greetings = c.chat.slice(0, 2);
        const rounds = [['The red key is in the boathouse.', 'Alice notes the boathouse.', 'Bob checks the tide.'], ['The tide turns at dusk.', 'Alice lights a lamp.', 'Bob counts the boats.']];
        c.chat.splice(0, c.chat.length, ...greetings, ...rounds.flatMap(([user, alice, bob]) => [
            { name: 'User', is_user: true, mes: user, extra: {} }, { name: 'Group Alice', is_user: false, mes: alice, extra: {} }, { name: 'Group Bob', is_user: false, mes: bob, extra: {} }]));
        await c.saveChat(); await c.reloadCurrentChat();
    });
    await waitStatus('synchronized');
    const before = await state();
    check('synchronization between member turns archives only messages before the recent bundle', before.characterId === undefined
        && JSON.stringify(remote(before.memory).map(d => d.message).sort((a, b) => a - b)) === '[0,1]');
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await page.evaluate(() => {
        const original = globalThis.sillymemory_intercept;
        globalThis.__smGroupTurns = [];
        globalThis.__smRestoreIntercept = () => { globalThis.sillymemory_intercept = original; };
        globalThis.sillymemory_intercept = async (...args) => {
            const c = SillyTavern.getContext(), started = performance.now();
            const turn = { member: c.name2, characterId: c.characterId, type: args[3] };
            await original(...args);
            turn.ms = Math.round(performance.now() - started);
            globalThis.__smGroupTurns.push(turn);
        };
    });
    const searches = () => calls.filter(call => call.body?.query?.bayesian);
    const upserts = memory => calls.filter(call => call.path.endsWith('/docs/upsert') && call.path.includes(collectionName(memory))
        && (call.body.branch || call.body.ref?.name || new URL(call.path, 'https://localhost').searchParams.get('refName')) === `chat_${memory.id}`);
    const round = async (type, input = '') => {
        const searchBefore = searches().length, completionBefore = completions.length, turnBefore = await page.evaluate(() => __smGroupTurns.length);
        // A stopped round rejects with the host's abort error, as the native stop button does.
        const stopped = await page.evaluate(async ({ type, input }) => {
            const c = SillyTavern.getContext();
            try {
                if (type === 'regenerate') await (await import('/scripts/group-chats.js')).regenerateGroup();
                else if (type === 'swipe') await (await import('/script.js')).swipe_right();
                else { document.querySelector('#send_textarea').value = input; await c.generate(type); }
            } catch (error) { return String(error?.message || error); }
            return '';
        }, { type, input });
        await page.waitForFunction(() => !document.body.dataset.generating && !SillyTavern.getContext().characterId);
        await waitStatus('synchronized');
        const turns = (await page.evaluate(() => __smGroupTurns)).slice(turnBefore);
        return { stopped, turns, searches: searches().slice(searchBefore), completions: completions.slice(completionBefore), state: await state(),
            label: await page.locator('#sillymemory-chat [data-sm-chat="label"]').textContent() };
    };
    const upsertsBefore = upserts(before.memory).length;
    const normal = await round('normal', 'Where is the red key?');
    const query = 'User: Where is the red key?';
    check('each responding member runs its own memory preparation with the same current-input search', normal.turns.map(t => t.member).join() === 'Group Alice,Group Bob'
        && normal.turns.every(t => t.characterId !== undefined && t.type === 'normal') && normal.searches.length === 2 && normal.searches.every(s => s.body.query.bayesian[0].knn.queryText === query));
    check('each member turn reaches native generation once with delivered memory', normal.completions.length === 2 && normal.completions.map(c => c.member).join() === 'Group Alice,Group Bob'
        && !normal.label.includes('Reply stopped') && normal.state.messages.slice(-2).map(m => m.name).join() === 'Group Alice,Group Bob');
    const aliceMessages = normal.completions[0].messages, bobMessages = normal.completions[1].messages;
    const recalled = messages => messages.find(m => typeof m.content === 'string' && m.content.includes('[Recalled conversation excerpts]'))?.content || '';
    check('recalled group excerpts keep their stored speaker names', recalled(aliceMessages).includes('assistant "Group Alice"') && recalled(aliceMessages).includes('assistant "Group Bob"'));
    const retained = (messages, text) => messages.some(m => !m.content.includes('[Recalled') && m.content.includes(text));
    // The new input's five-message window starts inside the first bundle, so both bundles stay recent.
    check('the first member keeps every bundle its recent window starts in', ['Bob checks the tide.', 'The tide turns at dusk.', 'Bob counts the boats.', 'Where is the red key?'].every(text => retained(aliceMessages, text)));
    check('the next member sees the previous member reply and archives the older bundle whole', retained(bobMessages, 'Group Alice reply')
        && ['The tide turns at dusk.', 'Where is the red key?'].every(text => retained(bobMessages, text))
        && !['The red key is in the boathouse.', 'Alice notes the boathouse.', 'Bob checks the tide.'].some(text => retained(bobMessages, text)));
    const bundleWrites = upserts(before.memory).slice(upsertsBefore).map(call => [...new Set(call.body.docs.map(d => d.message))].sort((a, b) => a - b));
    check('a displaced group bundle is uploaded together in one batch', JSON.stringify(bundleWrites) === '[[2,3,4]]'
        && JSON.stringify(remote(before.memory).map(d => d.message).sort((a, b) => a - b)) === '[0,1,2,3,4]');

    const regenerate = await round('regenerate');
    check('group Regenerate replaces the last round through normal member turns', regenerate.turns.map(t => `${t.member}:${t.type}`).join() === 'Group Alice:normal,Group Bob:normal'
        && regenerate.searches.length === 2 && regenerate.completions.length === 2 && regenerate.state.messages.length === normal.state.messages.length
        && !regenerate.completions[0].messages.some(m => m.content.includes(normal.state.messages.at(-2).mes)) && !regenerate.label.includes('Reply stopped'));
    const swipe = await round('swipe');
    const swipePrompt = swipe.completions[0]?.messages || [];
    check('group swipe regenerates only the member that wrote the last message', swipe.turns.map(t => `${t.member}:${t.type}`).join() === 'Group Bob:swipe'
        && swipe.completions.length === 1 && swipe.state.messages.at(-1).mes === `Group Bob reply ${completions.length}.` && !swipe.label.includes('Reply stopped'));
    const replaced = regenerate.state.messages.at(-1).mes, earlier = regenerate.state.messages.at(-2).mes;
    check('a group swipe keeps the earlier member reply of the round and drops only the swiped reply', earlier.startsWith('Group Alice reply')
        && swipePrompt.some(m => m.content.includes(earlier)) && !swipePrompt.some(m => m.content.includes(replaced)) && (swipe.label.includes('Memory added') || swipe.label.includes('No related memory')));
    const extended = await round('continue');
    check('group Continue extends the last member message with one member turn', extended.turns.map(t => `${t.member}:${t.type}`).join() === 'Group Bob:continue'
        && extended.completions.length === 1 && extended.state.messages.length === swipe.state.messages.length && extended.state.messages.at(-1).mes.startsWith(swipe.state.messages.at(-1).mes)
        && !extended.label.includes('Reply stopped'));
    // A memory preparation failure stops the whole round, persistent or only for the first member.
    const searchFailure = route => route.fulfill({ status: 503, json: { message: 'Synthetic search failure' } });
    const stoppedRound = (result, input) => result.turns.map(t => t.member).join() === 'Group Alice' && result.completions.length === 0 && result.searches.length === 0
        && result.label.includes('Reply stopped') && result.state.messages.at(-1).user && result.state.messages.at(-1).mes === input
        && result.stopped.includes('AbortSignal');
    await page.route('**/projects/synthetic/collections/*/query', searchFailure);
    const failed = await round('normal', 'What did Bob count?');
    await page.unroute('**/projects/synthetic/collections/*/query');
    check('a persistent memory failure in a group stops the round before any member replies', stoppedRound(failed, 'What did Bob count?'));
    await page.route('**/projects/synthetic/collections/*/query', searchFailure, { times: 1 });
    const firstFailed = await round('normal', 'Who lit the lamp?');
    await page.unroute('**/projects/synthetic/collections/*/query');
    await openChatMemory(page);
    check('a memory failure for the first member does not let a later member reply', stoppedRound(firstFailed, 'Who lit the lamp?')
        && await page.locator('#sillymemory-chat [data-sm-chat="retry"]').isVisible());
    const failure = { stopped: failed.stopped, turns: failed.turns.map(t => t.member), firstOnlyTurns: firstFailed.turns.map(t => t.member), label: failed.label };

    // Native checkpoint and branch in a group fork the group story memory.
    const source = await state();
    const sourceDocs = structuredClone(remote(source.memory));
    await openChatMemory(page);
    await page.locator('#options_button').click(); await page.locator('#option_new_bookmark').click();
    await page.locator('.popup .popup-input').fill('Group checkpoint fixture');
    await page.locator('.popup .popup-button-ok').click();
    await page.waitForFunction(() => SillyTavern.getContext().chat.at(-1)?.extra?.bookmark_link === 'Group checkpoint fixture');
    await page.evaluate(async groupId => { await SillyTavern.getContext().openGroupChat(groupId, 'Group checkpoint fixture'); }, groupId);
    await waitStatus('synchronized');
    const checkpoint = await state();
    const createdBranches = () => calls.filter(call => call.method === 'POST' && call.path.endsWith(`/collections/${collectionName(source.memory)}/branches`));
    check('opening a group checkpoint keeps memory on and forks the group story', checkpoint.file === 'Group checkpoint fixture' && checkpoint.enabled === true
        && checkpoint.memory.id !== source.memory.id && checkpoint.memory.story === source.memory.story && checkpoint.memory.source === source.memory.id
        && createdBranches().some(call => call.body.branchName === `chat_${checkpoint.memory.id}` && call.body.source.name === `chat_${source.memory.id}`));
    const branchWritesBefore = calls.filter(call => call.path.endsWith('/docs/upsert')).length;
    await page.evaluate(async () => { await (await import('/scripts/bookmarks.js')).branchChat(4); });
    await waitStatus('synchronized');
    const branch = await state();
    check('a group branch reuses its parent memory and excludes the later transcript', branch.messages.length === 5 && branch.memory.story === source.memory.story
        && branch.memory.source === checkpoint.memory.id && remote(branch.memory).every(d => d.message < 5)
        && createdBranches().some(call => call.body.branchName === `chat_${branch.memory.id}` && call.body.source.name === `chat_${checkpoint.memory.id}`)
        && calls.filter(call => call.path.endsWith('/docs/upsert')).length === branchWritesBefore);
    check('group forks leave the source group memory and transcript intact', JSON.stringify(remote(source.memory)) === JSON.stringify(sourceDocs)
        && (await saved(source.file)).slice(1).map(m => m.mes).join('\n') === source.messages.map(m => m.mes).join('\n'));
    await field('enabled').uncheck();
    check('turning memory off in a group branch is saved in its own file', (await saved(branch.file))[0].chat_metadata.sillymemoryEnabled === false
        && (await saved(source.file))[0].chat_metadata.sillymemoryEnabled === true);
    await screenshot?.('group-chat-memory');

    // Reload restores each group chat's saved choice after verified reconnection.
    page.off('request', observeReads);
    await page.evaluate(() => globalThis.__smRestoreIntercept?.());
    const reopen = async file => {
        await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
        await waitStatus('Connected.');
        await page.evaluate(async ({ groupId, file }) => {
            const groups = await import('/scripts/group-chats.js');
            await groups.openGroupById(groupId); await SillyTavern.getContext().openGroupChat(groupId, file);
        }, { groupId, file });
        await page.waitForFunction(file => SillyTavern.getContext().getCurrentChatId() === file, file);
    };
    await reopen(source.file);
    await page.waitForFunction(() => document.querySelector('#sillymemory-chat [data-sm-chat=toggle]').getAttribute('aria-pressed') === 'true');
    await waitStatus('synchronized');
    check('reload restores memory on in the group chat', await field('enabled').isChecked());
    await page.evaluate(async ({ groupId, file }) => { await SillyTavern.getContext().openGroupChat(groupId, file); }, { groupId, file: branch.file });
    await waitStatus('Memory is off');
    check('reload keeps memory off in the group branch', !await field('enabled').isChecked());

    await page.unroute('**/api/backends/chat-completions/generate'); await page.unroute('**/api/backends/chat-completions/status');
    // Later harness steps continue in the original character chat.
    await page.evaluate(async ({ character, file }) => {
        const c = SillyTavern.getContext();
        await c.selectCharacterById(c.characters.findIndex(x => x.name === character));
        if (SillyTavern.getContext().getCurrentChatId() !== file) await SillyTavern.getContext().openCharacterChat(file);
    }, original);
    await waitStatus('synchronized');
    // The reload closed the settings drawer that the next harness step uses.
    await expandMemorySettings(page);
    const memberTurns = [...normal.turns, ...regenerate.turns, ...swipe.turns, ...extended.turns];
    return {
        activation: { ms: activationMs, groupChatReads: activationReads },
        memberTurns, searchesPerUserTurn: normal.searches.length, completionsPerUserTurn: normal.completions.length,
        preparationFailure: failure,
    };
}
