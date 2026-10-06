import { createCheckpoint, finishCheckpoint, resumeCheckpoint, listCheckpoints, checkpointRows, renameCheckpoint, deleteCheckpoint } from './src/checkpoints.js';
import { LambdaClient, ConnectionError, connectionConfig } from './src/client.js';
import { ChatCollections, chatCollection, ensureChatIdentity } from './src/chat-collections.js';
import { runTransportGate } from './src/gate.js';
import { MemoryEngine, Journal, capture, fingerprint, options } from './src/memory.js';
import { OperationStatus, failureText } from './src/status.js';
import { PromptDelivery, expectedMessages, deliverySummary } from './src/delivery.js';

const context = () => SillyTavern.getContext();
const uuid = () => crypto.randomUUID().replaceAll('-', '');
let client, engine, root, state, stateKey, owner, timer, busy = false, gatePassed = false;
let sessionReady = false;
let promptSequence = 0;
let retrievalSequence = 0, retrievalOperation;
let statusView, collections, identityKey;
let preparation = Promise.resolve();
let checkpointRevision = 0;
const engines = new Map();
const entryKey = entry => `${entry.collection}:${entry.branch}`;
const delivery = new PromptDelivery();
const element = name => root.querySelector(`[data-sm="${name}"]`);
const status = text => statusView.show(text);
function clearInjection() {
    context().setExtensionPrompt('sillymemory', '', 1, 0, false, 0);
}
function invalidate() { promptSequence++; engine?.invalidate(); clearInjection(); delivery.clear(); }
function persist() { localStorage.setItem(stateKey, JSON.stringify(state)); }
function makeCollections() {
    engine = undefined; engines.clear(); identityKey = undefined;
    collections = client ? new ChatCollections(client, owner, entry => {
        state.chatCollections ??= [];
        if (!state.chatCollections.some(e => entryKey(e) === entryKey(entry))) { state.chatCollections.push(entry); persist(); }
    }, (name, branch) => {
        state.chatCollections = (state.chatCollections || []).filter(e => e.collection !== name || (branch && e.branch !== branch));
        persist();
    }) : undefined;
}
function prepareMemory(valid, progress = () => {}) {
    const task = preparation.catch(() => {}).then(async () => {
        if (!valid() || !collections) return null;
        const ctx = context(), file = ctx.getCurrentChatId(), avatar = ctx.characters[ctx.characterId]?.avatar;
        if (!capture(ctx)) throw new ConnectionError('Select a supported character chat.');
        const key = () => JSON.stringify([avatar, file, ctx.chatMetadata.sillymemory, ctx.chatMetadata.integrity]);
        if (identityKey !== key()) {
            const { saveChat } = await import('/script.js');
            if (!valid() || !await ensureChatIdentity(ctx, saveChat, valid)) return null;
            identityKey = key();
        }
        if (!valid()) return null;
        if (ctx.chatMetadata.sillymemory?.checkpoint) throw new ConnectionError('This is a saved checkpoint. Resume it in a new chat before enabling memory.');
        const snapshot = capture(context());
        const entry = await collections.ensure(snapshot, valid, options(state), progress);
        if (!entry || !valid()) return null;
        if (!engines.has(entryKey(entry))) engines.set(entryKey(entry), new MemoryEngine({ client, owner, ...entry,
            journal: new Journal(localStorage, `${owner}:${entry.collection}:${entry.branch}`) }));
        engine = engines.get(entryKey(entry));
        return { snapshot, instance: engine };
    });
    preparation = task; return task;
}
async function drain() {
    await preparation.catch(() => {});
    await Promise.all([...engines.values()].map(e => e.queue.catch(() => {})));
}
function validSnapshot(snapshot, instance) {
    return sessionReady && state.enabled && engine === instance && fingerprint(capture(context())) === fingerprint(snapshot);
}
async function sync() {
    if (!sessionReady || !state.enabled || !state.ready || !client || busy) return;
    const sequence = promptSequence;
    const current = () => sequence === promptSequence && sessionReady && state.enabled;
    const operation = statusView.start(current);
    try {
        const prepared = await prepareMemory(current, operation.update); if (!prepared) return;
        const { snapshot, instance } = prepared;
        const valid = () => current() && validSnapshot(snapshot, instance);
        const result = await instance.sync(snapshot, options(state), valid, operation.update);
        if (result) operation.finish(`Current chat synchronized: ${result.docs.length} older chunks. Memory will be retrieved on generation.`);
    } catch (e) { if (operation.current()) fail(e, operation); }
}
function schedule() {
    if (!sessionReady) return; // Preserve the lock-conflict explanation.
    invalidate(); clearTimeout(timer);
    if (!client) { status('Enter your project API key. Keys are cleared on reload.'); return; }
    if (!state.enabled) { status('Memory disabled. Remote data is retained until deleted.'); return; }
    if (!state.ready || !capture(context())) { status('Select a supported character chat and connect to a memory collection.'); return; }
    status('Waiting to synchronize current chat…');
    timer = setTimeout(sync, 400);
}
function fail(error, operation) {
    clearInjection();
    if (root) element('inspection').textContent = 'No memory injected: operation failed.';
    if (operation) operation.fail(error); else status(failureText(error, { sync: false }));
}
async function action(job) {
    if (busy) return;
    busy = true; root.querySelectorAll('button, input').forEach(x => { x.disabled = true; });
    try { await job(); } catch (e) { fail(e); }
    finally { busy = false; root.querySelectorAll('button, input').forEach(x => { x.disabled = false; }); }
}

