import { createCheckpoint, finishCheckpoint, resumeCheckpoint, listCheckpoints, checkpointRows, renameCheckpoint, deleteCheckpoint } from './src/checkpoints.js';
import { LambdaClient, ConnectionError, connectionConfig } from './src/client.js';
import { SavedKey } from './src/credentials.js';
import { ChatCollections, chatCollection, ensureChatIdentity } from './src/chat-collections.js';
import { runTransportGate } from './src/gate.js';
import { MemoryEngine, Journal, capture, supportsChat, fingerprint, options, DEFAULTS, memoryBoundary, archiveBoundary } from './src/memory.js';
import { OperationStatus, failureText } from './src/status.js';
import { PromptDelivery, expectedMessages, deliverySummary } from './src/delivery.js';
import { MEMORY_GUIDANCE, retentionAnchor, quoteMemoryText, quoteMemoryMessages } from './src/context.js';
import { hostPromptTokens, dialogueSnapshot, compareDialogue, comparisonLabel, tokenLabel } from './src/token-usage.js';

const context = () => SillyTavern.getContext();
const memoryEnabled = () => connectionVerified && state?.ready && context().chatMetadata?.sillymemoryEnabled === true;
const uuid = () => crypto.randomUUID().replaceAll('-', '');
let client, engine, root, state, stateKey, owner, timer, busy = false, gatePassed = false;
let sessionReady = false;
let connectionVerified = false, shownConnection, retrySync = false;
let savedKey, connectingClient;
let promptSequence = 0;
let retrievalSequence = 0, retrievalOperation;
let statusView, collections, identityKey;
let preparation = Promise.resolve();
let checkpointRevision = 0;
let chatStatus, stoppedRequest, deliveryNotice, sessionUnavailable;
let snapshotOperation;
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
function savedSnapshot() {
    const ctx = context(), memory = ctx.chatMetadata?.sillymemory;
    // A native fork inherits extension metadata but has a new host integrity.
    // It is a writable chat, not the frozen snapshot it was copied from.
    return Boolean(memory?.checkpoint && memory.integrity === ctx.chatMetadata.integrity);
}
function canBrowseChats() {
    const ctx = context();
    return Boolean(ctx.groupId || ctx.characters[ctx.characterId]?.avatar);
}
function chatBlocker() {
    const ctx = context();
    if (!supportsChat(ctx)) return { label: 'Unavailable in this chat', message: 'Select a saved, single-character text chat to use SillyMemory. Group chats and tool conversations are not supported.' };
    if (savedSnapshot()) return { action: 'resume', label: 'Saved snapshot', message: 'This is a frozen memory snapshot. Resume it in a new chat to continue, or use Chat history to return to your conversation.' };
    if (ctx.extensionSettings.vectors?.enabled_chats) return { action: 'vectors', label: 'Vector Storage conflict', message: 'SillyMemory retrieval is skipped while Vector Storage chat vectorization is on. Turn off its chat vectorization to use SillyMemory, which connects directly to LambdaDB.' };
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
    element('delivery').textContent = text;
    deliveryNotice = notice;
    renderChatStatus();
}
function showMemoryPreview(passages) {
    if (!chatStatus) return;
    const preview = chatElement('memory'), list = chatElement('memory-list');
    list.replaceChildren();
    preview.hidden = !passages;
    if (!passages) return;
    chatElement('memory-summary').textContent = passages.length
        ? `${passages.length} source passage${passages.length === 1 ? '' : 's'} selected. Delivery status is shown above.`
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
    const blocker = memoryEnabled() || savedSnapshot() || !supportsChat(context()) ? chatBlocker() : null;
    const stopped = currentStoppedRequest();
    let label = 'Off', kind = 'idle';
    if (sessionUnavailable) { label = 'Unavailable'; kind = 'warning'; }
    else if (!connected) { label = busy ? 'Connecting' : 'Connect'; kind = statusView?.error ? 'error' : 'idle'; }
    else if (snapshotOperation) { label = snapshotOperation; kind = 'working'; }
    else if (state.testCollection) { label = 'Test cleanup needed'; kind = 'warning'; }
    else if (!state.ready) label = 'Setup needed';
    else if (blocker) { label = blocker.label; kind = 'warning'; }
    else if (memoryEnabled()) {
        if (stopped) { label = 'Reply stopped'; kind = 'error'; }
        else if (statusView.error) { label = 'Needs attention'; kind = 'error'; }
        else if (statusView.progress) { label = statusView.progress.phase === 'searching' || statusView.progress.phase === 'budgeting' ? 'Preparing reply' : 'Updating'; kind = 'working'; }
        else { label = deliveryNotice?.label || 'Ready'; kind = deliveryNotice?.kind || 'ready'; }
    }
    chatStatus.dataset.kind = kind;
    chatElement('label').textContent = `Memory · ${label}`;
    chatElement('status').textContent = sessionUnavailable || (snapshotOperation ? element('status').textContent : blocker?.message || stopped?.message || element('status').textContent);
    chatElement('delivery').textContent = element('delivery').textContent;
    chatElement('delivery').hidden = chatElement('delivery').textContent === chatElement('status').textContent;
    const progress = chatElement('progress'), value = snapshotOperation ? {} : !blocker && !stopped && statusView.progress;
    progress.hidden = !value;
    if (value?.total > 0) { progress.max = value.total; progress.value = value.completed; }
    else progress.removeAttribute('value');
    const canAct = connected && sessionReady && !busy && !hostGenerating();
    chatElement('vectors').hidden = blocker?.action !== 'vectors';
    chatElement('resume').hidden = blocker?.action !== 'resume';
    chatElement('history').disabled = busy || !sessionReady || hostGenerating() || !canBrowseChats();
    chatElement('reconnect').hidden = !canReconnect();
    chatElement('reconnect').disabled = !sessionReady || busy || retrying || hostGenerating();
    chatElement('cleanup').hidden = !connected || !state.testCollection;
    chatElement('sync').hidden = !retrySync || !memoryEnabled() || Boolean(blocker) || !state.ready || Boolean(state.testCollection);
    chatElement('retry').hidden = !stopped?.source || !['normal', 'regenerate'].includes(stopped.type) || !context().chat.at(-1)?.is_user || !memoryEnabled() || !state.ready || Boolean(blocker) || Boolean(state.testCollection);
    chatElement('toggle').hidden = !connected || !state.ready || Boolean(state.testCollection) || !supportsChat(context()) || Boolean(savedSnapshot());
    chatElement('toggle').textContent = memoryEnabled() ? 'Turn memory off in this chat' : 'Turn memory on in this chat';
    chatElement('toggle').setAttribute('aria-pressed', String(connected && memoryEnabled()));
    for (const name of ['cleanup', 'sync', 'retry', 'toggle', 'resume']) chatElement(name).disabled = !canAct || retrying;
}
function toggleMemory() {
    if (!sessionReady || !connectionVerified || !client || busy || retrying || hostGenerating()) return;
    if (!memoryEnabled() && (!state.ready || state.testCollection)) return;
    if (!supportsChat(context()) || savedSnapshot()) return;
    return action(() => setChatMemory(!memoryEnabled()));
}
async function setChatMemory(enabled) {
    const ctx = context(), metadata = ctx.chatMetadata, target = requestTarget();
    const current = () => context().chatMetadata === metadata && requestTarget() === target;
    if (!sessionReady || !connectionVerified || !client || !state.ready || state.testCollection || !supportsChat(ctx) || savedSnapshot() || hostGenerating()) return;
    clearTokenUsage(); invalidate(); clearTimeout(timer);
    const previous = metadata.sillymemoryEnabled;
    metadata.sillymemoryEnabled = enabled;
    status(enabled ? 'Saving memory activation for this chat…' : 'Memory disabled for this chat. Saving this chat’s preference…');
    if (!enabled) {
        showDelivery('Memory disabled for this chat. No pending prompt verification.');
        element('inspection').textContent = 'No memory prepared.';
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
        saving = ctx.loader.show({ blocking: true, toastMode: 'static', message: 'Saving chat memory preference…' });
        if (!current()) return;
        await saveChatConditional();
        if (!current()) return;
        // The native save reports failures through toasts, so confirm the saved
        // flag before enabling uploads. Read only the captured chat target.
        const response = await fetch('/api/chats/get', { method: 'POST', headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ avatar_url: ctx.characters[ctx.characterId]?.avatar, file_name: ctx.getCurrentChatId() }) });
        const rows = response.ok ? await response.json() : null;
        if (!current()) return;
        if (rows?.[0]?.chat_metadata?.sillymemoryEnabled !== enabled) throw new ConnectionError('The chat memory preference could not be saved. Check the SillyTavern connection and retry.');
    } catch (error) {
        if (enabled) metadata.sillymemoryEnabled = previous;
        if (!current()) return;
        invalidate();
        throw error;
    } finally { if (saving) await saving.hide(); }
    if (!current()) return;
    if (enabled) {
        showDelivery('Memory enabled for this chat. No prompt checked yet.');
        schedule();
    } else {
        status('Memory disabled for this chat. SillyTavern uses its usual chat history. Remote data is retained until deleted.');
        showDelivery('Memory disabled for this chat. No pending prompt verification.');
        element('inspection').textContent = 'No memory prepared.';
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
async function openMemoryInspection() {
    await openMemorySettings();
    element('advanced').open = true;
    const inspection = element('inspection');
    inspection.closest('details').open = true;
    inspection.scrollIntoView({ block: 'nearest' });
    inspection.tabIndex = -1; inspection.focus({ preventScroll: true });
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
function renderSettings() {
    if (!root || !state) return;
    const connected = Boolean(sessionReady && connectionVerified && client);
    const connection = element('connection');
    if (shownConnection !== connected) {
        if (connected && connection.contains(document.activeElement)) connection.querySelector('summary').focus();
        connection.open = !connected;
        shownConnection = connected;
    }
    element('connection-state').textContent = connected ? `Connected · ${state.project}` : 'Not connected';
    const cleanup = Boolean(connected && state.testCollection);
    element('connect').textContent = state.ready || state.testCollection ? 'Save and connect' : 'Connect and prepare';
    element('prepare-controls').hidden = !connected || state.ready || cleanup;
    element('usage-help').hidden = !connected || !state.ready;
    element('next-step').textContent = !connected ? 'Connect your project above to get started.'
        : cleanup ? 'A connection test needs cleanup. Remove its temporary data before trying again.'
        : !state.ready ? 'Check your connection once before turning memory on.'
        : 'Connection ready. Turn memory on separately in each chat’s Memory panel.';
    element('mode-help').textContent = 'On/off is saved with each chat. When off, SillyTavern uses its usual chat history and saved remote memory is kept.';
    element('recover-cleanup').hidden = !cleanup;
    element('retry-sync').hidden = !retrySync || !connected || !memoryEnabled() || cleanup;
    element('recovery-actions').hidden = element('recover-cleanup').hidden && element('retry-sync').hidden;
    root.querySelectorAll('button, input').forEach(x => { x.disabled = busy || !sessionReady; });
    element('history').disabled = busy || !sessionReady || hostGenerating() || !canBrowseChats();
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
    return sessionReady && memoryEnabled() && engine === instance && fingerprint(capture(context())) === fingerprint(snapshot);
}
async function sync() {
    if (!sessionReady || !memoryEnabled() || !state.ready || !client || busy) return;
    if (savedSnapshot()) { status(chatBlocker().message); return; }
    retrySync = false; renderSettings();
    const sequence = promptSequence;
    const current = () => sequence === promptSequence && sessionReady && memoryEnabled();
    const operation = statusView.start(current);
    try {
        const prepared = await prepareMemory(current, operation.update); if (!prepared) return;
        const { snapshot, instance } = prepared;
        const valid = () => current() && validSnapshot(snapshot, instance);
        const result = await instance.sync(snapshot, { ...options(state), archiveBefore: archiveBoundary(snapshot) }, valid, operation.update);
        if (result) operation.finish(`Current chat synchronized: ${result.docs.length} archived conversation chunks. Recent messages stay in the native chat. Memory will be retrieved on generation.`);
    } catch (e) { if (operation.current()) fail(e, operation); }
}
function schedule() {
    if (!sessionReady) return; // Preserve the lock-conflict explanation.
    invalidate(); clearTimeout(timer);
    if (!client) { status('Enter your project API key in Connection settings to connect.'); return; }
    if (!memoryEnabled()) { status('Memory disabled. SillyTavern uses its usual chat history. Remote data is retained until deleted.'); return; }
    if (!state.ready || !capture(context())) { status('Select a supported character chat and connect to a memory collection.'); return; }
    if (savedSnapshot()) { status(chatBlocker().message); return; }
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
        const message = `Generation stopped: memory preparation failed. ${failureText(error, { generation: true })}`;
        showDelivery(message, { label: 'Reply stopped', kind: 'error' });
        rememberStoppedRequest(message, type);
    }
    if (error.status === 401 && client) {
        connectionVerified = false;
        client.forget(); invalidate();
        try { savedKey.forget(); persist(); }
        catch { status('Authentication failed. Memory is disabled. Browser storage could not be updated; allow storage, then click Forget key again.'); return; }
        client = undefined; collections = undefined;
        status(failureText(error)); return;
    }
    clearInjection();
    if (root) element('inspection').textContent = 'No memory injected: operation failed.';
    if (operation) operation.fail(error, generation ? 'Generation stopped. ' : '', generation); else status(failureText(error, { sync: false }), { error: true });
}
async function action(job) {
    if (busy) return;
    busy = true; renderSettings();
    try { await job(); } catch (e) { fail(e); }
    finally { busy = false; renderSettings(); }
}

// Called with SillyTavern's ephemeral coreChat array. Never mutate source messages.
globalThis.sillymemory_intercept = async (chat, contextSize, abort, type) => {
    if (delivery.awaitingPrompt) {
        // No final event will be emitted for this rejected interceptor. Keep the
        // previous slot until its own non-dry-run final event has been consumed.
        showDelivery('Another prompt is awaiting final verification. Wait and generate again. If prompt preparation failed, reload to reset it.', { label: 'Checking prompt', kind: 'warning' });
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
    invalidate();
    const requestTokens = beginTokenUsage(chat);
    const sequence = promptSequence;
    const retrieval = ++retrievalSequence;
    if (!sessionReady || !memoryEnabled() || !state.ready || !client) return;
    if (busy) {
        promptSource = undefined;
        fail(new ConnectionError('Wait for the current memory operation to finish, then regenerate.'), undefined, true, type);
        abort(true); return;
    }
    if (context().extensionSettings.vectors?.enabled_chats) {
        status('Disable built-in Vector Storage chat vectorization before using SillyMemory.'); return;
    }
    let snapshot = capture(context()); if (!snapshot) { status('Select a supported character chat to use memory.'); return; }
    promptType = type;
    showDelivery('Preparing memory for this reply. Delivery is not yet verified.');
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
        element('inspection').textContent = `${preparedTokens} / ${config.budget} tokens\n\n${quoteMemoryText(result.text)}`;
        if (requestTokens && tokenUsage === requestTokens) Object.assign(requestTokens, { after: dialogueSnapshot(chat), memory: preparedTokens, guidance: requestGuidance });
        showMemoryPreview(result.passages);
        operation.finish(`Prepared ${result.passages.length} source passages in ${preparedMessages.length} memory excerpts (${preparedTokens} tokens); awaiting final prompt verification.`);
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
            showDelivery('Memory prepared; waiting for the final host prompt. Delivery is not yet verified.', { label: 'Checking prompt', kind: 'working' });
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
    savedKey = new SavedKey(localStorage, owner);
    state = { endpoint: '', project: '', ready: false, budget: DEFAULTS.budget, stopOnLoss: true, chatCollections: [], ...JSON.parse(localStorage.getItem(stateKey) || '{}') };
    delete state.enabled;
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
        for (const [name, action] of [['settings', () => openMemorySettings()], ['vectors', () => openMemorySettings(true)], ['history', openChatHistory], ['inspect', openMemoryInspection]]) {
            chatElement(name).onclick = event => {
                event.stopPropagation();
                return action().catch(() => status('Could not open the requested panel. Use SillyTavern’s native menus.', { error: true }));
            };
        }
        for (const [name, handler] of [['cleanup', () => element('recover-cleanup').click()],
            ['sync', () => element('retry-sync').click()], ['retry', retryReply],
            ['reconnect', reconnect], ['toggle', toggleMemory], ['token-compare', compareTokenUsage], ['resume', () => element('checkpoint-resume').click()]]) {
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
    element('history').onclick = () => openChatHistory().catch(() => status('Could not open chat history. Use Manage chat files beside the chat input.', { error: true }));
    for (const name of ['endpoint', 'project', 'budget']) element(name).value = state[name];
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
    async function connect(config, key, restoring = false) {
        const candidate = connectionConfig(config);
        if ((state.testCollection || state.chatCollections.length) && (candidate.endpoint !== state.endpoint || candidate.project !== state.project)) throw new ConnectionError('Clean up owned collections before changing the connection.');
        const changed = candidate.endpoint !== state.endpoint || candidate.project !== state.project;
        const candidateClient = new LambdaClient(candidate, key);
        connectionVerified = false;
        invalidate(); status('Connecting: waiting for earlier writes to finish…');
        connectingClient = candidateClient;
        try {
            await drain(); client?.forget(); client = undefined; makeCollections();
            if (!sessionReady) throw new ConnectionError('Connection canceled because the session changed.', 0, 'canceled');
            status(restoring ? 'Reconnecting with the saved key…' : 'Checking the project key before saving…');
            await candidateClient.checkConnection();
            if (!sessionReady || context().extensionSettings.sillymemory?.owner !== owner) throw new ConnectionError('Connection canceled because the session changed.', 0, 'canceled');
            const ready = !changed && state.ready;
            const nextState = { ...state, ...candidate, ready };
            delete nextState.enabled;
            if (restoring) persist(nextState);
            else savedKey.commit(candidate, key, nextState);
            state = nextState;
            client = candidateClient; connectionVerified = true; makeCollections(); gatePassed = false;
            autoRefreshCheckpoints();
            if (memoryEnabled()) schedule();
            else status(state.ready ? 'Connected. Memory remains disabled.' : 'Connected. Finish preparation, then turn memory on in a saved character chat.');
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
    element('connect').onclick = () => {
        if (!sessionReady || busy || hostGenerating()) return;
        return action(async () => {
            const candidate = connectionConfig({ endpoint: element('endpoint').value.trim(), project: element('project').value.trim() });
            const typed = element('key').value.trim();
            const key = typed || savedKey.read(candidate) || ''; element('key').value = '';
            await connect(candidate, key, !typed);
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
    element('forget').onclick = () => action(async () => {
        connectionVerified = false;
        invalidate();
        element('key').value = ''; client?.forget(); connectingClient?.forget();
        savedKey.forget();
        persist();
        status('Forgetting key: waiting for earlier writes to finish…');
        await drain(); client?.forget(); client = undefined; makeCollections();
        stoppedRequest = undefined;
        showDelivery('Key forgotten. No pending prompt verification.');
        element('inspection').textContent = 'No memory prepared.';
        element('key').value = ''; gatePassed = false; status('Saved key removed. Memory disabled. Enter your key to reconnect.');
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
    element('cleanup').onclick = () => action(async () => {
        if (!client) throw new ConnectionError('Enter your API key first.');
        if (state.testCollection) await client.deleteOwnedCollection(state.testCollection, owner);
        delete state.testCollection; persist(); status('No pending owned test collection remains.');
    });
    element('recover-cleanup').onclick = () => element('cleanup').click();
    element('retry-sync').onclick = () => element('sync').click();
    async function prepareConnection() {
        if (!client) throw new ConnectionError('Connect your project before preparing chat memory.');
        if (!gatePassed) await testConnection();
        state.ready = true; persist();
        status('Connected. Chat memory is ready. Turn memory on separately in each saved character chat.');
    }
    element('provision').onclick = () => action(prepareConnection);
    function checkpointReader(ctx, avatar) {
        const request = async (url, body) => {
            const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000), headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, ...body }) });
            if (!response.ok) throw new ConnectionError('Could not read the saved checkpoint.');
            return response.json();
        };
        return { read: name => request('/api/chats/get', { file_name: name }), list: () => request('/api/characters/chats', { metadata: true }) };
    }
    let listSequence = 0, listRequest;
    function refreshCheckpoints(force = false) {
        if (!force && listRequest?.valid()) return listRequest.promise;
        const sequence = ++listSequence, ctx = context(), file = ctx.getCurrentChatId(), listClient = client;
        const avatar = ctx.characters[ctx.characterId]?.avatar, story = ctx.chatMetadata.sillymemory?.story;
        const valid = () => {
            if (sequence !== listSequence || !connectionVerified || client !== listClient) return false;
            const current = context();
            return current.chatMetadata.sillymemory?.story === story && current.getCurrentChatId() === file
                && current.characters[current.characterId]?.avatar === avatar;
        };
        const list = element('checkpoint-list'); list.replaceChildren();
        if (!connectionVerified || !listClient) { list.textContent = 'Reconnect to view saved snapshots.'; return; }
        if (!capture(ctx) || !story) { list.textContent = 'Select a story to view its checkpoints.'; return; }
        list.textContent = 'Checking saved transcripts and memory branches…';
        const request = { valid };
        listRequest = request;
        request.promise = (async () => {
            try {
                const rows = await listCheckpoints({ host: checkpointReader(ctx, avatar), client: listClient, owner, story, avatar, valid });
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
            } catch (error) {
                if (valid()) { list.textContent = 'Checkpoint list unavailable. Reconnect and refresh.'; throw error; }
            } finally { if (listRequest === request) listRequest = undefined; }
        })();
        return request.promise;
    }
    const settingsDrawer = root.closest('.drawer-content');
    const snapshotPanelVisible = () => settingsDrawer.classList.contains('openDrawer')
        && element('advanced').open && element('checkpoints').open && element('checkpoints').getClientRects().length > 0;
    function autoRefreshCheckpoints() {
        if (!snapshotPanelVisible()) return;
        // Automatic list reads stay outside the global operation status.
        // They never start synchronization, uploads or a generation.
        refreshCheckpoints()?.catch(() => {});
    }
    let snapshotPanelWasVisible = false;
    const panelVisibilityChanged = () => {
        const visible = snapshotPanelVisible();
        if (visible && !snapshotPanelWasVisible) autoRefreshCheckpoints();
        snapshotPanelWasVisible = visible;
    };
    for (const name of ['advanced', 'checkpoints']) element(name).addEventListener('toggle', panelVisibilityChanged);
    const panelObserver = new MutationObserver(panelVisibilityChanged);
    for (const target of [settingsDrawer, root.querySelector('.inline-drawer-content')]) {
        panelObserver.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    addEventListener('pagehide', () => panelObserver.disconnect(), { once: true });
    element('checkpoint-refresh').onclick = () => action(() => refreshCheckpoints(true));
    async function checkpointAction(resume, selected, command) {
        if (hostGenerating()) throw new ConnectionError('Wait for generation to finish before changing a memory snapshot.');
        snapshotOperation = command === 'rename' ? 'Renaming snapshot' : command === 'delete' ? 'Deleting snapshot' : resume ? 'Resuming snapshot' : 'Saving snapshot';
        invalidate(); clearTimeout(timer); status('Preparing memory snapshot operation…');
        let succeeded = false;
        try {
            succeeded = await checkpointWork(resume, selected, command) === true;
            if (!succeeded) status('Memory snapshot operation canceled.');
        }
        finally {
            snapshotOperation = undefined;
            // Keep the user's preference throughout the operation. Only resume
            // background work after success; failures must remain visible.
            if (succeeded && memoryEnabled() && connectionVerified && capture(context()) && !savedSnapshot()) {
                clearTimeout(timer); timer = setTimeout(sync, 400);
            }
            renderSettings();
        }
    }
    async function checkpointWork(resume, selected, command) {
        if (!client || !collections || !state.ready || !capture(context())) throw new ConnectionError('Connect, prepare memory and select a character chat first.');
        const ctx = context(), file = ctx.getCurrentChatId(), avatar = ctx.characters[ctx.characterId]?.avatar;
        const revision = checkpointRevision;
        const valid = () => revision === checkpointRevision && context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
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
        if (!valid()) return false;
        const intents = {
            get: key => JSON.parse(localStorage.getItem(`sillymemory:resume:${key}`) || 'null'),
            set: (key, value) => localStorage.setItem(`sillymemory:resume:${key}`, JSON.stringify(value)),
            delete: key => localStorage.removeItem(`sillymemory:resume:${key}`),
        };
        const args = { host, client, collections, owner, file: selected || file, avatar, intents, valid, progress: status, story: ctx.chatMetadata.sillymemory?.story };
        const frozen = savedSnapshot();
        if (selected || frozen) await checkpointRows(args);
        if (command === 'rename' || command === 'delete') {
            if (selected === file) throw new ConnectionError('Open another story path before renaming or deleting this checkpoint.');
            if (command === 'rename') {
                const name = await ctx.Popup.show.input('Rename memory snapshot', 'Checkpoint name (up to 120 characters):');
                if (name === null) return false;
                if (!valid()) throw new ConnectionError('Chat changed while the popup was open. Select the snapshot and retry.');
                await renameCheckpoint(args, name);
                status('Checkpoint name saved.');
            } else {
                const answer = await ctx.Popup.show.confirm('Delete memory snapshot', 'Delete this checkpoint transcript and its remote memory branch? This cannot be undone. Other saved chats and branches remain. A resumed chat that has not synchronized yet will rebuild its memory.');
                if (answer !== ctx.POPUP_RESULT.AFFIRMATIVE) return false;
                if (!valid()) throw new ConnectionError('Chat changed while the popup was open. Select the snapshot and retry.');
                const entry = await deleteCheckpoint(args);
                engines.delete(entryKey(entry)); engine = undefined;
                new Journal(localStorage, `${owner}:${entry.collection}:${entry.branch}`).clear();
                status('Checkpoint transcript and memory branch deleted. Other story paths remain.');
            }
            await refreshCheckpoints(true); return true;
        }
        if (resume) {
            const name = await resumeCheckpoint(args);
            status(`Checkpoint resumed as ${name}. ${memoryEnabled() ? 'Memory will synchronize automatically.' : 'Memory remains off as selected.'}`);
        } else if (selected || frozen) {
            await finishCheckpoint(args);
            if (!selected && valid()) await host.open(file);
            status('Checkpoint verified and ready. Resume it in a new chat.');
        } else {
            if (!await ensureChatIdentity(ctx, saveChat, valid)) return false;
            const rows = [{ chat_metadata: structuredClone(ctx.chatMetadata) }, ...structuredClone(ctx.chat)];
            const name = await createCheckpoint({ ...args, rows, config: options(state), name: element('checkpoint-name').value });
            status(`Checkpoint saved: ${name}. ${memoryEnabled() ? 'Memory will continue in the original chat.' : 'Memory remains off as selected.'}`);
        }
        await refreshCheckpoints(true);
        return true;
    }
    element('checkpoint-save').onclick = () => action(() => checkpointAction(false));
    element('checkpoint-resume').onclick = () => action(() => checkpointAction(true));
    element('budget').onchange = () => {
        state.budget = options({ ...state, budget: element('budget').value }).budget;
        element('budget').value = state.budget; persist(); schedule();
    };
    element('sync').onclick = sync;
    async function deleteMemory(all) {
        if (!client || !collections) throw new ConnectionError('Reconnect before deleting remote memory.');
        if (!all && (!capture(context()) || !context().chatMetadata.sillymemory?.id)) throw new ConnectionError('This chat has no saved memory identity.');
        const target = context(), file = target.getCurrentChatId(), avatar = target.characters[target.characterId]?.avatar;
        const sameChat = () => context().getCurrentChatId() === file && context().characters[context().characterId]?.avatar === avatar;
        const answer = await target.Popup.show.confirm('Delete remote memory', all ? 'Delete ALL owned SillyMemory collections, including every story and branch? Local chats remain.' : 'Delete this chat’s remote memory? Other chats and branches remain. Your local chat is preserved.');
        if (answer !== target.POPUP_RESULT.AFFIRMATIVE) return;
        if (!sameChat()) throw new ConnectionError('Chat changed while the popup was open. Select it and retry deletion.');
        if (all) { state.ready = false; persist(); }
        if (!all && supportsChat(context()) && !savedSnapshot()) await setChatMemory(false);
        invalidate(); clearTimeout(timer);
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
        stoppedRequest = undefined;
        showDelivery('Owned memory deleted. No pending prompt verification.');
        element('inspection').textContent = 'No memory prepared.';
        status('Owned remote memory is no longer accessible for the selected scope. Local chats remain. Prepare/enable memory to rebuild.');
    }
    element('delete').onclick = () => action(() => deleteMemory(true));
    element('delete-chat').onclick = () => action(() => deleteMemory(false));
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
            showDelivery('Generation stopped because the chat or memory settings changed during prompt preparation. Generate again.', { label: 'Reply stopped', kind: 'error' });
            element('inspection').textContent = 'No current memory verified.';
            return;
        }
        const stop = state.stopOnLoss !== false;
        // The host catches listener exceptions; use its cancellation API instead.
        if (finished.lost && stop) ctx.stopGeneration();
        const text = deliverySummary(finished.result, stop);
        const uncertain = !finished.result || [...finished.result.memory, ...finished.result.input].some(m => m.outcome === 'unverified');
        const notice = finished.lost ? { label: stop ? 'Reply stopped' : 'Prompt warning', kind: stop ? 'error' : 'warning' }
            : uncertain ? { label: finished.result ? 'Prompt partly verified' : 'Verification unavailable', kind: 'warning' }
                : { label: finished.result.memory.length ? 'Last prompt verified' : 'No excerpts selected', kind: 'ready' };
        showDelivery(text, notice);
        if (finished.lost && stop) rememberStoppedRequest(text, promptType);
        if (finished.result) {
            const included = finished.result.memory.filter(m => m.outcome === 'included');
            const omitted = finished.result.memory.filter(m => m.outcome !== 'included');
            element('inspection').textContent = `Memory excerpts in final host prompt (${included.length}/${finished.result.memory.length}):\n\n${included.map(m => m.content).join('\n\n') || 'None.'}${omitted.length ? `\n\nNot verified in final prompt:\n\n${omitted.map(m => m.content).join('\n\n')}` : ''}`;
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
            checkpointRevision++;
            if (name !== 'GENERATION_ENDED') { sourceRevision++; stoppedRequest = undefined; }
            if (!['GENERATION_ENDED', 'MESSAGE_RECEIVED'].includes(name)) { showMemoryPreview(); clearTokenUsage(); }
            if (name === 'CHAT_CHANGED' || name === 'CHAT_RENAMED') {
                identityKey = undefined;
                listSequence++; element('checkpoint-list').textContent = 'Refresh to view checkpoints for this story.';
                element('inspection').textContent = 'No memory injected in this chat.';
                showDelivery('No prompt checked in this chat.');
                autoRefreshCheckpoints();
            }
            schedule();
        });
    }
    addEventListener('pagehide', () => { client?.forget(); element('key').value = ''; });
}
context().eventSource.on(context().eventTypes.APP_READY, () => { setTimeout(() => initialize().catch(() => { globalThis.toastr?.error('SillyMemory could not initialize. Check browser storage access and the supported SillyTavern version.'); }), 0); });
