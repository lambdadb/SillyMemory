// Pinned host with controlled plain completions; not answer-model quality evidence.
export async function runNativeReplyScenarios({ page, field, waitStatus, check, calls }) {
    const requests = []; let reply = '';
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [{ id: 'native-reply-fixture' }] } }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
        const body = route.request().postDataJSON(); requests.push(body);
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
    check('no schema-support setting or schema request is added', await field('clarification').count() === 0 && !requests.at(-1).response_format && !requests.at(-1).json_schema);
    check('natural memory guidance reaches native generation', requests.at(-1).messages.some(m => m.role === 'system' && m.content.includes('ask one brief clarifying question') && m.content.includes('state what can and cannot be established')));
    await generate('My Friday visit.', 'The city museum.', { stream: true });
    const query = calls.findLast(c => c.body?.query?.bayesian)?.body.query.bayesian[0].knn.queryText;
    check('follow-up search uses only the previous natural reply and latest input', query === 'Assistant: Which visit do you mean?\n\nUser: My Friday visit.');
    const observations = await page.evaluate(() => nativeStreamObservations);
    check('stream text is visible while generation is active without a hidden wrapper', observations.some(x => x.generating && x.visible && x.text) && observations.every(x => !x.hiddenWrapper));
    await generate('What is my account number?', 'The available conversation does not establish your account number.');
    await generate('Forget that. What is 7 times 8?', '56');
    check('topic changes use query=2 without a pending root', calls.findLast(c => c.body?.query?.bayesian)?.body.query.bayesian[0].knn.queryText === 'Assistant: The available conversation does not establish your account number.\n\nUser: Forget that. What is 7 times 8?');
    await generate('Return this JSON literally.', '{"reply":"This is literal JSON requested by the user."}');
    check('legitimate JSON remains native authored text', await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes.startsWith('{')));
    await generate('', 'A replacement native reply.', { type: 'regenerate', stream: true });
    await page.evaluate(async () => { await SillyTavern.getContext().saveChat(); await SillyTavern.getContext().reloadCurrentChat(); });
    check('reload preserves plain selected replies without recovery markers', await page.evaluate(() => SillyTavern.getContext().chat.at(-1).mes === 'A replacement native reply.' && SillyTavern.getContext().chat.every(m => !m.extra?.sillymemoryRequest && !m.extra?.sillymemoryPending)));
    await page.evaluate(async () => { const { oai_settings } = await import('/scripts/openai.js'); oai_settings.custom_include_body = 'response_format:\n  type: json_object'; });
    await generate('Use my existing native response format.', '{"answer":"User-controlled format."}');
    check('user-selected response formats survive without a schema conflict', requests.at(-1).custom_include_body?.includes('type: json_object') && !JSON.stringify(requests.at(-1)).includes('sillymemory_reply'));
    await page.evaluate(async () => { const { oai_settings } = await import('/scripts/openai.js'); oai_settings.custom_include_body = ''; });
    await field('enabled').uncheck(); const reads = calls.filter(c => c.body?.query?.bayesian).length;
    await generate('A native request with memory disabled.', 'A normal native response.');
    check('disabled memory uses native output without retrieval or rewriting', calls.filter(c => c.body?.query?.bayesian).length === reads && !requests.at(-1).response_format);
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
    check('text completion contains natural guidance and preserves source', textRequests[0].prompt.includes('ask one brief clarifying question') && JSON.stringify(textResult.before) === JSON.stringify(textResult.source));
    check('flattened text prompt verification is explicitly unavailable', (await field('delivery').textContent()).includes('verification unavailable'));
    await page.unroute('**/api/backends/text-completions/generate'); await page.unroute('**/api/backends/text-completions/status');
    await page.unroute('**/api/backends/chat-completions/generate'); await page.unroute('**/api/backends/chat-completions/status');
    return { generations: requests.length, requests, textRequests, streamObservations: observations };
}