// Called with SillyTavern's ephemeral coreChat array. Never mutate source messages.
globalThis.sillymemory_intercept = async (chat, contextSize, abort, type) => {
    if (delivery.awaitingPrompt) {
        // No final event will be emitted for this rejected interceptor. Keep the
        // previous slot until its own non-dry-run final event has been consumed.
        element('delivery').textContent = 'Another prompt is awaiting final verification. Wait and generate again. If prompt preparation failed, reload to reset it.';
        abort(true); return;
    }
    // Quiet prompts cancel older reads/injection while preserving source sync.
    if (type === 'quiet') {
        retrievalOperation?.finish('Memory retrieval skipped for quiet generation.');
        retrievalSequence++; engine?.cancelReads(); clearInjection(); delivery.clear(); return;
    }
    invalidate();
    const sequence = promptSequence;
    const retrieval = ++retrievalSequence;
    if (!sessionReady || busy || !state?.enabled || !state.ready || !client) return;
    if (context().extensionSettings.vectors?.enabled_chats) {
        status('Disable built-in Vector Storage chat vectorization before using SillyMemory.'); return;
    }
    let snapshot = capture(context()); if (!snapshot) { status('Select a supported character chat to use memory.'); return; }
    clearTimeout(timer); // Retrieval below replaces the pending synchronization.
    let instance; const config = options(state);
    const promptBefore = JSON.stringify(chat);
    const sourceBefore = JSON.stringify([context().getCurrentChatId(), snapshot.character, snapshot.messages]);
    const sameSource = () => { const s = capture(context()); return s && JSON.stringify([context().getCurrentChatId(), s.character, s.messages]) === sourceBefore; };
    const sourceValid = () => sequence === promptSequence && validSnapshot(snapshot, instance);
    const unchangedPrompt = () => sourceValid() && JSON.stringify(chat) === promptBefore;
    const valid = () => retrieval === retrievalSequence && unchangedPrompt();
    const operation = statusView.start(() => retrieval === retrievalSequence && sequence === promptSequence);
    retrievalOperation = operation;
    let preparedMessages = [], abandoned = false;
    try {
        const prepared = await prepareMemory(() => sequence === promptSequence && sessionReady && state.enabled && sameSource() && JSON.stringify(chat) === promptBefore);
        if (!prepared) { abandoned = true; abort(true); return; }
        ({ snapshot, instance } = prepared);
        // The extension budget includes its complete wrapper; SillyTavern still manages
        // total prompt overhead, character instructions, and final model context limits.
        config.budget = Math.min(config.budget, Math.max(0, Math.floor(contextSize / 4)));
        const result = await instance.retrieve(snapshot, config, text => context().getTokenCountAsync(text), unchangedPrompt, operation.update, type);
        if (!valid()) { operation.finish('Memory operation canceled because the prompt changed. Generate again.'); abandoned = true; abort(true); return; }
        if (!result?.text) { operation.finish('No current matching memory fits the budget. Original prompt retained.'); return; }
        // Protect the most recent prompt messages, including during swipe/regenerate.
        const cutoff = chat.length - config.recent;
        const indexedMessages = new Set(result.passages.map(p => p.message));
        // All plain older messages were candidates; retain special/file/tool messages.
        const eligible = new Set(snapshot.messages.slice(0, -config.recent).filter(m => m.eligible && m.text.trim()).map(m => m.index));
        // Require the pinned coreChat index contract before pruning anything.
        if (!chat.every(m => Number.isInteger(m.index))) { operation.finish('Unexpected prompt shape. Original prompt retained.'); return; }
        if (![...indexedMessages].every(i => eligible.has(i))) { operation.finish('Memory no longer matches eligible source. Original prompt retained.'); return; }
        // Replace only eligible old prompt messages, in place and in source order.
        // Preserve native user/assistant roles instead of flattening all excerpts
        // into one system message. These copies never enter the persisted chat.
        const recalled = new Map();
        for (const message of result.messages) {
            const group = recalled.get(message.index) || [];
            group.push(message); recalled.set(message.index, group);
        }
        for (let i = cutoff - 1; i >= 0; i--) {
            if (eligible.has(chat[i].index)) chat.splice(i, 1, ...(recalled.get(chat[i].index) || []));
        }
        element('inspection').textContent = `${result.tokens} / ${config.budget} tokens\n\n${result.text}`;
        preparedMessages = result.messages;
        operation.finish(`Prepared ${result.passages.length} passages (${result.tokens} tokens); awaiting final prompt verification.`);
    } catch (e) {
        if (!instance) { if (operation.current()) fail(e, operation); abandoned = true; abort(true); return; }
        if (!valid()) { operation.finish('Memory operation canceled because the prompt changed. Generate again.'); abandoned = true; abort(true); return; }
        if (operation.current()) fail(e, operation);
    } finally {
        // Reserve only after retrieval: superseded in-flight reads still abort
        // through the existing validity check and never claim a final event.
        if (!abandoned && sourceValid()) {
            const names = { user: context().name1, character: context().name2 };
            delivery.begin({ memory: expectedMessages(preparedMessages, names), recent: expectedMessages(chat.slice(-config.recent), { ...names, continuation: type === 'continue' }) }, sourceValid);
            element('delivery').textContent = 'Memory prepared; waiting for the final host prompt. Delivery is not yet verified.';
        }
        if (retrievalOperation === operation) retrievalOperation = undefined;
    }
};

