import { createHash } from 'node:crypto';
import { scenarios, samples, nativeSettings, grade, version } from './comparison-fixture.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceView = messages => messages.map(m => ({ text: m.mes, name: m.name, user: m.is_user }));

export async function runComparison({ page, field, openSettings, waitStatus, generate, assert, setStage, bridgeUrl, vectorQueries, startSample = 0, setupOnly = false, result }) {
    Object.assign(result, { version, plannedSamples: samples.length, startSample, setupOnly, nativeSettings, setup: [], rows: [] });
    async function native(enabled) {
        await page.evaluate(enabled => { $('#vectors_enabled_chats').prop('checked', enabled).trigger('input'); }, enabled);
    }
    async function memory(enabled) {
        await openSettings();
        if (await field('enabled').isChecked() !== enabled) await field('enabled').setChecked(enabled);
        if (enabled) await waitStatus('synchronized');
    }
    async function restore(messages) {
        await native(false); await memory(false);
        await page.evaluate(async messages => { const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...messages); await c.saveChat(); await c.reloadCurrentChat(); }, messages);
    }
    async function indexNative() {
        await native(true);
        await page.evaluate(async () => {
            await $('#vectors_vectorize_all').triggerHandler('click');
            const c = SillyTavern.getContext(), v = c.extensionSettings.vectors;
            const response = await fetch('/api/vector/list', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ collectionId: c.getCurrentChatId(), source: v.source, model: v.vllm_model, apiUrl: v.alt_endpoint_url }) });
            if (!response.ok) throw new Error('Native vector list failed');
            const actual = [...new Set(await response.json())].sort();
            const { getStringHash } = await import('/scripts/utils.js');
            const expected = [...new Set(c.chat.map(m => getStringHash(m.mes)))].sort();
            if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Native index differs from current source');
        });
    }
    await field('recent').fill('12'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    await page.evaluate(({ bridgeUrl, config }) => {
        $('#vectors_source').val(config.source).trigger('change');
        $('#vectors_vllm_model').val(config.vllm_model).trigger('input');
        $('#vector_altEndpointUrl_enabled').prop('checked', true).trigger('input');
        $('#vector_altEndpoint_address').val(bridgeUrl).trigger('change');
        for (const key of ['protect', 'query', 'insert', 'message_chunk_size', 'score_threshold', 'depth']) $(`#vectors_${key}`).val(config[key]).trigger('input');
        $('#vectors_template').val(config.template).trigger('input');
        $(`input[name="vectors_position"][value="${config.position}"]`).prop('checked', true).trigger('change');
        const actual = SillyTavern.getContext().extensionSettings.vectors;
        for (const [key, value] of Object.entries(config)) if (actual[key] !== value) throw new Error(`Native setting mismatch: ${key}`);
    }, { bridgeUrl, config: nativeSettings });
    let currentScenario;
    for (const [index, sample] of samples.entries()) {
        if (index < startSample) continue;
        const scenario = scenarios.find(s => s.id === sample.scenario), item = scenario.cases.find(c => c.id === sample.case);
        const name = `compare/${index}/${sample.scenario}/${sample.case}/${sample.repeat}/${sample.mode}`;
        setStage(`${name}: prepare`);
        if (currentScenario !== scenario.id) {
            await restore(scenario.messages);
            const smStart = performance.now(); await memory(true);
            const sillymemoryIndexMs = performance.now() - smStart; await memory(false);
            console.log(`SETUP ${scenario.id}: indexing native Vector Storage`);
            const nativeStart = performance.now(); await indexNative();
            result.setup.push({ scenario: scenario.id, sillymemoryIndexMs, nativeIndexMs: performance.now() - nativeStart, sourceHash: hash(sourceView(scenario.messages)), messages: scenario.messages.length });
            await native(false);
            assert(true, `${scenario.id}: both indexes prepared from the same source`);
            currentScenario = scenario.id;
            if (setupOnly) break;
        }
        await restore(scenario.messages);
        if (sample.mode === 'sillymemory') await memory(true);
        if (sample.mode === 'vectors') await indexNative();
        const before = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ text: m.mes, name: m.name, user: m.is_user })));
        assert(hash(before) === hash(sourceView(scenario.messages)), `${name}: identical source restored`);
        const queryStart = vectorQueries.length;
        const output = await generate(name, 'normal', false, { question: `${item.question} 설명 없이 답만 짧게 쓰세요. 대화에 정보가 없으면 반드시 UNKNOWN이라고 답하세요.`, evaluate: true });
        const state = await page.evaluate(async () => {
            const c = SillyTavern.getContext();
            const vectorPrompt = c.extensionPrompts['3_vectors']?.value || '';
            return { source: c.chat.slice(0, -2).map(m => ({ text: m.mes, name: m.name, user: m.is_user })), vectorPrompt, vectorTokens: vectorPrompt ? await c.getTokenCountAsync(vectorPrompt) : 0 };
        });
        await native(false); await memory(false);
        assert(hash(state.source) === hash(before), `${name}: source preserved`);
        const promptText = output.request.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
        assert(scenario.messages.slice(-11).every(m => promptText.includes(m.mes)), `${name}: recent messages retained`);
        const sourcesPresent = scenario.messages.filter(m => promptText.includes(m.mes)).length;
        if (sample.mode === 'off') assert(sourcesPresent === scenario.messages.length && !promptText.includes('Past conversation excerpt') && !state.vectorPrompt, `${name}: full baseline fits without injection`);
        if (sample.mode === 'sillymemory') assert(!state.vectorPrompt, `${name}: native memory disabled`);
        if (sample.mode === 'vectors') assert(!promptText.includes('Past conversation excerpt') && vectorQueries.length === queryStart + 1 && vectorQueries.at(-1).status === 200, `${name}: native query completed without SillyMemory`);
        const injected = promptText.includes('Past conversation excerpt');
        const inspection = /^(\d+) \/ (\d+) tokens\n\n([\s\S]*)$/.exec(output.inspection);
        const memoryTokens = sample.mode === 'vectors' ? state.vectorTokens : injected && inspection ? Number(inspection[1]) : 0;
        if (sample.mode === 'sillymemory') assert(memoryTokens <= 800 && (!injected || Boolean(inspection && inspection[3].split(/(?=\[Past conversation excerpt:)/).filter(text => text.trim()).every(text => promptText.includes(text.trim())))), `${name}: memory budget respected`);
        const usage = output.request.providerUsage;
        assert(Number.isFinite(usage?.prompt_tokens) && Number.isFinite(usage?.completion_tokens) && Number.isFinite(usage?.prompt_tokens_details?.cached_tokens), `${name}: provider usage including cache available`);
        const row = { index, ...sample, question: item.question, answer: output.last, ...grade(output.last, item), sourceHash: hash(before), promptTokens: usage.prompt_tokens, cachedTokens: usage.prompt_tokens_details.cached_tokens, completionTokens: usage.completion_tokens, generationMs: output.request.generationMs, providerMs: output.request.responseMs, memoryTokens, injected: Boolean(injected || state.vectorPrompt), sourceMessagesPresent: sourcesPresent, nativePrompt: state.vectorPrompt, nativeQuery: sample.mode === 'vectors' ? vectorQueries.at(-1) : undefined };
        result.rows.push(row); output.request.comparison = row;
        console.log(`RESULT ${index + 1}/${samples.length} ${sample.scenario}/${sample.case}/${sample.mode}/r${sample.repeat + 1}: ${row.correct ? 'correct' : 'incorrect'}`);
    }
    await native(false); await memory(false);
    result.complete = result.rows.length === samples.length;
}
