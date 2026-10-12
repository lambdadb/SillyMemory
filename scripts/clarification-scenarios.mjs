// Native generation/UI with deterministic completion responses; no paid provider.
import assert from 'node:assert/strict';
export async function runClarificationScenarios({ page, field, waitStatus, check, calls }) {
    const replies = [], requests = [];
    await page.route('**/api/backends/chat-completions/status', route => route.fulfill({ json: { data: [{ id: 'clarification-fixture' }] } }));
    await page.route('**/api/backends/chat-completions/generate', async route => {
        const body = route.request().postDataJSON(); requests.push(body);
        const next = replies.shift();
        assert(next, 'Unexpected generation');
        assert.equal(body.json_schema?.name, 'sillymemory_reply');
        const content = next.raw ?? JSON.stringify({ reply: next.reply, request_status: next.status });
        if (body.stream) {
            const parts = [content.slice(0, 12), content.slice(12)];
            const data = parts.map(content => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`).join('');
            await route.fulfill({ contentType: 'text/event-stream', body: `${data}data: [DONE]\n\n` });
        } else await route.fulfill({ json: { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] } });
    });
    await field('enabled').uncheck();
    await field('clarification').check(); await field('budget').fill('4096'); await field('budget').dispatchEvent('change');
    await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { custom_url: 'https://example.invalid/v1', custom_model: 'clarification-fixture', custom_include_body: '', custom_exclude_body: '',
            openai_max_context: 32768, openai_max_tokens: 1024, stream_openai: false, function_calling: false, n: 1, names_behavior: 0, send_if_empty: '' });
        c.chat.splice(0, c.chat.length, { mes: 'I visited the city museum on Friday.', name: 'User', is_user: true, extra: {} }, { mes: 'Thanks for telling me.', name: 'Mira', is_user: false, extra: {} });
        await c.saveChat(); await c.reloadCurrentChat();
        globalThis.clarificationStreamChecks = [];
        c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED, () => {
            const id = SillyTavern.getContext().chat.length - 1;
            const node = document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
            clarificationStreamChecks.push(Boolean(node) && getComputedStyle(node).visibility === 'hidden');
        });
    });
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await field('enabled').check(); await waitStatus('synchronized');
    async function generate(question, response, stream = false, type = 'normal') {
        replies.push(response);
        const before = requests.length;
        await page.evaluate(async ({ question, stream, type, stop }) => {
            const { oai_settings } = await import('/scripts/openai.js'); oai_settings.stream_openai = stream;
            const c = SillyTavern.getContext();
            if (stop) c.eventSource.once(c.eventTypes.STREAM_TOKEN_RECEIVED, () => c.stopGeneration());
            document.querySelector('#send_textarea').value = question;
            try { await c.generate(type); } catch (error) { if (!stop || !String(error).includes('Clicked stop button')) throw error; }
        }, { question, stream, type, stop: Boolean(response.stop) });
        if (response.stop) await page.waitForFunction(() => SillyTavern.getContext().chat.at(-1).extra?.sillymemoryRequest?.status === 'unknown');
        assert.equal(requests.length, before + 1);
        return page.evaluate(() => structuredClone(SillyTavern.getContext().chat.at(-1)));
    }
    const opening = await generate('Where was it?', { reply: 'Which visit do you mean?', status: 'needs_clarification' });
    check('native clarification opens on intent ambiguity and saves plain reply only', opening.extra.sillymemoryRequest.status === 'needs_clarification' && opening.mes === 'Which visit do you mean?');
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.saveChat(); await (await import('/script.js')).saveSettings(); });
    const savedChat = await page.evaluate(() => { const c = SillyTavern.getContext(); return { avatar: c.characters[c.characterId].avatar, file: c.getCurrentChatId() }; });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.evaluate(async saved => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.avatar === saved.avatar)); await c.openCharacterChat(saved.file); }, savedChat);
    await page.waitForFunction(() => SillyTavern.getContext().chat.some(m => m.extra?.sillymemoryRequest));
    if (!await field('key').isVisible()) {
        if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
        if (!await field('key').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    }
    check('pending request survives page reload while the API key does not', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    await field('key').fill('synthetic-session-key'); await field('connect').click();
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await field('enabled').check(); await waitStatus('synchronized');
    await page.evaluate(() => {
        globalThis.clarificationStreamChecks = [];
        const c = SillyTavern.getContext();
        c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED, () => {
            const node = document.querySelector(`#chat .mes[mesid="${c.chat.length - 1}"] .mes_text`);
            clarificationStreamChecks.push(Boolean(node) && getComputedStyle(node).visibility === 'hidden');
        });
    });
    const answer = await generate('My Friday visit.', { reply: 'The city museum. Would you like directions?', status: 'answered' }, true);
    const query = calls.findLast(c => c.body.query?.bayesian)?.body.query.bayesian[0].knn.queryText;
    check('native reloaded pending dialogue reaches retrieval in role order', query === 'User: Where was it?\n\nAssistant: Which visit do you mean?\n\nUser: My Friday visit.');
    check('native retrieval excludes already-retained pending turns in both search legs', calls.findLast(c => c.body.query?.bayesian)?.body.query.bayesian[0].knn.filter.queryString.query.endsWith(' AND message:[0 TO 1]'));
    const request = requests.at(-1);
    check('native generation retains both user inputs and the assistant clarification', ['Where was it?', 'Which visit do you mean?', 'My Friday visit.'].every(text => request.messages.some(m => m.content === text)));
    check('streaming wrapper stays hidden and final reply/status are separated', await page.evaluate(() => clarificationStreamChecks.length > 0 && clarificationStreamChecks.every(Boolean)) && answer.mes === 'The city museum. Would you like directions?' && answer.extra.sillymemoryRequest.status === 'answered' && !await page.locator('.sm-awaiting-reply').count());
    await generate('What is my account number?', { reply: 'Available evidence does not establish your account number.', status: 'insufficient_evidence' });
    check('terminal answer clears retrieval accumulation', calls.findLast(c => c.body.query?.bayesian)?.body.query.bayesian[0].knn.queryText === 'What is my account number?');
    const missing = await page.evaluate(() => SillyTavern.getContext().chat.at(-1).extra.sillymemoryRequest);
    check('insufficient evidence remains terminal rather than opening clarification', missing.root === null && missing.status === 'insufficient_evidence');
    await generate('Which one was it?', { reply: 'Which object do you mean?', status: 'needs_clarification' });
    const incomplete = await generate('The compass.', { raw: '{"reply":"unfinished' }, true);
    check('incomplete stream cannot enter indexed dialogue or terminate pending state', incomplete.extra.sillymemoryRequest.status === 'unknown' && incomplete.extra.sillymemoryRequest.incomplete && Number.isInteger(incomplete.extra.sillymemoryRequest.root) && !incomplete.mes.includes('"reply"'));
    const stopped = await generate('Try that again.', { reply: 'An interrupted answer.', status: 'answered', stop: true }, true);
    check('native stop preserves unknown pending state and removes the streaming wrapper', stopped.extra.sillymemoryRequest.status === 'unknown' && Number.isInteger(stopped.extra.sillymemoryRequest.root) && !stopped.mes.includes('"reply"') && !await page.locator('.sm-awaiting-reply').count());
    await generate('The blue one.', { reply: 'The city museum.', status: 'answered' });
    const repaired = calls.findLast(c => c.body.query?.bayesian)?.body.query.bayesian[0].knn.queryText;
    check('retry keeps unresolved input span while excluding incomplete protocol output', repaired.includes('Which one was it?') && repaired.includes('Which object do you mean?') && repaired.includes('The compass.') && !repaired.includes('unfinished'));
    check('pending generation excludes incomplete protocol placeholders from the actual request', requests.at(-1).messages.every(m => !String(m.content).includes('[SillyMemory: no complete reply was received.')));
    // Replace the last answer through the native regenerate path.
    const regenerated = await generate('', { reply: 'I cannot establish that location.', status: 'insufficient_evidence' }, false, 'regenerate');
    check('native regeneration binds state to the replacement answer', regenerated.mes === 'I cannot establish that location.' && regenerated.extra.sillymemoryRequest.root === null);
    await generate('Where was that?', { reply: 'Which event?', status: 'needs_clarification' });
    check('terminal closure does not retain old protocol placeholders in later requests', requests.at(-1).messages.every(m => !String(m.content).includes('[SillyMemory: no complete reply was received.')));
    replies.push({ reply: 'The city museum.', status: 'answered' });
    await page.evaluate(async () => { await SillyTavern.getContext().swipe.right(); });
    await page.waitForFunction(() => SillyTavern.getContext().chat.at(-1)?.extra?.sillymemoryRequest?.status === 'answered');
    check('native new swipe closes only its own pending state', await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { pendingRequestStart } = await import('/scripts/extensions/third-party/sillymemory/src/clarification.js');
        return await pendingRequestStart(c.chat, c.chat.length) === c.chat.length;
    }));
    await page.evaluate(async () => { await SillyTavern.getContext().swipe.left(); });
    check('native swipe selection restores its own clarification state', await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { pendingRequestStart } = await import('/scripts/extensions/third-party/sillymemory/src/clarification.js');
        return c.chat.at(-1).extra.sillymemoryRequest.status === 'needs_clarification' && await pendingRequestStart(c.chat, c.chat.length) === c.chat.length - 2;
    }));
    await field('enabled').uncheck();
    const pendingFile = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); await c.saveChat();
        await (await import('/script.js')).saveChat({ chatName: 'Clarification isolated fixture' });
        await c.openCharacterChat('Clarification isolated fixture');
        c.chat.splice(0, c.chat.length, { mes: 'Unrelated conversation.', is_user: true, name: 'User' });
        await c.saveChat(); await c.reloadCurrentChat();
    });
    check('a different native chat cannot inherit pending state from the previous chat', await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { pendingRequestStart } = await import('/scripts/extensions/third-party/sillymemory/src/clarification.js');
        return await pendingRequestStart(c.chat, c.chat.length) === c.chat.length;
    }));
    await page.evaluate(async file => { await SillyTavern.getContext().openCharacterChat(file); }, pendingFile);
    check('returning to the original native chat recovers its pending state', await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { pendingRequestStart } = await import('/scripts/extensions/third-party/sillymemory/src/clarification.js');
        return await pendingRequestStart(c.chat, c.chat.length) === c.chat.length - 2;
    }));
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.chat.at(-2).mes = 'Edited request.';
        await c.eventSource.emit(c.eventTypes.MESSAGE_EDITED, c.chat.length - 2); await c.saveChat();
    });
    check('native source edit invalidates a saved clarification boundary', await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { pendingRequestStart } = await import('/scripts/extensions/third-party/sillymemory/src/clarification.js');
        return await pendingRequestStart(c.chat, c.chat.length) === c.chat.length;
    }));
    await field('enabled').check(); await waitStatus('synchronized');
    const beforeConflict = requests.length;
    await page.evaluate(async () => {
        const { oai_settings } = await import('/scripts/openai.js');
        oai_settings.custom_include_body = 'response_format:\n  type: json_object';
        document.querySelector('#send_textarea').value = 'A new request.';
        try { await SillyTavern.getContext().generate('normal'); } catch (error) { if (!String(error).includes('Clicked stop button')) throw error; }
    });
    check('existing custom response schema blocks dispatch rather than being overwritten', requests.length === beforeConflict && await page.evaluate(async () => (await import('/scripts/openai.js')).oai_settings.custom_include_body.includes('json_object')));
    for (const [include, exclude] of [['- response_format:\n    type: json_object', ''], ['', 'json_schema'], ['', 'messages: true']]) {
        await page.evaluate(async ({ include, exclude }) => {
            const { oai_settings } = await import('/scripts/openai.js');
            oai_settings.custom_include_body = include; oai_settings.custom_exclude_body = exclude;
            document.querySelector('#send_textarea').value = 'A new request.';
            try { await SillyTavern.getContext().generate('normal'); } catch (error) { if (!String(error).includes('Clicked stop button')) throw error; }
        }, { include, exclude });
        check('native YAML protocol override is rejected before dispatch', requests.length === beforeConflict);
    }
    await page.evaluate(async () => { const { oai_settings } = await import('/scripts/openai.js'); oai_settings.custom_include_body = ''; oai_settings.custom_exclude_body = ''; });
    await field('enabled').uncheck();
    await page.unroute('**/api/backends/chat-completions/generate'); await page.unroute('**/api/backends/chat-completions/status');
    return { generations: requests.length, requests, streamChecks: await page.evaluate(() => clarificationStreamChecks) };
}
