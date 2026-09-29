// Real-host ablation of frozen, previously retrieved passages. Not a retrieval E2E.
import { ablationHistory, ablationPromptEvidence } from './actor-ablation.mjs';
import { hash, loadNaturalFixture } from './natural-dialogue.mjs';
import { memoryMessages } from '../src/memory.js';
const sourceView = messages => messages.map(m => ({ text: m.mes, user: m.is_user, name: m.name }));

export async function runActorAblation({ page, field, openSettings, generate, assert: check, setStage, result, frozen, checkpoint }) {
    const { plan } = frozen, fixture = loadNaturalFixture(plan.version);
    const cases = new Map(plan.cases.map(item => [item.id, item]));
    Object.assign(result, { version: plan.version, planSha256: frozen.sha256, fixtureHash: plan.audit.fixtureHash, settings: plan.settings, generation: plan.generation, plannedSamples: plan.schedule.length, rows: [], complete: false, selection: 'frozen prior live hits; retrieval disabled during generation' });
    await openSettings(); await field('enabled').setChecked(false);
    // The pinned host resolves the interceptor by global name for each generation.
    await page.evaluate(() => {
        globalThis.ablationOriginalInterceptor = globalThis.sillymemory_intercept;
        globalThis.sillymemory_intercept = async (chat, _size, abort, type) => {
            const control = globalThis.ablationControl;
            const view = list => list.map(m => ({ text: m.mes, user: m.is_user, name: m.name }));
            if (!control || type !== 'normal' || JSON.stringify(view(chat)) !== JSON.stringify(control.before)) {
                globalThis.ablationError = 'Unexpected original host history'; abort(true); return;
            }
            chat.splice(0, chat.length, ...structuredClone(control.after));
            globalThis.ablationApplied++;
        };
    });
    try {
        for (const [index, sample] of plan.schedule.entries()) {
            const item = cases.get(sample.case), { source, question } = item.input;
            const selected = fixture.ablation.selections[item.id];
            const after = ablationHistory(item, fixture, sample.mode);
            setStage(`natural/${sample.id}/prepare`);
            const chatId = `ablation-${index}-${sample.id.replaceAll('/', '-')}`;
            await page.evaluate(async ({ source, chatId, after, question }) => {
                const c = SillyTavern.getContext(); await c.openCharacterChat(chatId);
                c.chat.splice(0, c.chat.length, ...source); await c.saveChat(); await c.reloadCurrentChat();
                globalThis.ablationApplied = 0; globalThis.ablationError = null;
                globalThis.ablationControl = { before: [...source.map(m => ({ text: m.mes, user: m.is_user, name: m.name })), { text: question, user: true, name: 'User' }], after };
            }, { source, chatId, after, question });
            const before = await page.evaluate(() => { const c = SillyTavern.getContext(); return { id: c.getCurrentChatId(), source: c.chat.map(m => ({ text: m.mes, user: m.is_user, name: m.name })) }; });
            const sourceHash = hash(sourceView(source));
            check(before.id === chatId && hash(before.source) === sourceHash, `${sample.id}: isolated exact source restored`);
            const labelledText = memoryMessages(selected.passages).map(m => m.mes).join('\n');
            const tokens = await page.evaluate(async text => SillyTavern.getContext().getTokenCountAsync(text), labelledText);
            check(tokens === selected.labelledTokens && tokens <= plan.settings.budget, `${sample.id}: frozen labelled selection budget verified; no backfill`);
            const output = await generate(`natural/${sample.id}`, 'normal', false, { question, evaluate: true });
            const evidence = ablationPromptEvidence(item, fixture, sample.mode, output.request.messages);
            check(true, `${sample.id}: exact outgoing source set, roles, order, labels and system prompts`);
            const state = await page.evaluate(length => ({ source: SillyTavern.getContext().chat.slice(0, length).map(m => ({ text: m.mes, user: m.is_user, name: m.name })), applied: globalThis.ablationApplied, error: globalThis.ablationError }), source.length);
            check(state.applied === 1 && !state.error && hash(state.source) === sourceHash && output.chatLength === source.length + 2, `${sample.id}: one ephemeral intervention; saved history unchanged`);
            const refs = refs => refs.map(ref => ({ message: ref.message, inMemory: selected.passages.some(p => p.message === ref.message && p.text.includes(ref.quote)), inPrompt: output.request.messages.some(m => m.content.includes(ref.quote)), ranks: [] }));
            result.rows.push({ ...sample, index, language: item.language, kind: item.kind, chatId, sourceHash, answer: output.last, ablationEvidence: evidence, selectionHash: hash(selected), memoryTokens: tokens, sourceMessagesPresent: evidence.sourceMessagesPresent, requiredEvidence: refs(item.rubric.requiredEvidence), supersededEvidence: refs(item.rubric.supersededEvidence), usage: output.request.providerUsage ?? null, generationMs: output.request.generationMs });
            output.request.naturalSampleId = sample.id;
            await checkpoint(); console.log(`RESULT ${sample.id}: integrity passed; semantic score pending`);
        }
        result.complete = result.rows.length === plan.schedule.length;
    } finally {
        await page.evaluate(() => {
            globalThis.sillymemory_intercept = globalThis.ablationOriginalInterceptor;
            delete globalThis.ablationOriginalInterceptor; delete globalThis.ablationControl;
        });
    }
}
