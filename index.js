import { LambdaClient, ConnectionError, connectionConfig, ANALYZERS } from './src/client.js';
import { SavedKey } from './src/credentials.js';
import { callbackUrl, connectWithLambdaDB } from './src/app-connect.js';
import { activationBinding, chatActivated } from './src/activation.js';
import { ChatCollections, chatCollection, ensureChatIdentity } from './src/chat-collections.js';
import { runTransportGate } from './src/gate.js';
import { MemoryEngine, Journal, capture, supportsChat, fingerprint, options, DEFAULTS, memoryBoundary, archiveBoundary } from './src/memory.js';
import { OperationStatus, failureText, analyzerNotice } from './src/status.js';
import { PromptDelivery, expectedMessages, deliverySummary } from './src/delivery.js';
import { MEMORY_GUIDANCE, retentionAnchor, quoteMemoryText, quoteMemoryMessages } from './src/context.js';
import { hostPromptTokens, dialogueSnapshot, compareDialogue, comparisonLabel, tokenLabel } from './src/token-usage.js';

const context = () => SillyTavern.getContext();
const memoryEnabled = () => connectionVerified && state?.ready && chatActivated(context().chatMetadata, state);
const uuid = () => crypto.randomUUID().replaceAll('-', '');
let client, engine, root, state, stateKey, owner, timer, busy = false, pendingAction = Promise.resolve(), gatePassed = false;
let sessionReady = false;
let connectionVerified = false, shownConnection, retrySync = false;
let savedKey, connectingClient;
let promptSequence = 0;
let retrievalSequence = 0, retrievalOperation;
let statusView, collections, identityKey;
let preparation = Promise.resolve();
let chatStatus, stoppedRequest, deliveryNotice, sessionUnavailable, storyAnalyzers;
let deliveryText = '', inspectionText = 'No memory added yet.';
let retrying = false, sourceRevision = 0;
let hostGenerating = () => false;
let promptType, promptSource;
let hostOpenAI, hostTokenizers, tokenUsage;
const engines = new Map();
const entryKey = entry => `${entry.collection}:${entry.branch}`;
const delivery = new PromptDelivery();
const element = name => root.querySelector(`[data-sm="${name}"]`);
const status = (text, options) => { retrySync = false; statusView.show(text, options); };
const chatElement = name => chatStatus.querySelector(`[data-sm-chat="${name}"]`);
function canBrowseChats() {
    const ctx = context();
    return Boolean(ctx.groupId || ctx.characters[ctx.characterId]?.avatar);
}
function chatBlocker() {
    const ctx = context();
    if (!supportsChat(ctx)) return { label: 'Unavailable in this chat', message: 'Select a saved, single-character text chat to use SillyMemory. Group chats and tool conversations are not supported.' };
    if (ctx.extensionSettings.vectors?.enabled_chats) return { action: 'vectors', label: 'Vector Storage conflict', message: 'SillyMemory is paused while Vector Storage chat vectorization is on. Turn that off to use SillyMemory.' };
    return null;
}
function requestTarget() {
    const ctx = context();
    return JSON.stringify([ctx.characters[ctx.characterId]?.avatar, ctx.getCurrentChatId()]);
}
function currentStoppedRequest() {
    return stoppedRequest && stoppedRequest.revision === sourceRevision && stoppedRequest.target === requestTarget() ? stoppedRequest : null;
}
function rememberStoppedRequest(message, type) {
    stoppedRequest = { message, type, revision: sourceRevision, target: requestTarget(), source: promptSource };
    renderChatStatus();
}
function showDelivery(text, notice) {
    deliveryText = text;
    deliveryNotice = notice;
    renderChatStatus();
}
function setInspection(text) {
    inspectionText = text;
    if (chatStatus) chatElement('inspection').textContent = text;
}
// The Last prompt section exists only while it has something to show.
function renderLastPrompt() {
    if (!chatStatus) return;
    chatElement('last-prompt').hidden = chatElement('tokens').hidden && chatElement('memory').hidden;
}
function showMemoryPreview(passages) {
    if (!chatStatus) return;
    const preview = chatElement('memory'), list = chatElement('memory-list');
    list.replaceChildren();
    preview.hidden = !passages;
    chatElement('inspection').hidden = true; chatElement('inspect').setAttribute('aria-expanded', 'false');
    renderLastPrompt();
    if (!passages) return;
    chatElement('memory-summary').textContent = passages.length
        ? `${passages.length} source passage${passages.length === 1 ? '' : 's'} selected.`
        : 'No older memory selected for this prompt.';
    // Preview limits affect only this display, never retrieval or prompt contents.
    const ordered = [...passages].sort((a, b) => a.message - b.message || a.chunk - b.chunk);
    for (const passage of ordered.slice(0, 3)) {
        const item = document.createElement('li'), source = document.createElement('small'), text = document.createElement('p');
        source.textContent = `${passage.role === 'user' ? 'User' : 'Assistant'} · ${passage.speaker} · message ${passage.message + 1}, passage ${passage.chunk + 1}`;
        const characters = Array.from(passage.text.trim().replace(/\s+/gu, ' '));
        text.textContent = characters.slice(0, 180).join('') + (characters.length > 180 ? '…' : '');
        item.append(source, text); list.append(item);
    }
    const remaining = passages.length - 3;
    chatElement('inspect').textContent = remaining > 0 ? `View full memory (${remaining} more ${remaining === 1 ? 'passage' : 'passages'})` : 'View full memory';
    chatElement('inspect').hidden = !passages.length;
}
const tokenizerKey = () => `${context().mainApi}:${hostTokenizers?.getTokenizerModel()}`;
function clearTokenUsage() { tokenUsage = undefined; renderTokenUsage(); }
function renderTokenUsage() {
    if (!chatStatus) return;
    const usage = tokenUsage;
    chatElement('tokens').hidden = !usage?.finished;
    renderLastPrompt();
    if (!usage?.finished) return;
    chatElement('token-input').textContent = `${tokenLabel(usage.input)}${usage.input === undefined ? '' : ' tokens'}`;
    chatElement('token-memory').textContent = `${tokenLabel(usage.memory)}${usage.memory === undefined ? '' : ' tokens'}${usage.enabled ? '' : ' · memory off'}`;
    chatElement('token-compare').hidden = !usage.enabled || !usage.after || Boolean(usage.comparison) || !usage.model.startsWith('openai:');
    chatElement('token-compare').disabled = Boolean(usage.comparing) || busy || hostGenerating() || usage.model !== tokenizerKey();
    chatElement('token-compare').textContent = usage.comparing ? 'Counting dialogue text…' : 'Compare dialogue text';
    chatElement('token-reference').textContent = usage.comparison ? `Dialogue reference: ${comparisonLabel(usage.comparison)}` : usage.error || '';
    chatElement('token-reference').hidden = !usage.comparison && !usage.error;
    chatElement('token-reference-help').hidden = !usage.comparison && !usage.comparing;
}
async function compareTokenUsage() {
    const usage = tokenUsage;
    if (!usage?.finished || !usage.enabled || !usage.after || usage.comparing || usage.comparison || busy || hostGenerating() || !usage.model.startsWith('openai:') || usage.model !== tokenizerKey()) return;
    usage.comparing = true; usage.error = undefined; renderTokenUsage();
    const current = () => tokenUsage === usage && usage.target === requestTarget() && usage.model === tokenizerKey();
    try {
        const comparison = await compareDialogue(usage.before, usage.after, usage.guidance, context().getTokenCountAsync);
        if (current()) usage.comparison = comparison;
    } catch {
        if (current()) usage.error = 'Dialogue reference unavailable. You can retry; generation is unaffected.';
    } finally {
        if (tokenUsage === usage) { usage.comparing = false; renderTokenUsage(); }
    }
}
function beginTokenUsage(chat) {
    if (!chatStatus || !sessionReady || !connectionVerified || !client || !state.ready || !supportsChat(context())) return;
    const before = dialogueSnapshot(chat);
    tokenUsage = { before, after: memoryEnabled() ? undefined : before, memory: memoryEnabled() ? undefined : 0,
        enabled: memoryEnabled(), model: tokenizerKey(), target: requestTarget() };
    return tokenUsage;
}
function canReconnect() {
    try { return Boolean(sessionReady && !connectionVerified && savedKey?.read(state)); }
    catch { return false; }
}
function renderChatStatus() {
    if (!chatStatus || !state) return;
    const connected = Boolean(sessionReady && connectionVerified && client);
    if (!connected || !memoryEnabled()) showMemoryPreview();
    if (!connected || (tokenUsage && tokenUsage.enabled !== memoryEnabled())) clearTokenUsage();
    renderTokenUsage();
    const blocker = memoryEnabled() || !supportsChat(context()) ? chatBlocker() : null;
    const stopped = currentStoppedRequest();
    let label = 'Off', kind = 'idle';
    if (sessionUnavailable) { label = 'Unavailable'; kind = 'warning'; }
    else if (!connected) { label = busy ? 'Connecting' : 'Connect'; kind = statusView?.error ? 'error' : 'idle'; }
    else if (state.testCollection) { label = 'Test cleanup needed'; kind = 'warning'; }
    else if (!state.ready) label = 'Setup needed';
    else if (blocker) { label = blocker.label; kind = 'warning'; }
    else if (memoryEnabled()) {
        if (stopped) { label = 'Reply stopped'; kind = 'error'; }
        else if (statusView.error) { label = 'Needs attention'; kind = 'error'; }
        else if (statusView.progress) { label = statusView.progress.phase === 'searching' || statusView.progress.phase === 'budgeting' ? 'Adding memory' : 'Updating'; kind = 'working'; }
        // An action such as turning memory on is still saving; synchronization follows it.
        else if (busy) { label = 'Updating'; kind = 'working'; }
        else { label = deliveryNotice?.label || 'Ready'; kind = deliveryNotice?.kind || 'ready'; }
    }
    chatStatus.dataset.kind = kind;
    chatElement('label').textContent = `Memory · ${label}`;
    chatElement('status').textContent = sessionUnavailable || blocker?.message || stopped?.message || element('status').textContent;
    chatElement('delivery').textContent = deliveryText;
    chatElement('delivery').hidden = !deliveryText || deliveryText === chatElement('status').textContent;
    const progress = chatElement('progress'), value = !blocker && !stopped && statusView.progress;
    progress.hidden = !value;
    if (value?.total > 0) { progress.max = value.total; progress.value = value.completed; }
    else progress.removeAttribute('value');
    const canAct = connected && sessionReady && !busy && !hostGenerating();
    chatElement('vectors').hidden = blocker?.action !== 'vectors';
    chatElement('history').disabled = busy || !sessionReady || hostGenerating() || !canBrowseChats();
    chatElement('reconnect').hidden = !canReconnect();
    chatElement('reconnect').disabled = !sessionReady || busy || retrying || hostGenerating();
    chatElement('cleanup').hidden = !connected || !state.testCollection;
    chatElement('sync').hidden = !retrySync || !memoryEnabled() || Boolean(blocker) || !state.ready || Boolean(state.testCollection);
    chatElement('retry').hidden = !stopped?.source || !['normal', 'regenerate'].includes(stopped.type) || !context().chat.at(-1)?.is_user || !memoryEnabled() || !state.ready || Boolean(blocker) || Boolean(state.testCollection);
    // The open story keeps its created analyzers; a changed setting is information, not a failure.
    const notice = memoryEnabled() && !blocker && state.ready && !state.testCollection && storyAnalyzers?.target === requestTarget() ? analyzerNotice(storyAnalyzers.analyzers, options(state).analyzers) : '';
    chatElement('analyzers').textContent = notice;
    chatElement('analyzers').hidden = !notice;
    chatElement('rebuild').hidden = !notice;
    chatElement('toggle').hidden = !connected || !state.ready || Boolean(state.testCollection) || !supportsChat(context());
    chatElement('toggle').textContent = memoryEnabled() ? 'Turn memory off in this chat' : 'Turn memory on in this chat';
    chatElement('toggle').setAttribute('aria-pressed', String(connected && memoryEnabled()));
    const recovery = chatElement('recovery');
    recovery.hidden = [...recovery.children].every(button => button.hidden);
    // This chat's memory: actions on the open chat's own memory, apart from recovery.
    const manageable = connected && state.ready && !state.testCollection && supportsChat(context());
    chatElement('delete').hidden = !context().chatMetadata?.sillymemory?.id;
    chatElement('manage').hidden = !manageable || chatElement('delete').hidden;
    for (const name of ['cleanup', 'sync', 'retry', 'toggle', 'delete', 'rebuild']) chatElement(name).disabled = !canAct || retrying;
}
function toggleMemory() {
    if (!sessionReady || !connectionVerified || !client || busy || retrying || hostGenerating()) return;
    if (!memoryEnabled() && (!state.ready || state.testCollection)) return;
    if (!supportsChat(context())) return;
    return action(() => setChatMemory(!memoryEnabled()));
}
async function setChatMemory(enabled) {
    const ctx = context(), metadata = ctx.chatMetadata, target = requestTarget();
    const current = () => context().chatMetadata === metadata && requestTarget() === target;
    if (!sessionReady || !connectionVerified || !client || !state.ready || state.testCollection || !supportsChat(ctx) || hostGenerating()) return;
    clearTokenUsage(); invalidate(); clearTimeout(timer);
    const previous = metadata.sillymemoryEnabled;
    const previousActivation = metadata.sillymemoryActivation;
    metadata.sillymemoryEnabled = enabled;
    if (enabled) metadata.sillymemoryActivation = activationBinding(state);
    else delete metadata.sillymemoryActivation;
    status(enabled ? 'Turning memory on for this chat…' : 'Turning memory off for this chat…');
    if (!enabled) {
        showDelivery('');
        setInspection('No memory added yet.');
    }
    renderSettings();
    const { saveChatConditional } = await import('/script.js');
    if (!current()) return;
    let saving;
    try {
        await drain();
        if (!current()) return;
        // The native conditional save owns the host's save lock. Keep its
        // current-chat target stable while it waits for earlier native writes.
        saving = ctx.loader.show({ blocking: true, toastMode: 'static', message: 'Saving memory on/off for this chat…' });
        if (!current()) return;
        await saveChatConditional();
        if (!current()) return;
        // The native save reports failures through toasts, so confirm the saved
        // flag before enabling uploads. Read only the captured chat target.
        const response = await fetch('/api/chats/get', { method: 'POST', headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ avatar_url: ctx.characters[ctx.characterId]?.avatar, file_name: ctx.getCurrentChatId() }) });
        const rows = response.ok ? await response.json() : null;
        if (!current()) return;
        if (rows?.[0]?.chat_metadata?.sillymemoryEnabled !== enabled) throw new ConnectionError('Memory on/off could not be saved for this chat. Check the SillyTavern connection and retry.');
        if (enabled && !chatActivated(rows?.[0]?.chat_metadata, state)) throw new ConnectionError('Memory could not be turned on for this chat. Try again.');
    } catch (error) {
        if (enabled) {
            metadata.sillymemoryEnabled = previous;
            if (previousActivation === undefined) delete metadata.sillymemoryActivation;
            else metadata.sillymemoryActivation = previousActivation;
        }
        if (!current()) return;
        invalidate();
        throw error;
    } finally { if (saving) await saving.hide(); }
    if (!current()) return;
    if (enabled) {
        showDelivery('');
        schedule();
    } else {
        status('Memory is off for this chat. SillyTavern uses its usual chat history, and saved memory is kept.');
        showDelivery('');
        setInspection('No memory added yet.');
    }
}
async function openChatHistory() {
    const { doNavbarIconClick } = await import('/script.js');
    const drawer = document.querySelector('#extensions-settings-button');
    if (drawer.querySelector('.drawer-content').classList.contains('openDrawer')) await doNavbarIconClick.call(drawer.querySelector('.drawer-toggle'));
    document.getElementById('option_select_chat').click();
}
async function openMemorySettings(vectors = false) {
    const [{ doNavbarIconClick }, { toggleDrawer }] = await Promise.all([import('/script.js'), import('/scripts/utils.js')]);
    const drawer = document.querySelector('#extensions-settings-button');
    if (!drawer.querySelector('.drawer-content').classList.contains('openDrawer')) await doNavbarIconClick.call(drawer.querySelector('.drawer-toggle'));
    const target = vectors ? document.querySelector('#vectors_container .inline-drawer') : root;
    if (!target) return;
    toggleDrawer(target, true);
    if (!vectors && !connectionVerified) element('connection').open = true;
    target.scrollIntoView({ block: 'nearest' });
    target.tabIndex = -1; target.focus({ preventScroll: true });
}
function toggleMemoryInspection() {
    const inspection = chatElement('inspection'), show = inspection.hidden;
    inspection.textContent = inspectionText;
    inspection.hidden = !show;
    chatElement('inspect').setAttribute('aria-expanded', String(show));
    if (show) { inspection.scrollIntoView({ block: 'nearest' }); inspection.focus({ preventScroll: true }); }
}
async function retryReply() {
    const request = currentStoppedRequest();
    if (!request || retrying) return;
    retrying = true; renderChatStatus();
    try {
        const { isGenerating } = await import('/script.js');
        const snapshot = capture(context());
        // Retry only an unchanged pending user turn through the host's own
        // Regenerate action. Continue/swipe keep their native recovery controls.
        if (isGenerating() || busy || !sessionReady || !connectionVerified || !memoryEnabled() || !state.ready || state.testCollection || chatBlocker()
            || currentStoppedRequest() !== request || request.source !== JSON.stringify([context().getCurrentChatId(), snapshot?.character, snapshot?.messages])
            || !['normal', 'regenerate'].includes(request.type) || !context().chat.at(-1)?.is_user) return;
        document.getElementById('option_regenerate')?.click();
    } catch {
        status('Could not retry this reply. Check the chat, then use SillyTavern’s Regenerate action.', { error: true });
    } finally { retrying = false; renderChatStatus(); }
}
function endpointHost(endpoint) {
    try { return new URL(endpoint).host; } catch { return endpoint; }
}
function renderSettings() {
    if (!root || !state) return;
    const connected = Boolean(sessionReady && connectionVerified && client);
    const connection = element('connection');
    if (shownConnection !== connected) {
        if (connected && connection.contains(document.activeElement)) connection.querySelector('summary').focus();
        connection.open = !connected;
        shownConnection = connected;
    }
    element('connection-state').textContent = connected ? 'Connected' : 'Not connected';
    // Connecting controls apply only while not connected; a connected project offers Disconnect instead.
    element('connect-form').hidden = connected;
    element('connected').hidden = !connected;
    if (connected) {
        element('connected-summary').textContent = `Connected to ${state.project} (${endpointHost(state.endpoint)})`;
        element('disconnect-help').hidden = !(state.testCollection || state.chatCollections.length);
    }
    const cleanup = Boolean(connected && state.testCollection);
    element('connect').textContent = state.ready || state.testCollection ? 'Save and connect' : 'Connect and test';
    element('prepare-controls').hidden = !connected || state.ready || cleanup;
    element('usage-help').hidden = !connected || !state.ready;
    element('next-step').textContent = !connected ? 'Connect your project above to get started.'
        : cleanup ? 'A connection test needs cleanup. Remove its temporary data before trying again.'
        : !state.ready ? 'Check your connection once before turning memory on.'
        : 'Connection ready. Turn memory on separately in each chat’s Memory panel.';
    element('mode-help').textContent = 'On/off is saved with each chat. When off, SillyTavern uses its usual chat history and saved memory is kept.';
    element('recover-cleanup').hidden = !cleanup;
    element('recovery-actions').hidden = !cleanup;
    root.querySelectorAll('button, input').forEach(x => { x.disabled = busy || !sessionReady; });
    if (element('app-cancel')) element('app-cancel').disabled = false;
    renderChatStatus();
}
function clearInjection() {
    context().setExtensionPrompt('sillymemory', '', 1, 0, false, 0);
}
function invalidate() { promptSequence++; engine?.invalidate(); clearInjection(); delivery.clear(); }
function persist(next = state) { localStorage.setItem(stateKey, JSON.stringify(next)); }
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
        const snapshot = capture(context());
        const entry = await collections.ensure(snapshot, valid, options(state), progress);
        if (!entry || !valid()) return null;
        storyAnalyzers = { target: requestTarget(), analyzers: entry.analyzers };
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
    return sessionReady && memoryEnabled() && engine === instance && fingerprint(capture(context())) === fingerprint(snapshot);
}
async function sync() {
    if (!sessionReady || !memoryEnabled() || !state.ready || !client || busy) return;
    retrySync = false; renderSettings();
    const sequence = promptSequence;
    const current = () => sequence === promptSequence && sessionReady && memoryEnabled();
    const operation = statusView.start(current);
    try {
        const prepared = await prepareMemory(current, operation.update); if (!prepared) return;
        const { snapshot, instance } = prepared;
        const valid = () => current() && validSnapshot(snapshot, instance);
        const result = await instance.sync(snapshot, { ...options(state), archiveBefore: archiveBoundary(snapshot), ownershipVerified: true }, valid, operation.update);
        if (result) operation.finish(`This chat's memory is synchronized: ${result.docs.length} saved passages. Recent messages stay in the chat as they are, and related memory is added when you send a message.`);
    } catch (e) { if (operation.current()) fail(e, operation); }
}
function schedule() {
    if (!sessionReady) return; // Preserve the lock-conflict explanation.
    invalidate(); clearTimeout(timer);
    if (!client) { status('Not connected. Use Connect to LambdaDB or enter your project API key in Connection settings.'); return; }
    if (!memoryEnabled()) { status('Memory is off. SillyTavern uses its usual chat history, and saved memory is kept.'); return; }
    if (!state.ready || !capture(context())) { status('Select a supported character chat and connect to a memory collection.'); return; }
    retrySync = false;
    const operation = statusView.start();
    operation.update({ phase: 'preparing' });
    const run = () => {
        if (!operation.current()) return;
        if (busy) { timer = setTimeout(run, 400); return; }
        sync();
    };
    timer = setTimeout(run, 400);
}
function fail(error, operation, generation = false, type) {
    showMemoryPreview();
    clearTokenUsage();
    retrySync = Boolean(operation && !generation);
    // Native generation-ended sync can replace operation progress immediately.
    // Keep the failed generation visible independently of background progress.
    if (root && generation) {
        const message = `Reply stopped: memory could not be added. ${failureText(error, { generation: true })}`;
        showDelivery(message, { label: 'Reply stopped', kind: 'error' });
        rememberStoppedRequest(message, type);
    }
    if (error.status === 401 && client) {
        connectionVerified = false;
        client.forget(); invalidate();
        try { savedKey.forget(); persist(); }
        catch { status('Authentication failed and memory is off. Browser storage could not be updated; allow storage, then click Forget key again.'); return; }
        client = undefined; collections = undefined;
        status(failureText(error)); return;
    }
    clearInjection();
    if (root) setInspection('No memory added: the operation failed.');
    if (operation) operation.fail(error, generation ? 'Reply stopped. ' : '', generation); else status(failureText(error, { sync: false }), { error: true });
}
async function action(job) {
    if (busy) return;
    busy = true; renderSettings();
    let settle; pendingAction = new Promise(resolve => { settle = resolve; });
    let outcome = {};
    try { await job(); } catch (e) { outcome = { error: e }; fail(e); }
    finally { busy = false; settle(outcome); renderSettings(); }
}

