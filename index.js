import { LambdaClient, ConnectionError, connectionConfig } from './src/client.js';
import { runTransportGate } from './src/gate.js';
import { MemoryEngine, Journal, capture, fingerprint, options } from './src/memory.js';
import { OperationStatus, failureText } from './src/status.js';

const context = () => SillyTavern.getContext();
const uuid = () => crypto.randomUUID().replaceAll('-', '');
let client, engine, root, state, stateKey, owner, timer, busy = false, gatePassed = false;
let sessionReady = false;
let promptSequence = 0;
let retrievalSequence = 0, retrievalOperation;
let statusView;
const element = name => root.querySelector(`[data-sm="${name}"]`);
const status = text => statusView.show(text);
function clearInjection() {
    context().setExtensionPrompt('sillymemory', '', 1, 0, false, 0);
}
function invalidate() { promptSequence++; engine?.invalidate(); clearInjection(); }
function persist() { localStorage.setItem(stateKey, JSON.stringify(state)); }
function makeEngine() {
    engine = state.collection && client ? new MemoryEngine({ client, owner, collection: state.collection,
        journal: new Journal(localStorage, `${owner}:${state.collection}`) }) : undefined;
}
function validSnapshot(snapshot, instance) {
    return sessionReady && state.enabled && engine === instance && fingerprint(capture(context())) === fingerprint(snapshot);
}
async function sync() {
    if (!sessionReady || !state.enabled || !engine || busy) return;
    const snapshot = capture(context()); if (!snapshot) return;
    const instance = engine; const sequence = promptSequence;
    const valid = () => sequence === promptSequence && validSnapshot(snapshot, instance);
    const operation = statusView.start(valid);
    try {
        const result = await instance.sync(snapshot, options(state), valid, operation.update);
        if (result) operation.finish(`Current chat synchronized: ${result.docs.length} older chunks. Memory will be retrieved on generation.`);
    } catch (e) { if (operation.current()) fail(e, operation); }
}
function schedule() {
    if (!sessionReady) return; // Preserve the lock-conflict explanation.
    invalidate(); clearTimeout(timer);
    if (!client) { status('Enter your project API key. Keys are cleared on reload.'); return; }
    if (!state.enabled) { status('Memory disabled. Remote data is retained until deleted.'); return; }
    if (!engine || !capture(context())) { status('Select a supported character chat and connect to a memory collection.'); return; }
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
    // Quiet prompts cancel older reads/injection while preserving source sync.
    if (type === 'quiet') {
        retrievalOperation?.finish('Memory retrieval skipped for quiet generation.');
        retrievalSequence++; engine?.cancelReads(); clearInjection(); return;
    }
    invalidate();
    const sequence = promptSequence;
    const retrieval = ++retrievalSequence;
    if (!sessionReady || busy || !state?.enabled || !engine) return;
    if (context().extensionSettings.vectors?.enabled_chats) {
        status('Disable built-in Vector Storage chat vectorization before using SillyMemory.'); return;
    }
    const snapshot = capture(context()); if (!snapshot) { status('Select a supported character chat to use memory.'); return; }
    clearTimeout(timer); // Retrieval below replaces the pending synchronization.
    const instance = engine; const config = options(state);
    const promptBefore = JSON.stringify(chat);
    const sourceValid = () => sequence === promptSequence && validSnapshot(snapshot, instance);
    const unchangedPrompt = () => sourceValid() && JSON.stringify(chat) === promptBefore;
    const valid = () => retrieval === retrievalSequence && unchangedPrompt();
    const operation = statusView.start(() => retrieval === retrievalSequence && sourceValid());
    retrievalOperation = operation;
    try {
        // The extension budget includes its complete wrapper; SillyTavern still manages
        // total prompt overhead, character instructions, and final model context limits.
        config.budget = Math.min(config.budget, Math.max(0, Math.floor(contextSize / 4)));
        const result = await instance.retrieve(snapshot, config, text => context().getTokenCountAsync(text), unchangedPrompt, operation.update, type);
        if (!valid()) { operation.finish('Memory operation canceled because the prompt changed. Generate again.'); abort(true); return; }
        if (!result?.text) { operation.finish('No current matching memory fits the budget. Original prompt retained.'); return; }
        // Protect the most recent prompt messages, including during swipe/regenerate.
        const cutoff = chat.length - config.recent;
        const indexedMessages = new Set(result.passages.map(p => p.message));
        // All plain older messages were candidates; retain special/file/tool messages.
        const eligible = new Set(snapshot.messages.slice(0, -config.recent).filter(m => m.eligible && m.text.trim()).map(m => m.index));
        // Require the pinned coreChat index contract before pruning anything.
        if (!chat.every(m => Number.isInteger(m.index))) { operation.finish('Unexpected prompt shape. Original prompt retained.'); return; }
        if (![...indexedMessages].every(i => eligible.has(i))) { operation.finish('Memory no longer matches eligible source. Original prompt retained.'); return; }
        for (let i = cutoff - 1; i >= 0; i--) {
            if (eligible.has(chat[i].index)) chat.splice(i, 1);
        }
        context().setExtensionPrompt('sillymemory', result.text, 1, config.recent, false, 0);
        element('inspection').textContent = `${result.tokens} / ${config.budget} tokens\n\n${result.text}`;
        operation.finish(`Injected ${result.passages.length} passages (${result.tokens} tokens); kept the recent ${config.recent} messages.`);
    } catch (e) {
        if (!valid()) { operation.finish('Memory operation canceled because the prompt changed. Generate again.'); abort(true); return; }
        if (operation.current()) fail(e, operation);
    } finally {
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
    state = { endpoint: '', project: '', enabled: false, recent: 12, budget: 800, ...JSON.parse(localStorage.getItem(stateKey) || '{}') };
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
        if ((state.collection || state.testCollection) && (candidate.endpoint !== state.endpoint || candidate.project !== state.project)) throw new ConnectionError('Clean up owned collections before changing the connection.');
        invalidate(); status('Connecting: waiting for earlier writes to finish…');
        await engine?.queue.catch(() => {}); client?.forget();
        client = new LambdaClient(candidate, element('key').value, { headers: () => context().getRequestHeaders() });
        element('key').value = ''; gatePassed = false;
        Object.assign(state, candidate); persist(); makeEngine();
        status('Key is in browser memory. Run the synthetic transport test before creating a memory collection.');
    });
    element('forget').onclick = () => action(async () => {
        state.enabled = false; element('enabled').checked = false; persist(); invalidate();
        status('Forgetting key: waiting for earlier writes to finish…');
        await engine?.queue.catch(() => {}); client?.forget(); client = undefined; engine = undefined;
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
        if (state.collection) {
            try { await client.assertOwned(state.collection, owner); makeEngine(); status('Owned memory collection is ready.'); return; }
            catch (e) { if (e.status !== 404) throw e; }
        }
        state.collection ||= `sillymemory_${uuid()}`; persist();
        await client.create(state.collection, owner); makeEngine(); status('Memory collection created. Enable memory to start synchronizing this chat.');
    });
    element('enabled').onchange = () => action(async () => {
        invalidate();
        const requested = element('enabled').checked;
        state.enabled = false; persist();
        if (requested) {
            status('Checking memory collection ownership…');
            try {
                if (!client || !engine) throw new ConnectionError('Connect and create a memory collection first.');
                await client.assertOwned(state.collection, owner);
            } catch (error) { element('enabled').checked = false; throw error; }
            state.enabled = true; element('enabled').checked = true; persist(); schedule();
            status('Memory enabled. Current character chat will synchronize.');
        } else status('Memory disabled. Remote data is retained until deleted.');
    });
    for (const name of ['recent', 'budget']) element(name).onchange = () => {
        state[name] = options({ ...state, [name]: element(name).value })[name]; element(name).value = state[name]; persist(); schedule();
    };
    element('sync').onclick = sync;
    element('delete').onclick = () => action(async () => {
        if (!client || !engine) throw new ConnectionError('Reconnect to the owned memory collection before deleting it.');
        if (!confirm('Delete ALL SillyMemory data in this installation’s owned memory collection? This includes every indexed chat and branch. Your SillyTavern chats will remain.')) return;
        state.enabled = false; element('enabled').checked = false; persist(); invalidate();
        status('Deleting owned memory: waiting for earlier writes to finish…');
        await engine.deleteAll(); engine = undefined; delete state.collection; persist();
        status('Owned remote memory collection is no longer accessible. Provider backup/retention policies still apply.');
    });
    const events = ctx.eventTypes;
    for (const name of ['CHAT_CHANGED', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_ENDED', 'CHAT_RENAMED']) {
        if (events[name]) ctx.eventSource.on(events[name], () => {
            if (name === 'CHAT_CHANGED') element('inspection').textContent = 'No memory injected in this chat.';
            schedule();
        });
    }
    addEventListener('pagehide', () => { client?.forget(); element('key').value = ''; });
}
context().eventSource.on(context().eventTypes.APP_READY, () => { setTimeout(() => initialize().catch(() => { globalThis.toastr?.error('SillyMemory could not initialize. Check browser storage access and the supported SillyTavern version.'); }), 0); });
