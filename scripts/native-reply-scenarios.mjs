// Pinned host with controlled plain completions; not answer-model quality evidence.
import { openChatMemory } from './settings-panel.mjs';
const hasAdoptedGuidance = text => [
    'build on relevant supported experiences and preferences',
    'Do not merge different events or roles',
    'state what can and cannot be established without inventing facts',
].every(part => text.includes(part))
    && !text.includes('ask one brief clarifying question')
    && !text.includes('request only the additional context needed to help');

export async function runNativeReplyScenarios({ page, field, waitStatus, check, calls, screenshot }) {
    const requests = []; let reply = '', generationToggle;
    const tokenRequests = [];
    const observeTokens = request => { if (new URL(request.url()).pathname === '/api/tokenizers/openai/count') tokenRequests.push(request.postDataJSON()); };
    page.on('request', observeTokens);
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [{ id: 'native-reply-fixture' }] } }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
        const body = route.request().postDataJSON(); requests.push(body);
        if (requests.length === 1) generationToggle = await page.evaluate(async () => {
            const button = document.querySelector('#sillymemory-chat [data-sm-chat="toggle"]');
            const disabled = button.disabled;
            await button.onclick(new MouseEvent('click'));
            return { disabled, enabled: document.querySelector('#sillymemory-chat [data-sm-chat="toggle"]').getAttribute('aria-pressed') === 'true',
                nativeTokens: (await import('/scripts/openai.js')).promptManager.tokenUsage };
        });
        if (body.stream) {
            const chunks = [reply.slice(0, 8), reply.slice(8, 20), reply.slice(20)].filter(Boolean).map(content => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`).join('');
            await route.fulfill({ contentType: 'text/event-stream', body: chunks + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' });
        } else await route.fulfill({ json: { model: body.model, choices: [{ message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] } });
    });
    if (await field('enabled').isChecked()) await field('enabled').uncheck();
    await field('budget').fill('4096'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { custom_url: 'https://example.invalid/v1', custom_model: 'native-reply-fixture', custom_include_body: '', custom_exclude_body: '', custom_prompt_post_processing: '', openai_max_context: 8192, openai_max_tokens: 256, stream_openai: false, names_behavior: 0 });
        c.chat.splice(0, c.chat.length, ...Array.from({ length: 8 }, (_, index) => ({ name: index % 2 ? 'Mira' : 'User', is_user: index % 2 === 0, extra: {}, mes: index === 0 ? 'I visited the city museum on Friday.' : `Native reply source ${index}.` })));
        await c.saveChat(); const script = await import('/script.js'); globalThis.nativeStreamObservations = [];
        c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED, () => {
            const node = document.querySelector(`#chat .mes[mesid="${c.chat.length - 1}"] .mes_text`);
            nativeStreamObservations.push({ generating: script.is_send_press, text: node?.textContent || '', visible: Boolean(node) && getComputedStyle(node).visibility !== 'hidden', hiddenWrapper: Boolean(document.querySelector('.sm-awaiting-reply')) });
        });
    });
    await page.locator('#main_api').selectOption('openai', { force: true }); await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.locator('#api_button_openai').dispatchEvent('click'); await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await field('enabled').check(); await waitStatus('synchronized');
    const generate = async (question, answer, { stream = false, type = 'normal' } = {}) => {
        reply = answer; const before = requests.length;
        const result = await page.evaluate(async ({ question, stream, type }) => {
            const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
            const original = c.chat.map(m => m.mes); oai_settings.stream_openai = stream; document.querySelector('#send_textarea').value = question; await c.generate(type);
            return { text: c.chat.at(-1)?.mes, extra: c.chat.at(-1)?.extra, before: original, source: c.chat.slice(0, type === 'normal' ? -2 : -1).map(m => m.mes) };
        }, { question, stream, type });
        check('native generation makes exactly one plain completion request', requests.length === before + 1);
        check('native reply text is preserved without decoding or status metadata', result.text === answer && !result.extra?.sillymemoryRequest && !result.extra?.sillymemoryPending);
        if (type === 'normal') check('plain generation preserves the original source messages', JSON.stringify(result.before) === JSON.stringify(result.source));
        return result;
    };
    await generate('Where was it?', 'Which visit do you mean?');
    check('native generation disables and revalidates chat memory switching', generationToggle?.disabled && generationToggle.enabled);
    await waitStatus('synchronized');
    check('chat status claims verification only after the final native prompt check', (await page.locator('#sillymemory-chat [data-sm-chat="label"]').innerText()).includes('Last prompt verified'));
    const preview = page.locator('#sillymemory-chat [data-sm-chat="memory"]');
    check('selected memory preview survives native reply completion and background sync', await preview.getAttribute('hidden') === null && (await preview.textContent()).includes('I visited the city museum on Friday.') && (await preview.textContent()).includes('message 1, passage 1'));
    await openChatMemory(page);
    const tokenPanel = page.locator('#sillymemory-chat [data-sm-chat="tokens"]');
    const tokenCompare = page.locator('#sillymemory-chat [data-sm-chat="token-compare"]');
    const tokenReference = page.locator('#sillymemory-chat [data-sm-chat="token-reference"]');
    const numeric = text => Number(text.replace(/[^\d]/g, ''));
    check('prepared input reuses the native host count and memory includes its existing guidance budget', numeric(await tokenPanel.locator('[data-sm-chat="token-input"]').textContent()) === generationToggle.nativeTokens && numeric(await tokenPanel.locator('[data-sm-chat="token-memory"]').textContent()) > 0 && await tokenReference.isHidden());
    const readsBeforeComparison = tokenRequests.length, requestsBeforeComparison = requests.length, remoteBeforeComparison = calls.length;
    await tokenCompare.click(); await tokenReference.waitFor({ state: 'visible' });
    check('dialogue comparison uses at most two local tokenizer reads without generation or memory requests', tokenRequests.length - readsBeforeComparison <= 2 && requests.length === requestsBeforeComparison && calls.length === remoteBeforeComparison && (await tokenReference.textContent()).includes('→') && (await tokenPanel.locator('[data-sm-chat="token-reference-help"]').textContent()).includes('not a native memory-off full-prompt'));
    const completedTokenText = await tokenPanel.textContent();
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), chat = c.chat.map((message, index) => ({ ...message, index }));
        await globalThis.sillymemory_intercept(chat, 8192, () => {}, 'quiet');
    });
    check('quiet auxiliary reads preserve completed reply diagnostics', await tokenPanel.textContent() === completedTokenText && await tokenPanel.isVisible());
    await screenshot?.('token-usage');
    await page.setViewportSize({ width: 390, height: 844 });
    await tokenPanel.locator('strong').evaluate(element => element.scrollIntoView({ block: 'start' }));
    check('token estimates and per-chat toggle wording fit a narrow viewport', await page.locator('#sillymemory-chat').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    await screenshot?.('token-usage-narrow');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await screenshot?.('chat-memory-preview');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot?.('chat-memory-preview-narrow');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await preview.locator('[data-sm-chat="inspect"]').click();
    await field('inspection').waitFor({ state: 'visible' });
    check('full memory action opens the final prompt inspector directly', await field('advanced').evaluate(el => el.open) && (await field('inspection').innerText()).includes('Memory excerpts in final host prompt') && (await field('inspection').innerText()).includes('I visited the city museum on Friday.'));
    check('no schema-support setting or schema request is added', await field('clarification').count() === 0 && !requests.at(-1).response_format && !requests.at(-1).json_schema);
    check('natural memory guidance reaches native generation', requests.at(-1).messages.some(m => m.role === 'system' && hasAdoptedGuidance(m.content)));
    await generate('Check the optional token reference.', 'A diagnostic fixture reply.');
    await waitStatus('synchronized'); await openChatMemory(page);
    const tokenizerPattern = '**/api/tokenizers/openai/count*';
    await page.route(tokenizerPattern, route => route.fulfill({ status: 503, json: { error: true } }));
    await tokenCompare.click();
    await page.waitForFunction(() => document.querySelector('#sillymemory-chat [data-sm-chat="token-reference"]').textContent.includes('unavailable'));
    check('a diagnostic tokenizer failure preserves enabled memory and the native reply', await field('enabled').isChecked() && await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes === 'A diagnostic fixture reply.') && !(await page.locator('#sillymemory-chat [data-sm-chat="label"]').textContent()).includes('Reply stopped'));
    await page.unroute(tokenizerPattern);
    let releaseTokens, enteredTokens, settledTokens, settled = 0;
    const heldTokens = new Promise(resolve => { releaseTokens = resolve; });
    const reachedTokens = new Promise(resolve => { enteredTokens = resolve; });
    const completedTokens = new Promise(resolve => { settledTokens = resolve; });
    await page.route(tokenizerPattern, async route => {
        enteredTokens(); await heldTokens;
        await route.fulfill({ response: await route.fetch() });
        if (++settled === 2) settledTokens();
    });
    await tokenCompare.click(); await reachedTokens;
    try { await page.locator('#sillymemory-chat [data-sm-chat="toggle"]').click(); }
    finally { releaseTokens(); }
    await completedTokens;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    check('late comparison results cannot restore diagnostics after memory is disabled', await tokenPanel.getAttribute('hidden') !== null && !await field('enabled').isChecked());
    await page.unroute(tokenizerPattern);
    await page.locator('#sillymemory-chat [data-sm-chat="toggle"]').click(); await waitStatus('synchronized');
    await generate('My Friday visit.', 'The city museum.', { stream: true });
    const query = calls.findLast(c => c.body?.query?.bayesian)?.body.query.bayesian[0].knn.queryText;
    check('follow-up search uses only the latest input', query === 'User: My Friday visit.');
    const observations = await page.evaluate(() => nativeStreamObservations);
    check('stream text is visible while generation is active without a hidden wrapper', observations.some(x => x.generating && x.visible && x.text) && observations.every(x => !x.hiddenWrapper));
    await generate('What is my account number?', 'The available conversation does not establish your account number.');
    await generate('Forget that. What is 7 times 8?', '56');
    check('topic changes search only the current input', calls.findLast(c => c.body?.query?.bayesian)?.body.query.bayesian[0].knn.queryText === 'User: Forget that. What is 7 times 8?');
    await generate('Return this JSON literally.', '{"reply":"This is literal JSON requested by the user."}');
    check('legitimate JSON remains native authored text', await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes.startsWith('{')));
    await generate('', 'A replacement native reply.', { type: 'regenerate', stream: true });
    await page.evaluate(async () => { await SillyTavern.getContext().saveChat(); await SillyTavern.getContext().reloadCurrentChat(); });
    check('reloading a chat does not restore a previous in-memory selection', await preview.getAttribute('hidden') !== null && await preview.locator('li').count() === 0);
    check('reloading a chat clears prior token diagnostics', await tokenPanel.getAttribute('hidden') !== null);
    check('reload preserves plain selected replies without recovery markers', await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes === 'A replacement native reply.' && SillyTavern.getContext().chat.every(m => !m.extra?.sillymemoryRequest && !m.extra?.sillymemoryPending)));
    const previousSwipe = await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes);
    const requestsBeforeSwipe = requests.length; reply = 'A selected native swipe.';
    // Use the same native action as the swipe-right UI, including selected index
    // advancement. Generate('swipe') alone is not the complete UI transition.
    await page.evaluate(async () => { await (await import('/script.js')).swipe_right(); });
    await page.waitForFunction(() => SillyTavern.getContext().chat.at(-1).mes === 'A selected native swipe.' && !document.body.dataset.generating);
    check('native swipe-right advances selection and preserves the previous variant', requests.length === requestsBeforeSwipe + 1 && await page.evaluate(previous => {
        const m = SillyTavern.getContext().chat.at(-1);
        return m.swipe_id > 0 && m.swipes[0] === previous && m.swipes[m.swipe_id] === m.mes;
    }, previousSwipe));
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.saveChat(); await c.reloadCurrentChat(); });
    check('reload keeps the selected native swipe and its source text aligned', await page.evaluate(() => {
        const m = SillyTavern.getContext().chat.at(-1);
        return m.mes === 'A selected native swipe.' && m.swipes[m.swipe_id] === m.mes;
    }));
    const completedBeforeFailure = requests.length;
    const sourceBeforeFailure = await page.evaluate(() => SillyTavern.getContext().chat.map(m => m.mes));
    await page.route('**/projects/synthetic/collections/*/query', route => route.fulfill({ status: 503, json: { message: 'Service unavailable' } }));
    await page.evaluate(async () => { document.querySelector('#send_textarea').value = 'A transient search failure.'; await SillyTavern.getContext().generate('normal'); });
    await waitStatus('synchronized');
    check('native generation aborts before dispatch on search failure', requests.length === completedBeforeFailure);
    check('a stopped native reply has no stale selected-memory preview', await preview.getAttribute('hidden') !== null && await preview.locator('li').count() === 0);
    const failureGuidance = await field('delivery').textContent();
    check('generation failure stays visible with the correct recovery action after background synchronization', failureGuidance.includes('Generation stopped: memory preparation failed.') && failureGuidance.includes('HTTP 503') && failureGuidance.includes('regenerate to retry this request') && !failureGuidance.includes('Sync this chat'));
    const chatStatus = page.locator('#sillymemory-chat');
    check('chat status retains a stopped reply after background synchronization completes', (await chatStatus.locator('[data-sm-chat="label"]').innerText()).includes('Reply stopped') && (await chatStatus.locator('[data-sm-chat="status"]').innerText()).includes('HTTP 503'));
    check('failed native generation preserves source and the pending user input', await page.evaluate(source => {
        const chat = SillyTavern.getContext().chat;
        return chat.at(-1).is_user && chat.at(-1).mes === 'A transient search failure.' && JSON.stringify(chat.slice(0, -1).map(m => m.mes)) === JSON.stringify(source);
    }, sourceBeforeFailure));
    await page.unroute('**/projects/synthetic/collections/*/query');
    await openChatMemory(page);
    const retry = chatStatus.locator('[data-sm-chat="retry"]');
    await retry.waitFor({ state: 'visible' });
    check('stopped reply guidance is shown once in the chat panel', !await chatStatus.locator('[data-sm-chat="delivery"]').isVisible());
    await screenshot?.('chat-memory-recovery');
    // A queued click must revalidate literal source even if no host edit event
    // was emitted. Restoring the untouched fixture permits the real UI retry.
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), pending = c.chat.at(-1), text = pending.mes;
        pending.mes = 'Changed pending request.';
        try { await document.querySelector('#sillymemory-chat [data-sm-chat="retry"]').onclick(new MouseEvent('click')); }
        finally { pending.mes = text; }
    });
    check('a stale retry action never generates against changed source', requests.length === completedBeforeFailure);
    reply = 'Recovered native reply.';
    await retry.click();
    await page.waitForFunction(() => SillyTavern.getContext().chat.at(-1)?.mes === 'Recovered native reply.' && !document.body.dataset.generating);
    check('one explicit chat retry uses native regeneration without duplicating the pending user turn', requests.length === completedBeforeFailure + 1 && await page.evaluate(source => {
        const chat = SillyTavern.getContext().chat;
        return chat.at(-2).is_user && chat.at(-2).mes === 'A transient search failure.' && JSON.stringify(chat.slice(0, -2).map(m => m.mes)) === JSON.stringify(source);
    }, sourceBeforeFailure));
    check('a successful retry removes the stopped-request action', !await retry.isVisible());
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(c.chat.length - 1); await c.deleteMessage(c.chat.length - 1); });
    await chatStatus.locator('[data-sm-chat="settings"]').click();
    await field('next-step').waitFor({ state: 'visible' });
    await page.evaluate(async () => { const { oai_settings } = await import('/scripts/openai.js'); oai_settings.custom_include_body = 'response_format:\n  type: json_object'; });
    await generate('Use my existing native response format.', '{"answer":"User-controlled format."}');
    check('user-selected response formats survive without a schema conflict', requests.at(-1).custom_include_body?.includes('type: json_object') && !JSON.stringify(requests.at(-1)).includes('sillymemory_reply'));
    await page.evaluate(async () => { const { oai_settings } = await import('/scripts/openai.js'); oai_settings.custom_include_body = ''; });
    await openChatMemory(page);
    const toggle = page.locator('#sillymemory-chat [data-sm-chat="toggle"]');
    await toggle.click(); const reads = calls.filter(c => c.body?.query?.bayesian).length;
    check('chat deactivation exposes Turn memory on in the same place and persists off', !await field('enabled').isChecked() && (await toggle.textContent()) === 'Turn memory on in this chat' && await page.evaluate(() => SillyTavern.getContext().chatMetadata.sillymemoryEnabled === false) && await chatStatus.locator('[data-sm-chat="progress"]').isHidden() && (await chatStatus.locator('[data-sm-chat="delivery"]').textContent()).includes('Memory disabled for this chat'));
    await screenshot?.('chat-memory-off');
    check('turning memory off removes the previous selected content', await preview.getAttribute('hidden') !== null && await preview.locator('li').count() === 0);
    await generate('A native request with memory disabled.', 'A normal native response.');
    check('disabled memory uses native output without retrieval or rewriting', calls.filter(c => c.body?.query?.bayesian).length === reads && !requests.at(-1).response_format);
    check('native memory-off replies still expose their host input estimate with zero prepared memory', numeric(await tokenPanel.locator('[data-sm-chat="token-input"]').textContent()) > 0 && (await tokenPanel.locator('[data-sm-chat="token-memory"]').textContent()).includes('~0 tokens · memory off') && await tokenCompare.isHidden());
    await toggle.click(); await waitStatus('synchronized');
    check('chat reactivation restores memory without opening settings or retaining an off notice', await field('enabled').isChecked() && (await toggle.textContent()) === 'Turn memory off in this chat' && !(await page.locator('#sillymemory-chat [data-sm-chat="delivery"]').textContent()).includes('Memory disabled') && await page.evaluate(() => !document.querySelector('#extensions-settings-button .drawer-content').classList.contains('openDrawer')));
    await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click(); await field('next-step').waitFor({ state: 'visible' });
    // Native text completions do not require a chat reply schema. Their flattened
    // prompt cannot be role-verified by the current final-delivery checker.
    const textRequests = [];
    await page.route('**/api/backends/text-completions/status', route => route.fulfill({ json: { result: 'native-text-fixture' } }));
    await page.route('**/api/backends/text-completions/generate', route => {
        textRequests.push(route.request().postDataJSON());
        return route.fulfill({ json: { choices: [{ text: 'A plain text completion.' }] } });
    });
    await page.locator('#main_api').selectOption('textgenerationwebui', { force: true });
    await page.evaluate(async () => {
        const { textgenerationwebui_settings: settings } = await import('/scripts/textgen-settings.js');
        Object.assign(settings, { type: 'ooba', streaming: false, json_schema: null });
        settings.server_urls.ooba = 'https://example.invalid';
        document.querySelector('#textgenerationwebui_api_url_text').value = 'https://example.invalid';
    });
    await page.locator('#api_button_textgenerationwebui').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await field('enabled').check(); await waitStatus('synchronized');
    const textResult = await page.evaluate(async () => {
        const c = SillyTavern.getContext(), before = c.chat.map(m => m.mes);
        document.querySelector('#send_textarea').value = 'Use ordinary text completion.';
        await c.generate('normal');
        return { answer: c.chat.at(-1).mes, before, source: c.chat.slice(0, -2).map(m => m.mes) };
    });
    check('text completion dispatches without a required reply schema', textRequests.length === 1 && !textRequests[0].json_schema && textResult.answer === 'A plain text completion.');
    check('text completion contains natural guidance and preserves source', hasAdoptedGuidance(textRequests[0].prompt) && JSON.stringify(textResult.before) === JSON.stringify(textResult.source));
    check('flattened text prompt verification is explicitly unavailable', (await field('delivery').textContent()).includes('verification unavailable'));
    check('unsupported text completion does not fabricate a host input count or offer remote token comparisons', (await tokenPanel.locator('[data-sm-chat="token-input"]').textContent()) === 'Unavailable' && await tokenCompare.isHidden());
    const previousBudget = await field('budget').inputValue();
    await field('budget').fill('768'); await field('budget').dispatchEvent('change');
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chat.splice(0, c.chat.length, ...Array.from({ length: 20 }, (_, i) => ({ name: i % 2 ? 'Mira' : 'User', is_user: i % 2 === 0, extra: {},
            mes: Array.from({ length: 60 }, (_, j) => `Archive ${i} detail ${j}.`).join(' ') })));
        await c.saveChat(); await c.reloadCurrentChat();
    });
    await waitStatus('synchronized');
    await generate('Recall a fact from the older archive.', 'A native long-history fixture reply.');
    await waitStatus('synchronized'); await openChatMemory(page);
    await tokenCompare.click(); await tokenReference.waitFor({ state: 'visible' });
    check('a long-history reference shows measured text reduction without claiming native full-prompt savings', (await tokenReference.textContent()).includes('less)') && (await tokenPanel.locator('[data-sm-chat="token-reference-help"]').textContent()).includes('before host formatting/trimming'));
    const afterLongComparison = tokenRequests.length;
    await tokenCompare.evaluate(button => button.onclick(new MouseEvent('click')));
    check('a completed reference cannot start duplicate diagnostic counting', tokenRequests.length === afterLongComparison && await tokenCompare.isHidden());
    await tokenPanel.locator('strong').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await screenshot?.('token-usage-long');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot?.('token-usage-long-narrow');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('#sillymemory-chat [data-sm-chat="settings"]').click(); await field('next-step').waitFor({ state: 'visible' });
    // Commit the numeric edit through blur before cleanup clicks; an explicit
    // change event alone leaves another native change pending on the next click.
    await field('budget').fill(previousBudget); await field('budget').press('Tab'); await waitStatus('synchronized');
    await page.unroute('**/api/backends/text-completions/generate'); await page.unroute('**/api/backends/text-completions/status');
    await page.unroute('**/api/backends/chat-completions/generate'); await page.unroute('**/api/backends/chat-completions/status');
    page.off('request', observeTokens);
    return { generations: requests.length, requests, textRequests, streamObservations: observations };
}