// Called with SillyTavern's ephemeral coreChat array. Never mutate source messages.
globalThis.sillymemory_intercept = async (chat, contextSize, abort, type) => {
    if (delivery.awaitingPrompt) {
        // No final event will be emitted for this rejected interceptor. Keep the
        // previous slot until its own non-dry-run final event has been consumed.
        showDelivery('SillyMemory is still checking the previous prompt. Wait and generate again. If it does not finish, reload the page.', { label: 'Please wait', kind: 'warning' });
        abort(true); return;
    }
    // Quiet prompts cancel older reads/injection while preserving source sync.
    if (type === 'quiet') {
        if (!tokenUsage?.finished) clearTokenUsage();
        retrievalOperation?.finish('Memory retrieval skipped for quiet generation.');
        retrievalSequence++; engine?.cancelReads(); clearInjection(); delivery.clear(); return;
    }
    showMemoryPreview();
    clearTokenUsage();
    if (busy) {
        // A memory action, such as turning memory on, may still be saving. Wait
        // for it and prepare this reply afterwards instead of stopping the reply.
        const target = requestTarget(), wanted = memoryEnabled();
        const { error } = await pendingAction;
        if (requestTarget() !== target) {
            promptSource = undefined;
            fail(new ConnectionError('The chat changed while memory was being prepared. Generate again.'), undefined, true, type);
            abort(true); return;
        }
        // A failed action that left memory off, such as an activation whose save
        // was rolled back, is a preparation failure, not a request for native history.
        if (error && wanted && !memoryEnabled()) {
            promptSource = undefined;
            fail(error, undefined, true, type);
            abort(true); return;
        }
    }
    invalidate();
    const requestTokens = beginTokenUsage(chat);
    const sequence = promptSequence;
    const retrieval = ++retrievalSequence;
    if (!sessionReady || !memoryEnabled() || !state.ready || !client) return;
    if (context().extensionSettings.vectors?.enabled_chats) {
        status('Disable built-in Vector Storage chat vectorization before using SillyMemory.'); return;
    }
    let snapshot = capture(context()); if (!snapshot) { status('Select a supported character chat to use memory.'); return; }
    promptType = type;
    showDelivery('Adding memory to this reply…');
    clearTimeout(timer); // Retrieval below replaces the pending synchronization.
    let instance; const config = options(state);
    const before = memoryBoundary(snapshot, type);
    let protectedMessages = chat.every(message => Number.isInteger(message.index))
        ? chat.filter(message => message.index === before) : [];
    const promptBefore = JSON.stringify(chat);
    const sourceBefore = JSON.stringify([context().getCurrentChatId(), snapshot.character, snapshot.messages]);
    promptSource = sourceBefore;
    const sameSource = () => { const s = capture(context()); return s && JSON.stringify([context().getCurrentChatId(), s.character, s.messages]) === sourceBefore; };
    const sourceValid = () => sequence === promptSequence && validSnapshot(snapshot, instance);
    const unchangedPrompt = () => sourceValid() && JSON.stringify(chat) === promptBefore;
    const valid = () => retrieval === retrievalSequence && unchangedPrompt();
    const operation = statusView.start(() => retrieval === retrievalSequence && sequence === promptSequence);
    retrievalOperation = operation;
    let preparedMessages = [], guidance = [], abandoned = false;
    try {
        const prepared = await prepareMemory(() => sequence === promptSequence && sessionReady && memoryEnabled() && sameSource() && JSON.stringify(chat) === promptBefore);
        if (!prepared) { abandoned = true; abort(true); return; }
        ({ snapshot, instance } = prepared);
        config.ownershipVerified = true; // ensure() verified ownership in this preparation.
        const requestGuidance = MEMORY_GUIDANCE;
        // Retain recent native dialogue without classifying or rewriting replies.
        const retainedEnd = retentionAnchor(snapshot.messages, type);
        config.archiveBefore = archiveBoundary(snapshot, type);
        config.retainedStart = retainedEnd < 0 ? 0 : config.archiveBefore;
        protectedMessages = chat.filter(m => m.index >= config.retainedStart && m.index <= retainedEnd);
        // The extension budget includes its complete wrapper; SillyTavern still manages
        // total prompt overhead, character instructions, and final model context limits.
        config.budget = Math.min(config.budget, Math.max(0, Math.floor(contextSize / 4)));
        const countMemory = text => context().getTokenCountAsync([requestGuidance, quoteMemoryText(text)].filter(Boolean).join('\n'));
        const result = await instance.retrieve(snapshot, config, countMemory, unchangedPrompt, operation.update, type);
        if (!valid()) { operation.finish('Memory operation canceled because the prompt changed. Generate again.'); abandoned = true; abort(true); return; }
        const guidanceTokens = await countMemory('');
        if (!valid()) { abandoned = true; abort(true); return; }
        if (!Number.isFinite(guidanceTokens) || guidanceTokens < 0 || guidanceTokens > config.budget) throw new Error('Memory guidance does not fit the token budget.');
        context().setExtensionPrompt('sillymemory', requestGuidance, 1, 0, false, 0);
        guidance = [{ role: 'system', content: requestGuidance, verifiable: true }];
        if (!result) throw new Error('Memory retrieval did not complete.');
        const preparedTokens = result.text ? result.tokens : guidanceTokens;
        // Protect recent native dialogue; keep special messages intact.
        const indexedMessages = new Set(result.passages.map(p => p.message));
        // Drop full plain history, including answers following a replacement question.
        const start = config.retainedStart;
        const eligible = new Set(snapshot.messages.filter(m => (m.index < start || m.index > retainedEnd) && m.eligible && m.text.trim()).map(m => m.index));
        // Require the pinned coreChat index contract before pruning anything.
        if (!chat.every(m => Number.isInteger(m.index))) { operation.finish('Unexpected prompt shape. Original prompt retained.'); return; }
        if (![...indexedMessages].every(i => i < start && eligible.has(i))) { operation.finish('Memory no longer matches eligible source. Original prompt retained.'); return; }
        // Insert the quoted archive at the latest selected source's position.
        // Special messages and recent dialogue retain their native order/roles;
        // original speakers and coordinates remain inside the quoted excerpts.
        preparedMessages = quoteMemoryMessages(result.messages, context().name1);
        const recalled = new Map();
        for (const message of preparedMessages) {
            const group = recalled.get(message.index) || [];
            group.push(message); recalled.set(message.index, group);
        }
        for (let i = chat.length - 1; i >= 0; i--) {
            if (eligible.has(chat[i].index)) chat.splice(i, 1, ...(recalled.get(chat[i].index) || []));
        }
        setInspection(`${preparedTokens} / ${config.budget} tokens\n\n${quoteMemoryText(result.text)}`);
        if (requestTokens && tokenUsage === requestTokens) Object.assign(requestTokens, { after: dialogueSnapshot(chat), memory: preparedTokens, guidance: requestGuidance });
        showMemoryPreview(result.passages);
        operation.finish(`Found ${result.passages.length} related passages (${preparedTokens} tokens) for this reply.`);
    } catch (e) {
        if (!instance) { if (operation.current()) fail(e, operation, true, type); abandoned = true; abort(true); return; }
        if (!valid()) { operation.finish('Memory operation canceled because the prompt changed. Generate again.'); abandoned = true; abort(true); return; }
        guidance = [];
        if (operation.current()) fail(e, operation, true, type);
        // Keep memory-on preparation failures explicit; native fallback is
        // available by disabling memory, without silently changing this request.
        abandoned = true; abort(true); return;
    } finally {
        // Reserve only after retrieval: superseded in-flight reads still abort
        // through the existing validity check and never claim a final event.
        if (!abandoned && sourceValid()) {
            const names = { user: context().name1, character: context().name2 };
            delivery.begin({ memory: expectedMessages(preparedMessages, names), input: expectedMessages(protectedMessages, { ...names, continuation: type === 'continue' }), guidance }, sourceValid);
            showDelivery('Memory found; adding it to the prompt…', { label: 'Adding memory', kind: 'working' });
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
        if (!response.ok) throw new Error('SillyMemory settings could not be saved. Check the SillyTavern connection and reload.');
        const stored = await response.json();
        if (JSON.parse(stored.settings).extension_settings?.sillymemory?.owner !== owner) throw new Error('SillyMemory settings could not be saved. Check the SillyTavern connection and reload.');
    }
    stateKey = `sillymemory:state:${owner}`;
    savedKey = new SavedKey(localStorage, owner);
    state = { endpoint: '', project: '', ready: false, budget: DEFAULTS.budget, stopOnLoss: true, chatCollections: [], ...JSON.parse(localStorage.getItem(stateKey) || '{}') };
    delete state.enabled;
    if (!/^[a-f0-9]{32}$/.test(state.activationGeneration || '')) {
        state.activationGeneration = uuid();
        persist();
    }
    const folder = new URL('.', import.meta.url).pathname.split('/scripts/extensions/')[1].replace(/\/$/, '');
    const html = await ctx.renderExtensionTemplateAsync(folder, 'settings');
    document.querySelector('#extensions_settings2').insertAdjacentHTML('beforeend', html);
    root = document.querySelector('#sillymemory');
    hostGenerating = (await import('/script.js')).isGenerating;
    [hostOpenAI, hostTokenizers] = await Promise.all([import('/scripts/openai.js'), import('/scripts/tokenizers.js')]);
    const composer = document.getElementById('send_form');
    if (composer) {
        composer.before(element('chat-status-template').content.cloneNode(true));
        chatStatus = document.getElementById('sillymemory-chat');
        for (const [name, action] of [['settings', () => openMemorySettings()], ['vectors', () => openMemorySettings(true)], ['history', openChatHistory]]) {
            chatElement(name).onclick = event => {
                event.stopPropagation();
                return action().catch(() => status('Could not open the requested panel. Use SillyTavern’s own menus.', { error: true }));
            };
        }
        for (const [name, handler] of [['cleanup', () => cleanupTestData()], ['sync', sync],
            ['delete', () => action(() => deleteMemory(false))], ['rebuild', rebuildMemory], ['inspect', toggleMemoryInspection], ['retry', retryReply],
            ['reconnect', reconnect], ['toggle', toggleMemory], ['token-compare', compareTokenUsage]]) {
            chatElement(name).onclick = event => { event.stopPropagation(); return handler(); };
        }
    }
    statusView = new OperationStatus((text, progress) => {
        element('status').textContent = text;
        renderSettings();
        const bar = element('progress');
        bar.hidden = !progress;
        if (progress?.total > 0) { bar.max = progress.total; bar.value = progress.completed; }
        else bar.removeAttribute('value');
    });
    for (const name of ['endpoint', 'project', 'budget']) element(name).value = state[name];
    const analyzerGroup = element('analyzers'), analyzerSummary = element('analyzers-summary');
    analyzerGroup.replaceChildren(...ANALYZERS.map(name => {
        const label = document.createElement('label');
        label.append(Object.assign(document.createElement('input'), { type: 'checkbox', value: name }), name);
        return label;
    }));
    const analyzerBoxes = [...analyzerGroup.querySelectorAll('input')];
    const renderAnalyzers = (message = '') => {
        const chosen = options(state).analyzers;
        for (const box of analyzerBoxes) box.checked = chosen.includes(box.value);
        analyzerSummary.textContent = `${message}Selected: ${chosen.join(', ')}`;
    };
    renderAnalyzers();
    analyzerGroup.onchange = () => {
        const checked = analyzerBoxes.filter(box => box.checked).map(box => box.value);
        // Keep the last language instead of silently falling back to the default.
        if (!checked.length) { renderAnalyzers('Choose at least one language. '); return; }
        state.analyzers = options({ ...state, analyzers: checked }).analyzers;
        renderAnalyzers(); persist(); renderChatStatus();
    };
    element('stopOnLoss').checked = state.stopOnLoss !== false;
    element('stopOnLoss').onchange = () => { state.stopOnLoss = element('stopOnLoss').checked; persist(); };
    renderSettings();
    if (!navigator.locks) { sessionUnavailable = 'This browser needs Web Locks support (localhost or HTTPS) to use SillyMemory safely.'; status(sessionUnavailable); return; }
    // One live instance per account/browser, preventing cross-tab write/delete races.
    navigator.locks.request(`sillymemory-session:${owner}`, { ifAvailable: true }, async lock => {
        if (!lock) { sessionUnavailable = 'SillyMemory is already open in another tab. Close that tab and reload this one.'; status(sessionUnavailable); root.querySelectorAll('button,input').forEach(x => { x.disabled = true; }); return; }
        sessionReady = true;
        const closed = new Promise(resolve => addEventListener('pagehide', () => {
            sessionReady = false; connectingClient?.forget(); client?.forget(); invalidate(); resolve();
        }, { once: true }));
        root.querySelectorAll('button,input').forEach(x => { x.disabled = false; });
        await action(async () => {
            if (!state.endpoint || !state.project) return;
            const key = savedKey.read(state);
            if (key) await connect(state, key, true);
        });
        await closed;
    });
    async function connect(config, key, restoring = false, valid = () => true) {
        const candidate = connectionConfig(config);
        if ((state.testCollection || state.chatCollections.length) && (candidate.endpoint !== state.endpoint || candidate.project !== state.project)) throw new ConnectionError('Delete this project’s memory before changing the connection.');
        const changed = candidate.endpoint !== state.endpoint || candidate.project !== state.project;
        const candidateClient = new LambdaClient(candidate, key);
        connectionVerified = false;
        invalidate(); status('Connecting: finishing earlier saves…');
        connectingClient = candidateClient;
        try {
            await drain(); client?.forget(); client = undefined; makeCollections();
            if (!sessionReady || !valid()) throw new ConnectionError('Connection canceled because the session changed.', 0, 'canceled');
            status(restoring ? 'Reconnecting with the saved key…' : 'Checking the project key before saving…');
            await candidateClient.checkConnection();
            if (!sessionReady || !valid() || context().extensionSettings.sillymemory?.owner !== owner) throw new ConnectionError('Connection canceled because the session changed.', 0, 'canceled');
            const ready = !changed && state.ready;
            const nextState = { ...state, ...candidate, ready };
            if (changed) { delete nextState.projectId; delete nextState.appRecovery; }
            delete nextState.enabled;
            if (restoring) persist(nextState);
            else savedKey.commit(candidate, key, nextState);
            state = nextState;
            client = candidateClient; connectionVerified = true; makeCollections(); gatePassed = false;
            if (memoryEnabled()) schedule();
            else status(state.ready ? 'Connected. Memory stays off until you turn it on in a chat.' : 'Connected. Run the setup test, then turn memory on in a saved character chat.');
        } catch (error) {
            connectionVerified = false;
            candidateClient.forget();
            if (error.status === 401) {
                if (restoring) savedKey.forgetMatching(candidate, key);
                persist();
            }
            throw error;
        } finally { if (connectingClient === candidateClient) connectingClient = undefined; }
    }
    // The account API origin is fixed for users; developers may point a browser
    // at another LambdaDB environment with this localStorage entry.
    const accountApiOrigin = () => {
        const override = localStorage.getItem('sillymemory:api-origin');
        try { if (override && new URL(override).protocol === 'https:' && new URL(override).origin === override) return override; } catch { /* use the default */ }
        return 'https://api.lambdadb.ai';
    };
    // One registered OAuth client per installation callback; it is not a secret.
    const registration = {
        read: () => { try { return JSON.parse(localStorage.getItem('sillymemory:oauth-client') || 'null'); } catch { return null; } },
        write: value => localStorage.setItem('sillymemory:oauth-client', JSON.stringify(value)),
    };
    let appController;
    const cancelApp = () => appController?.abort(new DOMException('Connection canceled', 'AbortError'));
    addEventListener('pagehide', cancelApp, { once: true });
    element('app-cancel').onclick = cancelApp;
    element('app-connect').onclick = () => {
        if (!sessionReady || busy || hostGenerating()) return;
        const hasMemory = Boolean(state.testCollection || state.chatCollections.length);
        if (connectionVerified) {
            status(hasMemory ? 'This project is already connected. Delete this project’s memory before connecting another project.'
                : 'This project is already connected. Disconnect to connect another project.');
            return;
        }
        const popup = window.open('about:blank', '_blank');
        if (popup) {
            popup.opener = null;
            // Discovery, registration and connection setup run before the window can
            // navigate; say so instead of showing an empty page.
            popup.document.title = 'Connect to LambdaDB';
            popup.document.body.style.cssText = 'font: 16px system-ui, sans-serif; margin: 3em; color: #333';
            popup.document.body.textContent = 'Opening LambdaDB sign-in…';
        }
        appController = new AbortController();
        const controller = appController, requestOwner = owner;
        element('app-waiting').hidden = false;
        return action(async () => {
            try {
                const valid = () => sessionReady && context().extensionSettings.sillymemory?.owner === requestOwner && !controller.signal.aborted;
                const recover = recovery => {
                    if (!valid()) throw new ConnectionError('Connection canceled because the account changed.');
                    const next = { ...state, appRecovery: recovery }; persist(next); state = next;
                };
                const connected = await connectWithLambdaDB({ signal: controller.signal, popup, valid,
                    apiOrigin: accountApiOrigin(), callback: callbackUrl(import.meta.url), clients: registration,
                    projectId: hasMemory ? state.projectId || state.appRecovery?.projectId : state.appRecovery?.projectId,
                    projectName: hasMemory && !state.projectId && !state.appRecovery?.projectId ? state.project : undefined,
                    recoveryId: state.appRecovery?.connectionId,
                    onStatus: (message, url) => {
                        if (!valid()) return;
                        status(message);
                        if (url) element('app-link').href = url;
                    },
                    beforeIssue: recover,
                });
                if (!valid()) throw new ConnectionError('Connection canceled because the account changed.');
                if (hasMemory && (connected.endpoint !== state.endpoint || connected.project !== state.project)) throw new ConnectionError('Delete this project’s memory before changing the connection.');
                await connect(connected, connected.key, false, valid);
                element('app-waiting').hidden = true;
                const next = { ...state, projectId: connected.projectId }; delete next.appRecovery;
                persist(next); state = next;
                for (const name of ['endpoint', 'project']) element(name).value = state[name];
                if (!state.ready && !state.testCollection) await prepareConnection();
            } catch (error) {
                if (controller.signal.aborted) status('Connection canceled. Existing project data is retained.');
                else throw error;
            } finally {
                element('app-waiting').hidden = true; appController = undefined;
                // The callback page closes itself; a failure or cancel before it must not leave a blank window.
                if (popup && !popup.closed) popup.close();
            }
        });
    };
    element('connect').onclick = () => {
        if (!sessionReady || busy || hostGenerating()) return;
        return action(async () => {
            const candidate = connectionConfig({ endpoint: element('endpoint').value.trim(), project: element('project').value.trim() });
            const typed = element('key').value.trim();
            const key = typed || savedKey.read(candidate) || ''; element('key').value = '';
            await connect(candidate, key, !typed);
            if (typed && state.appRecovery) {
                const next = { ...state }; delete next.appRecovery;
                persist(next); state = next;
            }
            if (!state.ready && !state.testCollection) await prepareConnection();
        });
    };
    function reconnect() {
        if (!sessionReady || busy || retrying || hostGenerating() || connectionVerified) return;
        return action(async () => {
            const key = savedKey.read(state);
            if (!key) throw new ConnectionError('No saved key is available for this project. Open Connection settings to connect.');
            await connect(state, key, true);
        });
    }
    // Forget key while not connected; Disconnect while connected. Both remove the saved key.
    element('forget').onclick = element('disconnect').onclick = () => action(async () => {
        connectionVerified = false;
        invalidate();
        element('key').value = ''; client?.forget(); connectingClient?.forget();
        savedKey.forget();
        persist();
        status('Forgetting key: finishing earlier saves…');
        await drain(); client?.forget(); client = undefined; makeCollections();
        stoppedRequest = undefined;
        showDelivery('');
        setInspection('No memory added yet.');
        element('key').value = ''; gatePassed = false; status('Saved key removed and memory is off. Enter your key to reconnect.');
    });
    async function testConnection() {
        if (!client) throw new ConnectionError('Enter your API key first.');
        if (state.testCollection) throw new ConnectionError('Use Clean up test data before trying again.');
        gatePassed = false;
        state.testCollection = `smtest_${uuid()}`; persist();
        gatePassed = await runTransportGate(client, owner, state.testCollection, status);
        delete state.testCollection; persist();
    }
    element('gate').onclick = () => action(testConnection);
    function cleanupTestData() {
        return action(async () => {
            if (!client) throw new ConnectionError('Enter your API key first.');
            if (state.testCollection) await client.deleteOwnedCollection(state.testCollection, owner);
            delete state.testCollection; persist(); status('Test data deleted.');
        });
    }
    element('cleanup').onclick = cleanupTestData;
    element('recover-cleanup').onclick = cleanupTestData;
    async function prepareConnection() {
        if (!client) throw new ConnectionError('Connect your project before running the setup test.');
        if (!gatePassed) await testConnection();
        state.ready = true; persist();
        status('Connected. Chat memory is ready. Turn memory on separately in each saved character chat.');
    }
    element('provision').onclick = () => action(prepareConnection);
    element('budget').onchange = () => {
        state.budget = options({ ...state, budget: element('budget').value }).budget;
        element('budget').value = state.budget; persist(); schedule();
    };
    async function deleteMemory(all) {
        if (!client || !collections) throw new ConnectionError('Reconnect before deleting memory.');
        if (!all && (!capture(context()) || !context().chatMetadata.sillymemory?.id)) throw new ConnectionError('This chat has no saved memory yet.');
        const target = context(), file = target.getCurrentChatId(), avatar = target.characters[target.characterId]?.avatar;
        const sameChat = () => context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
        const answer = await target.Popup.show.confirm('Delete memory', all ? 'Delete all memory for every story and branch? Your local chats are kept.' : 'Delete this chat’s memory and turn memory off in this chat? Your local chat, other chats and branches are kept.');
        if (answer !== target.POPUP_RESULT.AFFIRMATIVE) return;
        if (!sameChat()) throw new ConnectionError('Chat changed while the popup was open. Select it and retry deletion.');
        if (all) {
            const next = { ...state, ready: false, activationGeneration: uuid() };
            persist(next); // Failed persistence must stop before remote deletion.
            state = next;
        }
        if (!all && supportsChat(context())) await setChatMemory(false);
        invalidate(); clearTimeout(timer);
        for (const e of engines.values()) e.invalidate();
        status('Deleting memory: finishing earlier saves…');
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
        stoppedRequest = undefined;
        showDelivery('');
        setInspection('No memory added yet.');
        status(all ? 'All memory was deleted. Your local chats are kept. Turn memory on in a chat to start again.' : 'This chat’s memory was deleted. Turn memory on to start again.');
    }
    element('delete').onclick = () => action(() => deleteMemory(true));
    // Rebuild recreates one story's collection with the current analyzers; sync re-uploads from the local chat.
    async function rebuildStory() {
        if (!client || !collections) throw new ConnectionError('Reconnect before rebuilding memory.');
        if (!capture(context()) || !context().chatMetadata.sillymemory?.id) throw new ConnectionError('This chat has no saved memory yet.');
        const target = context(), file = target.getCurrentChatId(), avatar = target.characters[target.characterId]?.avatar;
        const sameChat = () => context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
        const answer = await target.Popup.show.confirm('Rebuild story memory', `Rebuild the memory of every branch of this story with the current text search languages (${options(state).analyzers.join(', ')})? Your local chats are kept. This chat uploads its memory again now; other branches upload again when you open them.`);
        if (answer !== target.POPUP_RESULT.AFFIRMATIVE) return false;
        if (!sameChat()) throw new ConnectionError('Chat changed while the popup was open. Select it and retry.');
        invalidate(); clearTimeout(timer);
        for (const e of engines.values()) e.invalidate();
        status('Rebuilding memory: finishing earlier saves…');
        await drain();
        const { saveChat } = await import('/script.js');
        if (!sameChat() || !await ensureChatIdentity(target, saveChat, sameChat)) throw new ConnectionError('Chat changed before rebuilding. Select it and retry.');
        const entry = await chatCollection(capture(target), owner);
        // Evict cached engines first: an uncertain deletion must not leave remote state
        // that describes the deleted collection, or the recreated one would skip uploads.
        for (const [key, instance] of engines) if (instance.collection === entry.collection) engines.delete(key);
        engine = undefined; storyAnalyzers = undefined;
        await collections.delete({ ...entry, branch: undefined });
        new Journal(localStorage, `${owner}:${entry.collection}`).clear();
        stoppedRequest = undefined;
        showDelivery('');
        setInspection('No memory added yet.');
        status('This story’s memory was deleted. Saving this chat’s memory again with the current text search languages…');
        return true;
    }
    async function rebuildMemory() {
        let rebuilt = false;
        await action(async () => { rebuilt = await rebuildStory(); });
        if (rebuilt) schedule();
    }
    const events = ctx.eventTypes;
    ctx.eventSource.on(events.CHAT_COMPLETION_PROMPT_READY, data => {
        if (data.dryRun || !tokenUsage || tokenUsage.finished || tokenUsage.model !== tokenizerKey()) return;
        tokenUsage.native = { packet: JSON.stringify(data.chat), tokens: hostPromptTokens(hostOpenAI.promptManager, data.chat) };
    });
    ctx.eventSource.on(events.GENERATE_AFTER_DATA, (data, dryRun) => {
        if (!dryRun && tokenUsage && !tokenUsage.finished) {
            const usage = tokenUsage;
            usage.input = usage.target === requestTarget() && usage.model === tokenizerKey() && usage.native?.packet === JSON.stringify(data?.prompt) ? usage.native?.tokens : undefined;
            delete usage.native; usage.finished = true; renderTokenUsage();
        }
        const finished = delivery.finish(context().mainApi === 'openai' ? data?.prompt : null, dryRun);
        if (!finished) return;
        if (finished.canceled) {
            showMemoryPreview();
            clearTokenUsage();
            ctx.stopGeneration();
            showDelivery('Reply stopped because the chat or memory settings changed while memory was being added. Generate again.', { label: 'Reply stopped', kind: 'error' });
            setInspection('No memory added to the last prompt.');
            return;
        }
        const stop = state.stopOnLoss !== false;
        // The host catches listener exceptions; use its cancellation API instead.
        if (finished.lost && stop) ctx.stopGeneration();
        const text = deliverySummary(finished.result, stop);
        const uncertain = !finished.result || [...finished.result.memory, ...finished.result.input].some(m => m.outcome === 'unverified');
        const notice = finished.lost ? { label: stop ? 'Reply stopped' : 'Prompt warning', kind: stop ? 'error' : 'warning' }
            : uncertain ? { label: finished.result ? 'Memory partly checked' : 'Memory not checked', kind: 'warning' }
                : { label: finished.result.memory.length ? 'Memory added' : 'No related memory', kind: 'ready' };
        showDelivery(text, notice);
        if (finished.lost && stop) rememberStoppedRequest(text, promptType);
        if (finished.result) {
            const included = finished.result.memory.filter(m => m.outcome === 'included');
            const omitted = finished.result.memory.filter(m => m.outcome !== 'included');
            setInspection(`Memory in the last prompt (${included.length} of ${finished.result.memory.length}):\n\n${included.map(m => m.content).join('\n\n') || 'None.'}${omitted.length ? `\n\nNot found in the last prompt:\n\n${omitted.map(m => m.content).join('\n\n')}` : ''}`);
        }
    });
    ctx.eventSource.on(events.GENERATION_STARTED, (type, _options, dryRun) => {
        if (dryRun || type === 'quiet') return;
        showMemoryPreview();
        clearTokenUsage();
        stoppedRequest = undefined; deliveryNotice = undefined;
        renderChatStatus();
    });
    ctx.eventSource.on(events.SETTINGS_UPDATED, renderSettings);
    document.addEventListener('input', event => { if (event.target.id === 'vectors_enabled_chats') renderSettings(); });
    for (const name of ['CHAT_CHANGED', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_ENDED', 'CHAT_RENAMED']) {
        if (events[name]) ctx.eventSource.on(events[name], () => {
            if (name !== 'GENERATION_ENDED') { sourceRevision++; stoppedRequest = undefined; }
            if (!['GENERATION_ENDED', 'MESSAGE_RECEIVED'].includes(name)) { showMemoryPreview(); clearTokenUsage(); }
            if (name === 'CHAT_CHANGED' || name === 'CHAT_RENAMED') {
                identityKey = undefined;
                setInspection('No memory added in this chat yet.');
                showDelivery('');
            }
            schedule();
        });
    }
    addEventListener('pagehide', () => { client?.forget(); element('key').value = ''; });
}
context().eventSource.on(context().eventTypes.APP_READY, () => { setTimeout(() => initialize().catch(() => { globalThis.toastr?.error('SillyMemory could not initialize. Check browser storage access and the supported SillyTavern version.'); }), 0); });
