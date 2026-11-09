// Native group chats on the pinned host with controlled plain completions and
// the local LambdaDB emulator. Synthetic data only; not answer-quality evidence.
import { createHash } from 'node:crypto';
import { expandMemorySettings, openChatMemory } from './settings-panel.mjs';

export async function runGroupChatScenarios({ page, field, waitStatus, check, calls, collections, screenshot }) {
    const completions = [];
    let longReplies = false;
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [{ id: 'group-reply-fixture' }] } }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
        const body = route.request().postDataJSON();
        const member = await page.evaluate(() => SillyTavern.getContext().name2);
        completions.push({ member, messages: body.messages });
        const content = `${member} reply ${completions.length}.` + (longReplies ? ` ${'The harbor fog rolls over the quiet docks. '.repeat(20)}` : '');
        await route.fulfill({ json: { model: body.model, choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] } });
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
        // Member replies of one round share the host's group generation ID.
        c.chat.splice(0, c.chat.length, ...greetings, ...rounds.flatMap(([user, alice, bob], round) => [
            { name: 'User', is_user: true, mes: user, extra: {} }, { name: 'Group Alice', is_user: false, mes: alice, extra: { gen_id: 100 + round } },
            { name: 'Group Bob', is_user: false, mes: bob, extra: { gen_id: 100 + round } }]));
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
    const deliveryText = () => page.locator('#sillymemory-chat [data-sm-chat="delivery"]').textContent();

    // A stop after an earlier member replied: group Regenerate would redo the whole round.
    let queries = 0;
    await page.route('**/projects/synthetic/collections/*/query', route => ++queries === 2 ? searchFailure(route) : route.continue());
    const midRound = await round('normal', 'What did Bob count?');
    await page.unroute('**/projects/synthetic/collections/*/query');
    const midText = await deliveryText();
    await openChatMemory(page);
    check('a mid-round stop keeps the earlier reply and points to the per-member trigger instead of Regenerate', midRound.completions.map(c => c.member).join() === 'Group Alice'
        && midRound.state.messages.at(-1).name === 'Group Alice' && midText.includes('Regenerate redoes the whole round') && midText.includes('Trigger a message from this character')
        && !midText.includes('Auto Mode') && await page.locator('#sillymemory-chat [data-sm-chat="retry"]').isHidden());

    // Auto Mode: a SillyMemory stop turns it off through the host's stop listener.
    const autoMode = () => page.evaluate(async () => (await import('/scripts/group-chats.js')).is_group_automode_enabled);
    const idle = () => page.waitForFunction(() => !document.body.dataset.generating && SillyTavern.getContext().characterId === undefined);
    const runAuto = async () => {
        const turnBefore = await page.evaluate(() => __smGroupTurns.length), completionBefore = completions.length, started = Date.now();
        await page.evaluate(() => { jQuery('#rm_group_automode_delay').val(1).trigger('input'); jQuery('#rm_group_automode').prop('checked', true).trigger('input'); });
        let stoppedAfterMs;
        for (let i = 0; i < 240 && stoppedAfterMs === undefined; i++) { if (!await autoMode()) stoppedAfterMs = Date.now() - started; else await page.waitForTimeout(250); }
        await idle();
        const turnsAtStop = (await page.evaluate(() => __smGroupTurns.length)) - turnBefore, completionsAtStop = completions.length - completionBefore;
        await page.waitForTimeout(3000); // Three Auto Mode intervals.
        return { stoppedAfterMs, turnsAtStop, completionsAtStop, text: await deliveryText(), label: await page.locator('#sillymemory-chat [data-sm-chat="label"]').textContent(),
            laterTurns: (await page.evaluate(() => __smGroupTurns.length)) - turnBefore - turnsAtStop, laterCompletions: completions.length - completionBefore - completionsAtStop, stillOff: !await autoMode() };
    };
    await page.route('**/projects/synthetic/collections/*/query', searchFailure);
    const autoFailure = await runAuto();
    await page.unroute('**/projects/synthetic/collections/*/query');
    check('a memory failure in Auto Mode stops the round and turns Auto Mode off without further rounds', autoFailure.stoppedAfterMs !== undefined && autoFailure.turnsAtStop === 1
        && autoFailure.completionsAtStop === 0 && autoFailure.laterTurns === 0 && autoFailure.stillOff && autoFailure.text.includes('Auto Mode was turned off'));
    // Rounds that pass their own signal, as Auto Mode does, reuse the host's controller.
    // SillyMemory replaces the one it aborted after the stopped round, so turning Auto
    // Mode on again right away, without a message, generates with memory.
    const restartTurns = await page.evaluate(() => __smGroupTurns.length), restartCompletions = completions.length, restartSearches = searches().length;
    await page.evaluate(() => jQuery('#rm_group_automode').prop('checked', true).trigger('input'));
    for (let i = 0; i < 120 && completions.length - restartCompletions < 2; i++) await page.waitForTimeout(250);
    await page.evaluate(() => jQuery('#rm_group_automode').prop('checked', false).trigger('input'));
    await idle(); await waitStatus('synchronized');
    const restarted = { turns: (await page.evaluate(() => __smGroupTurns.length)) - restartTurns, completions: completions.length - restartCompletions,
        searches: searches().length - restartSearches, label: await page.locator('#sillymemory-chat [data-sm-chat="label"]').textContent() };
    check('Auto Mode turned on again right after a SillyMemory stop generates every member turn with memory', restarted.completions >= 2
        && restarted.completions === restarted.turns && restarted.searches === restarted.turns && !restarted.label.includes('Reply stopped'));
    const resume = await round('normal', 'The fog is back, everyone.');
    check('after an Auto Mode stop an ordinary message gets every member reply again', resume.completions.length === 2 && !resume.label.includes('Reply stopped'));
    // A long Auto Mode run keeps its whole bundle until it outgrows a small context.
    const hostContext = await page.evaluate(async () => { const { oai_settings } = await import('/scripts/openai.js'); const previous = oai_settings.openai_max_context; oai_settings.openai_max_context = 3000; return previous; });
    longReplies = true;
    const firstRunReply = completions.length + 1;
    const autoLong = await runAuto();
    longReplies = false;
    // The stopped turn sends no completion, although its controller is replaced afterwards.
    check('a long Auto Mode run stops with the missing-context check and turns Auto Mode off', autoLong.stoppedAfterMs !== undefined && autoLong.completionsAtStop >= 6
        && autoLong.completionsAtStop === autoLong.turnsAtStop - 1 && autoLong.laterCompletions === 0
        && autoLong.text.startsWith('Reply stopped: Some') && autoLong.text.includes('left out') && autoLong.text.includes('Auto Mode was turned off') && autoLong.laterTurns === 0 && autoLong.stillOff);
    // A new input splits the older run at generation rounds: the last rounds stay with
    // the input, earlier rounds are archived, and the same small context fits again.
    const runStart = (await state()).messages.findLastIndex(m => m.user);
    const writesBefore = upserts(before.memory).length;
    const afterRun = await round('normal', 'Back to the harbor, everyone.');
    const lastRunReply = firstRunReply + autoLong.completionsAtStop - 1;
    const written = upserts(before.memory).slice(writesBefore).flatMap(call => call.body.docs.map(d => d.message));
    const anaPrompt = JSON.stringify(afterRun.completions[0]?.messages || []);
    const resumed = { stopped: afterRun.label.includes('Reply stopped'), completions: afterRun.completions.length, text: await deliveryText(),
        archivedRun: remote(before.memory).some(d => d.message > runStart), writtenRunMessages: written.filter(m => m > runStart).length };
    check('after a long Auto Mode run stops, one new message gets every member reply and archives the earlier rounds', !resumed.stopped && resumed.completions === 2
        && resumed.archivedRun && resumed.writtenRunMessages > 0 && anaPrompt.includes(`reply ${lastRunReply}.`) && !anaPrompt.includes(`Group Alice: Group Alice reply ${firstRunReply}.`));
    await page.evaluate(async previous => { (await import('/scripts/openai.js')).oai_settings.openai_max_context = previous; }, hostContext);

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

    // Inventory cost: 20 group chats against 20 character chats of 500 synthetic messages each.
    const inventory = await page.evaluate(async groupId => {
        const c = SillyTavern.getContext(), { hostChats } = await import('/scripts/extensions/third-party/sillymemory/src/chat-collections.js');
        const transcript = n => [{ chat_metadata: { integrity: crypto.randomUUID() }, user_name: 'unused', character_name: 'unused' }, ...Array.from({ length: 500 }, (_, i) => ({
            name: i % 3 ? 'Group Alice' : 'User', is_user: i % 3 === 0, extra: {}, send_date: Date.now(), mes: `Inventory ${n}-${i}. ${'The harbor fog rolls over the quiet docks. '.repeat(4)}` }))];
        const post = (url, body) => fetch(url, { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify(body) }).then(r => { if (!r.ok) throw new Error(`Fixture write failed: ${url}`); });
        const group = c.groups.find(g => g.id === groupId);
        for (let n = group.chats.length; n < 20; n++) { const id = `Inventory group chat ${n}`; await post('/api/chats/group/save', { id, chat: transcript(n) }); group.chats.push(id); }
        await (await import('/scripts/group-chats.js')).editGroup(groupId, true, false);
        const data = new FormData(); data.set('ch_name', 'Inventory Fixture'); data.set('first_mes', 'Inventory fixture.');
        if (!(await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data })).ok) throw new Error('Fixture character failed');
        await c.getCharacters();
        const characters = SillyTavern.getContext().characters, characterId = characters.findIndex(x => x.name === 'Inventory Fixture');
        for (let n = 0; n < 20; n++) await post('/api/chats/save', { avatar_url: characters[characterId].avatar, file_name: `Inventory character chat ${n}`, chat: transcript(n) });
        const time = async ctx => {
            const runs = [];
            for (let i = 0; i < 3; i++) { const started = performance.now(); const chats = await hostChats(ctx).inventory(); runs.push({ ms: Math.round(performance.now() - started), chats: chats.length }); }
            return { medianMs: runs.map(r => r.ms).sort((a, b) => a - b)[1], chats: runs[0].chats, runs: runs.map(r => r.ms) };
        };
        return { group: await time({ groupId, groups: SillyTavern.getContext().groups, getRequestHeaders: c.getRequestHeaders }),
            character: await time({ characterId, characters, getRequestHeaders: c.getRequestHeaders }) };
    }, groupId);
    const openStarted = Date.now();
    await page.evaluate(async ({ groupId, file }) => { await SillyTavern.getContext().openGroupChat(groupId, file); }, { groupId, file: source.file });
    await waitStatus('synchronized');
    inventory.openWithMemoryMs = Date.now() - openStarted;
    check('group chat inventory reads every chat in the group list', inventory.group.chats === 20 && inventory.character.chats === 20);
    console.log(`MEASURE group inventory ${JSON.stringify(inventory)}`);

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
        preparationFailure: failure, autoFailure, autoRestart: restarted, autoLong, afterAutoRun: resumed, inventory,
    };
}
