// Real-host adapter. Oracle data stays in Node, outside the browser/model input.
import assert from 'node:assert/strict';
import { runActorAblation } from './actor-ablation-eval.mjs';
import { actorPromptEvidence } from './actor-perspective.mjs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hash, fixtureFiles, loadNaturalFixture, naturalCases, naturalSchedule } from './natural-dialogue.mjs';
const sourceView = messages => messages.map(m => ({ text: m.mes, user: m.is_user, name: m.name }));
export async function verifyNaturalPlan(filename) {
    assert(filename, 'SM_NATURAL_PLAN must identify the pre-execution frozen plan');
    const bytes = await readFile(filename), plan = JSON.parse(bytes);
    const fixture = loadNaturalFixture(plan.version);
    assert.equal(plan.audit.fixtureHash, hash(fixture), 'Frozen fixture changed');
    assert.deepEqual(plan.settings, fixture.settings); assert.deepEqual(plan.generation, fixture.generation);
    assert.deepEqual(plan.cases, naturalCases(fixture)); assert.deepEqual(plan.schedule, naturalSchedule(fixture));
    assert.equal(plan.results, null);
    for (const file of ['index.js', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/status.js', 'scripts/natural-dialogue.mjs', ...fixtureFiles(plan.version)]) {
        assert.equal(createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex'), plan.sourceSha256[file], `Frozen source changed: ${file}`);
    }
    return { plan, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function runNaturalDialogue({ page, field, openSettings, waitStatus, generate, assert: check, setStage, result, frozen, checkpoint }) {
    if (['actor-ablation-v1', 'actor-candidate-v1'].includes(frozen.plan.version)) return runActorAblation({ page, field, openSettings, generate, assert: check, setStage, result, frozen, checkpoint });
    const { plan } = frozen, cases = new Map(plan.cases.map(item => [item.id, item]));
    Object.assign(result, { version: plan.version, planSha256: frozen.sha256, fixtureHash: plan.audit.fixtureHash, settings: plan.settings, generation: plan.generation, plannedSamples: plan.schedule.length, rows: [], preparation: [], complete: false });
    async function enable(value) {
        await openSettings();
        if (await field('enabled').isChecked() !== value) await field('enabled').setChecked(value);
        if (value) await waitStatus('synchronized');
    }
    await field('recent').fill(String(plan.settings.recent)); await field('recent').dispatchEvent('change');
    await field('budget').fill(String(plan.settings.budget)); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const { MemoryEngine, documents } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const retrieve = MemoryEngine.prototype.retrieve, search = LambdaClient.prototype.search;
        MemoryEngine.prototype.retrieve = async function (...args) {
            const started = performance.now(), expected = await documents(args[0], this.owner, args[1]);
            const selected = await retrieve.apply(this, args);
            globalThis.naturalRetrieval = { elapsedMs: performance.now() - started, expected: expected.docs, selected, snapshot: args[0], hostTokens: selected?.text ? await SillyTavern.getContext().getTokenCountAsync(selected.text) : 0 };
            return selected;
        };
        LambdaClient.prototype.search = async function (...args) {
            const started = performance.now();
            try {
                const hits = await search.apply(this, args);
                globalThis.naturalQueries.push({ query: args[3], elapsedMs: performance.now() - started, hits }); return hits;
            } catch (error) { globalThis.naturalQueries.push({ query: args[3], elapsedMs: performance.now() - started, failed: true }); throw error; }
        };
    });
    const chatIds = new Set();
    for (const [index, sample] of plan.schedule.entries()) {
        const item = cases.get(sample.case), { source, question } = item.input;
        setStage(`natural/${sample.id}/prepare`); await enable(false);
        const chatId = `natural-${index}-${sample.id.replaceAll('/', '-')}`;
        await page.evaluate(async ({ source, chatId }) => {
            const c = SillyTavern.getContext(); await c.openCharacterChat(chatId);
            c.chat.splice(0, c.chat.length, ...source); await c.saveChat(); await c.reloadCurrentChat();
        }, { source, chatId });
        const before = await page.evaluate(() => { const c = SillyTavern.getContext(); return { id: c.getCurrentChatId(), source: c.chat.map(m => ({ text: m.mes, user: m.is_user, name: m.name })) }; });
        check(!chatIds.has(before.id) && before.id === chatId, `${sample.id}: isolated chat identity`); chatIds.add(before.id);
        const sourceHash = hash(sourceView(source)); check(hash(before.source) === sourceHash, `${sample.id}: exact source restored`);
        const sourceTokens = await page.evaluate(async () => { const c = SillyTavern.getContext(); return c.getTokenCountAsync(c.chat.map(m => m.mes).join('\n')); });
        if (plan.version === 'long-dialogue-v1') check(sourceTokens > plan.settings.context, `${sample.id}: source text alone exceeds frozen host context`);
        const syncStarted = performance.now(); await enable(sample.mode === 'on');
        result.preparation.push({ id: sample.id, sourceHash, sourceTokens, syncMs: performance.now() - syncStarted });
        await page.evaluate(() => { globalThis.naturalQueries = []; globalThis.naturalRetrieval = null; });
        const output = await generate(`natural/${sample.id}`, 'normal', false, { question, evaluate: true });
        const after = await page.evaluate(length => SillyTavern.getContext().chat.slice(0, length).map(m => ({ text: m.mes, user: m.is_user, name: m.name })), source.length);
        check(hash(after) === sourceHash && output.chatLength === source.length + 2, `${sample.id}: original source preserved`);
        const telemetry = await page.evaluate(() => ({ retrieval: globalThis.naturalRetrieval, queries: globalThis.naturalQueries }));
        const promptText = output.request.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
        const selected = telemetry.retrieval?.selected, passages = selected?.passages || [], injected = Boolean(selected?.text);
        if (sample.mode === 'off') check(!telemetry.retrieval && !promptText.includes('Past conversation excerpt'), `${sample.id}: memory disabled`);
        else {
            check(Boolean(telemetry.retrieval && selected), `${sample.id}: retrieval completed without fallback`);
            const expected = new Map(telemetry.retrieval.expected.map(doc => [doc.id, doc]));
            check(passages.every(doc => JSON.stringify(doc) === JSON.stringify(expected.get(doc.id))), `${sample.id}: selected IDs and text match current local documents`);
            check(selected.tokens === telemetry.retrieval.hostTokens && selected.tokens <= plan.settings.budget, `${sample.id}: exact host-tokenized memory budget`);
            check(!injected || selected.messages.every(excerpt => output.request.messages.some(m => m.role === (excerpt.is_user ? 'user' : 'assistant') && typeof m.content === 'string' && m.content.includes(excerpt.mes.trim()))), `${sample.id}: every excerpt reached outgoing prompt with its source role`);
        }
        check(source.slice(-(plan.settings.recent - 1)).every(m => promptText.includes(m.mes.trim())) && promptText.includes(question), `${sample.id}: recent source and question retained`);
        check(promptText.includes(plan.generation.instruction), `${sample.id}: frozen generation instruction present`);
        check(output.request.requestOptions.temperature === plan.generation.temperature && output.request.maxOutputTokens === plan.settings.maxOutputTokens && output.request.model === plan.generation.model, `${sample.id}: frozen generation parameters`);
        const evidence = refs => refs.map(ref => ({ message: ref.message, inMemory: passages.some(p => p.message === ref.message && p.text.includes(ref.quote)), inPrompt: promptText.includes(ref.quote), ranks: telemetry.queries.map(q => (q.hits || []).findIndex(h => h.text.includes(ref.quote)) + 1) }));
        const row = { ...sample, index, language: item.language, kind: item.kind, chatId, sourceHash, sourceTokens, sourceMessagesPresent: source.filter(m => promptText.includes(m.mes.trim())).length, baselineTruncated: sample.mode === 'off' && source.some(m => !promptText.includes(m.mes.trim())), answer: output.last, injected, memoryTokens: selected?.tokens || 0, selectedIds: passages.map(p => p.id), memoryText: selected?.text || '', requiredEvidence: evidence(item.rubric.requiredEvidence), supersededEvidence: evidence(item.rubric.supersededEvidence), retrievalMs: telemetry.retrieval?.elapsedMs ?? null, queries: telemetry.queries, usage: output.request.providerUsage ?? null, generationMs: output.request.generationMs, syncMs: result.preparation.at(-1).syncMs };
        if (plan.version === 'long-dialogue-v1' && sample.mode === 'off') check(row.baselineTruncated && row.sourceMessagesPresent < source.length, `${sample.id}: outgoing baseline is actually truncated`);
        if (plan.version === 'actor-perspective-v1') {
            row.actorEvidence = actorPromptEvidence(item, sample.mode, output.request.messages);
            check(true, `${sample.id}: complete actor baseline, source roles and reply identity verified`);
        }
        result.rows.push(row); output.request.naturalSampleId = sample.id;
        await checkpoint(); console.log(`RESULT ${sample.id}: integrity passed; semantic score pending`);
    }
    result.complete = result.rows.length === plan.schedule.length;
}