async function initialize() {
    const ctx = context();
    ctx.extensionSettings.sillymemory ??= {};
    owner = ctx.extensionSettings.sillymemory.owner;
    if (!/^[a-f0-9]{32}$/.test(owner || '')) {
        owner = uuid(); ctx.extensionSettings.sillymemory = { owner };
        // Persist the namespace before any remote resource can be created. A
        // debounced settings save alone can be lost on an immediate reload.
        const { saveSettings } = await import('/script.js');
        await saveSettings();
        const response = await fetch('/api/settings/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' });
        if (!response.ok) throw new Error('Installation identity was not persisted.');
        const stored = await response.json();
        if (JSON.parse(stored.settings).extension_settings?.sillymemory?.owner !== owner) throw new Error('Installation identity was not persisted.');
    }
    stateKey = `sillymemory:state:${owner}`;
    state = { endpoint: '', project: '', enabled: false, ready: false, recent: 12, budget: 1600, stopOnLoss: true, chatCollections: [], ...JSON.parse(localStorage.getItem(stateKey) || '{}') };
    const folder = new URL('.', import.meta.url).pathname.split('/scripts/extensions/')[1].replace(/\/$/, '');
    const html = await ctx.renderExtensionTemplateAsync(folder, 'settings');
    document.querySelector('#extensions_settings2').insertAdjacentHTML('beforeend', html);
    root = document.querySelector('#sillymemory');
    statusView = new OperationStatus((text, progress) => {
        element('status').textContent = text;
        const bar = element('progress');
        bar.hidden = !progress;
        if (progress?.total > 0) { bar.max = progress.total; bar.value = progress.completed; }
        else bar.removeAttribute('value');
    });
    for (const name of ['endpoint', 'project', 'recent', 'budget']) element(name).value = state[name];
    element('stopOnLoss').checked = state.stopOnLoss !== false;
    element('stopOnLoss').onchange = () => { state.stopOnLoss = element('stopOnLoss').checked; persist(); };
    element('enabled').checked = false; state.enabled = false; persist();
    if (!navigator.locks) { status('This browser needs Web Locks support (localhost or HTTPS) to use SillyMemory safely.'); return; }
    // One live instance per account/browser, preventing cross-tab write/delete races.
    navigator.locks.request(`sillymemory-session:${owner}`, { ifAvailable: true }, async lock => {
        if (!lock) { status('SillyMemory is already open in another tab. Close that tab and reload this one.'); root.querySelectorAll('button,input').forEach(x => { x.disabled = true; }); return; }
        sessionReady = true;
        await new Promise(resolve => addEventListener('pagehide', resolve, { once: true }));
        sessionReady = false; client?.forget(); invalidate();
    });
    element('connect').onclick = () => action(async () => {
        const candidate = connectionConfig({ endpoint: element('endpoint').value.trim(), project: element('project').value.trim() });
        if ((state.testCollection || state.chatCollections.length) && (candidate.endpoint !== state.endpoint || candidate.project !== state.project)) throw new ConnectionError('Clean up owned collections before changing the connection.');
        invalidate(); status('Connecting: waiting for earlier writes to finish…');
        await drain(); client?.forget();
        client = new LambdaClient(candidate, element('key').value);
        element('key').value = ''; gatePassed = false;
        Object.assign(state, candidate); persist(); makeCollections();
        status('Key is in browser memory. Run the synthetic transport test before creating a memory collection.');
    });
    element('forget').onclick = () => action(async () => {
        state.enabled = false; element('enabled').checked = false; persist(); invalidate();
        status('Forgetting key: waiting for earlier writes to finish…');
        await drain(); client?.forget(); client = undefined; makeCollections();
        element('delivery').textContent = 'Key forgotten. No pending prompt verification.';
        element('inspection').textContent = 'No memory prepared.';
        element('key').value = ''; gatePassed = false; status('Key forgotten. Enter it again to reconnect.');
    });
    element('gate').onclick = () => action(async () => {
        if (!client) throw new ConnectionError('Enter your API key first.');
        if (state.testCollection) throw new ConnectionError('Clean up the previous test collection before testing again.');
        state.testCollection = `smtest_${uuid()}`; persist();
        gatePassed = await runTransportGate(client, owner, state.testCollection, status);
        delete state.testCollection; persist();
    });
    element('cleanup').onclick = () => action(async () => {
        if (!client) throw new ConnectionError('Enter your API key first.');
        if (state.testCollection) await client.deleteOwnedCollection(state.testCollection, owner);
        delete state.testCollection; persist(); status('No pending owned test collection remains.');
    });
    element('provision').onclick = () => action(async () => {
        if (!client || !gatePassed) throw new ConnectionError('Pass the synthetic transport test in this session first.');
        state.ready = true; persist();
        status('Chat memory is ready. Enable memory to synchronize. Native branches share unchanged committed history.');
    });
    function checkpointReader(ctx, avatar) {
        const request = async (url, body) => {
            const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000), headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, ...body }) });
            if (!response.ok) throw new ConnectionError('Could not read the saved checkpoint.');
            return response.json();
        };
        return { read: name => request('/api/chats/get', { file_name: name }), list: () => request('/api/characters/chats', { metadata: true }) };
    }
    let listSequence = 0;
    async function refreshCheckpoints() {
        const sequence = ++listSequence, ctx = context(), file = ctx.getCurrentChatId();
        const avatar = ctx.characters[ctx.characterId]?.avatar, story = ctx.chatMetadata.sillymemory?.story;
        const valid = () => sequence === listSequence && context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
        const list = element('checkpoint-list'); list.replaceChildren();
        if (!capture(ctx) || !story) { list.textContent = 'Select a story to view its checkpoints.'; return; }
        list.textContent = 'Checking saved transcripts and memory branches…';
        try {
            const rows = await listCheckpoints({ host: checkpointReader(ctx, avatar), client, owner, story, avatar, valid });
            if (!valid()) return;
            list.replaceChildren();
            const labels = { ready: 'Ready', pending: 'Pending — finish preparation', modified: 'Transcript modified', missing: 'Remote memory missing', 'remote-changed': 'Remote memory changed', duplicate: 'Duplicate identity — actions blocked', unverified: 'Remote state unverified — reconnect and refresh' };
            for (const row of rows) {
                const item = document.createElement('div'); item.className = 'sm-checkpoint'; item.dataset.file = row.file;
                const title = document.createElement('strong'); title.textContent = row.name;
                const detail = document.createElement('p'); detail.textContent = `${row.createdAt || 'Unknown creation time'} · ${labels[row.status]}`;
                const buttons = document.createElement('div'); buttons.className = 'sm-actions';
                const add = (text, handler) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'menu_button'; button.textContent = text; button.onclick = () => action(handler); buttons.append(button); };
                if (row.status === 'ready') add('Resume', () => checkpointAction(true, row.file));
                if (row.status === 'pending') add('Finish / retry', () => checkpointAction(false, row.file));
                if (row.status !== 'duplicate' && row.file !== file) {
                    if (['ready', 'pending', 'missing', 'unverified', 'remote-changed'].includes(row.status)) add('Rename', () => checkpointAction(false, row.file, 'rename'));
                    add('Delete checkpoint', () => checkpointAction(false, row.file, 'delete'));
                }
                item.append(title, detail, buttons); list.append(item);
            }
            if (!rows.length) list.textContent = 'No saved checkpoints in this story.';
        } catch (error) { if (valid()) list.textContent = 'Checkpoint list unavailable. Reconnect and refresh.'; throw error; }
    }
    element('checkpoint-refresh').onclick = () => action(refreshCheckpoints);
    async function checkpointAction(resume, selected, command) {
        if (!client || !collections || !state.ready || !capture(context())) throw new ConnectionError('Connect, prepare memory and select a character chat first.');
        const ctx = context(), file = ctx.getCurrentChatId(), avatar = ctx.characters[ctx.characterId]?.avatar;
        const revision = checkpointRevision;
        const valid = () => revision === checkpointRevision && context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
        state.enabled = false; element('enabled').checked = false; persist(); invalidate(); clearTimeout(timer);
        await drain();
        const { saveChat, isGenerating } = await import('/script.js');
        if (isGenerating()) throw new ConnectionError('Wait for generation to finish before preparing a checkpoint.');
        const host = {
            ...checkpointReader(ctx, avatar),
            save: async (name, messages, metadata) => {
                const response = await fetch('/api/chats/save', { method: 'POST', signal: AbortSignal.timeout(15000), headers: ctx.getRequestHeaders(), body: JSON.stringify({
                    ch_name: ctx.characters[ctx.characterId].name, avatar_url: avatar, file_name: name, force: false,
                    chat: [{ user_name: 'unused', character_name: 'unused', chat_metadata: metadata }, ...messages],
                }) });
                if (!response.ok) throw new ConnectionError('Checkpoint chat save failed. Select the saved checkpoint to retry if it exists.');
            },
            remove: async name => {
                if (!valid() || context().getCurrentChatId() === name) throw new ConnectionError('Open another story path before deleting this checkpoint.');
                const response = await fetch('/api/chats/delete', { method: 'POST', signal: AbortSignal.timeout(15000), headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, chatfile: `${name}.jsonl` }) });
                if (!response.ok) throw new ConnectionError('Checkpoint file deletion failed. Its remote branch may already be gone. Refresh and retry.');
            },
            withWriteLock: async job => {
                if (isGenerating()) throw new ConnectionError('Wait for generation to finish before completing the checkpoint.');
                const handle = ctx.loader.show({ blocking: true, toastMode: 'static', message: 'Verifying and saving checkpoint…' });
                try { return await job(); } finally { await handle.hide(); }
            },
            open: async name => {
                await context().openCharacterChat(name);
                if (context().getCurrentChatId() !== name) throw new ConnectionError('Resume chat was saved but could not be opened. Retry to open the same chat.');
            },
        };
        if (!valid()) return;
        const intents = {
            get: key => JSON.parse(localStorage.getItem(`sillymemory:resume:${key}`) || 'null'),
            set: (key, value) => localStorage.setItem(`sillymemory:resume:${key}`, JSON.stringify(value)),
            delete: key => localStorage.removeItem(`sillymemory:resume:${key}`),
        };
        const args = { host, client, collections, owner, file: selected || file, avatar, intents, valid, progress: status, story: ctx.chatMetadata.sillymemory?.story };
        if (selected || ctx.chatMetadata.sillymemory?.checkpoint) await checkpointRows(args);
        if (command === 'rename' || command === 'delete') {
            if (selected === file) throw new ConnectionError('Open another story path before renaming or deleting this checkpoint.');
            if (command === 'rename') {
                const name = prompt('Checkpoint name (up to 120 characters):');
                if (name === null) return;
                await renameCheckpoint(args, name);
                status('Checkpoint name saved.');
            } else {
                if (!confirm('Delete this checkpoint transcript and its remote memory branch? This cannot be undone. Other saved chats and branches remain. A resumed chat that has not synchronized yet will rebuild its memory.')) return;
                const entry = await deleteCheckpoint(args);
                engines.delete(entryKey(entry)); engine = undefined;
                new Journal(localStorage, `${owner}:${entry.collection}:${entry.branch}`).clear();
                status('Checkpoint transcript and memory branch deleted. Other story paths remain.');
            }
            await refreshCheckpoints(); return;
        }
        if (resume) {
            const name = await resumeCheckpoint(args);
            status(`Checkpoint resumed as ${name}. Enable memory to continue.`);
        } else if (selected || ctx.chatMetadata.sillymemory?.checkpoint) {
            await finishCheckpoint(args);
            if (!selected && valid()) await host.open(file);
            status('Checkpoint verified and ready. Resume it in a new chat.');
        } else {
            if (!await ensureChatIdentity(ctx, saveChat, valid)) return;
            const rows = [{ chat_metadata: structuredClone(ctx.chatMetadata) }, ...structuredClone(ctx.chat)];
            const name = await createCheckpoint({ ...args, rows, config: options(state), name: element('checkpoint-name').value });
            status(`Checkpoint saved: ${name}. Use the checkpoint list to resume. Memory remains disabled.`);
        }
        await refreshCheckpoints();
    }
    element('checkpoint-save').onclick = () => action(() => checkpointAction(false));
    element('checkpoint-resume').onclick = () => action(() => checkpointAction(true));
    element('enabled').onchange = () => action(async () => {
        invalidate();
        const requested = element('enabled').checked;
        state.enabled = false; persist();
        if (requested) {
            status('Checking memory collection ownership…');
            try {
                if (!client || !state.ready) throw new ConnectionError('Connect and prepare chat memory first.');
            } catch (error) { element('enabled').checked = false; throw error; }
            state.enabled = true; element('enabled').checked = true; persist(); schedule();
            status('Memory enabled. Current character chat will synchronize.');
        } else {
            status('Memory disabled. Remote data is retained until deleted.');
            element('delivery').textContent = 'Memory disabled. No pending prompt verification.';
            element('inspection').textContent = 'No memory prepared.';
        }
    });
    for (const name of ['recent', 'budget']) element(name).onchange = () => {
        state[name] = options({ ...state, [name]: element(name).value })[name]; element(name).value = state[name]; persist(); schedule();
    };
    element('sync').onclick = sync;
    async function deleteMemory(all) {
        if (!client || !collections) throw new ConnectionError('Reconnect before deleting remote memory.');
        if (!all && (!capture(context()) || !context().chatMetadata.sillymemory?.id)) throw new ConnectionError('This chat has no saved memory identity.');
        if (!confirm(all ? 'Delete ALL owned SillyMemory collections, including every story and branch? Local chats remain.' : 'Delete this chat’s remote memory? Other chats and branches remain. Your local chat is preserved.')) return;
        const target = context(), file = target.getCurrentChatId(), avatar = target.characters[target.characterId]?.avatar;
        const sameChat = () => context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
        state.enabled = false; element('enabled').checked = false; persist(); invalidate(); clearTimeout(timer);
        for (const e of engines.values()) e.invalidate();
        status('Deleting owned memory: waiting for earlier writes to finish…');
        await drain();
        let selected;
        if (!all) {
            const { saveChat } = await import('/script.js');
            if (!sameChat() || !await ensureChatIdentity(target, saveChat, sameChat)) throw new ConnectionError('Chat changed before deletion. Select it and retry.');
            selected = await chatCollection(capture(target), owner);
        }
        const entries = all ? [...(state.chatCollections || []), ...await collections.discover()] : [selected];
        for (const entry of new Map(entries.map(e => [e.collection, e])).values()) {
            await collections.delete(all ? { ...entry, branch: undefined } : entry);
            new Journal(localStorage, `${owner}:${entry.collection}${!all && entry.branch ? `:${entry.branch}` : ''}`).clear();
            for (const [key, instance] of engines) if (instance.collection === entry.collection && (all || instance.branch === entry.branch)) engines.delete(key);
        }
        engine = undefined;
        if (all) { state.ready = false; persist(); }
        element('delivery').textContent = 'Owned memory deleted. No pending prompt verification.';
        element('inspection').textContent = 'No memory prepared.';
        status('Owned remote memory is no longer accessible for the selected scope. Local chats remain. Prepare/enable memory to rebuild.');
    }
    element('delete').onclick = () => action(() => deleteMemory(true));
    element('delete-chat').onclick = () => action(() => deleteMemory(false));
    const events = ctx.eventTypes;
    ctx.eventSource.on(events.GENERATE_AFTER_DATA, (data, dryRun) => {
        const finished = delivery.finish(context().mainApi === 'openai' ? data?.prompt : null, dryRun);
        if (!finished) return;
        if (finished.canceled) {
            ctx.stopGeneration();
            element('delivery').textContent = 'Generation stopped because the chat or memory settings changed during prompt preparation. Generate again.';
            element('inspection').textContent = 'No current memory verified.';
            return;
        }
        const stop = state.stopOnLoss !== false;
        // The host catches listener exceptions; use its cancellation API instead.
        if (finished.lost && stop) ctx.stopGeneration();
        element('delivery').textContent = deliverySummary(finished.result, stop);
        if (finished.result) {
            const included = finished.result.memory.filter(m => m.outcome === 'included');
            const omitted = finished.result.memory.filter(m => m.outcome !== 'included');
            element('inspection').textContent = `Memory in final host prompt (${included.length}/${finished.result.memory.length}):\n\n${included.map(m => m.content).join('\n\n') || 'None.'}${omitted.length ? `\n\nNot verified in final prompt:\n\n${omitted.map(m => m.content).join('\n\n')}` : ''}`;
        }
    });
    for (const name of ['CHAT_CHANGED', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_ENDED', 'CHAT_RENAMED']) {
        if (events[name]) ctx.eventSource.on(events[name], () => {
            checkpointRevision++;
            if (name === 'CHAT_CHANGED' || name === 'CHAT_RENAMED') {
                identityKey = undefined;
                listSequence++; element('checkpoint-list').textContent = 'Refresh to view checkpoints for this story.';
                element('inspection').textContent = 'No memory injected in this chat.';
                element('delivery').textContent = 'No prompt checked in this chat.';
            }
            schedule();
        });
    }
    addEventListener('pagehide', () => { client?.forget(); element('key').value = ''; });
}
context().eventSource.on(context().eventTypes.APP_READY, () => { setTimeout(() => initialize().catch(() => { globalThis.toastr?.error('SillyMemory could not initialize. Check browser storage access and the supported SillyTavern version.'); }), 0); });
