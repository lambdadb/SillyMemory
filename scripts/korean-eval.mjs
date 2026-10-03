import { createHash } from 'node:crypto';
import { messages, cases, editIndex, editedText, deleteIndex, forbiddenSource, grade, version } from './korean-fixture.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runKoreanEvaluation({ page, field, openSettings, waitStatus, generate, assert, setStage, startCase = 0, startSample = startCase * 2 }) {
    const result = { version, startCase, startSample, sourceMessages: messages.length, cases, rows: [], setup: {}, reference: 'Same post-edit/deletion source; no built-in memory; alternating mode order; one sample per question and mode.' };
    async function enable(value) {
        await openSettings();
        if (await field('enabled').isChecked() !== value) await field('enabled').setChecked(value);
        if (value) await waitStatus('synchronized');
    }
    async function seed(source) {
        await page.evaluate(async source => {
            const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...source);
            await c.saveChat(); await c.reloadCurrentChat();
        }, source);
    }
    await field('recent').fill('12'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    setStage('Korean original source indexing');
    await seed(messages);
    const coldStart = performance.now(); await enable(true);
    result.setup.initialIndexMs = performance.now() - coldStart;
    assert(true, 'Korean 120-message original source indexed before edit and deletion');
    setStage('Korean native source edit');
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    // The host initially renders only the newest 100 messages.
    if (await page.locator('#show_more_messages').count()) await page.locator('#show_more_messages').click();
    await page.locator(`.mes[mesid="${editIndex}"] .mes_edit`).click();
    await page.locator('#curEditTextarea').fill(editedText);
    await page.locator(`.mes[mesid="${editIndex}"] .mes_edit_done`).click(); await waitStatus('synchronized');
    setStage('Korean native source deletion');
    await page.evaluate(async index => { await SillyTavern.getContext().deleteMessage(index); }, deleteIndex); await waitStatus('synchronized');
    const source = await page.evaluate(() => structuredClone(SillyTavern.getContext().chat));
    result.sourceHash = hash(source.map(m => ({ text: m.mes, user: m.is_user, name: m.name })));
    assert(source.length === 119 && source[editIndex].mes === editedText && !JSON.stringify(source).includes('청록달빛739'), 'native edit/deletion produced the expected Korean source');
    await enable(false);
    for (const [index, item] of cases.entries()) {
        // Counterbalance order without contaminating either prompt with prior answers.
        for (const [modeIndex, mode] of (index % 2 ? ['on', 'off'] : ['off', 'on']).entries()) {
            if (index * 2 + modeIndex < startSample) continue;
            setStage(`Korean ${item.id}/${mode} source preparation`);
            await enable(false); await seed(source); await enable(mode === 'on');
            const before = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ text: m.mes, user: m.is_user, name: m.name })));
            assert(hash(before) === result.sourceHash, `${item.id}/${mode}: identical uncontaminated source restored`);
            const output = await generate(`ko/${item.id}/${mode}`, 'normal', false, { question: `${item.question} 설명 없이 답만 짧게 쓰세요. 대화에 정보가 없으면 반드시 UNKNOWN이라고 답하세요.`, evaluate: true });
            const after = await page.evaluate(() => SillyTavern.getContext().chat.slice(0, -2).map(m => ({ text: m.mes, user: m.is_user, name: m.name })));
            assert(hash(after) === result.sourceHash, `${item.id}/${mode}: original conversation preserved by generation`);
            assert(forbiddenSource.every(text => !output.prompt.includes(text)), `${item.id}/${mode}: edited/deleted source text absent from outgoing prompt`);
            const promptText = output.request.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
            if (mode === 'off') assert(source.every(m => promptText.includes(m.mes)), `${item.id}/${mode}: full source fits the baseline context`);
            else assert(source.slice(-11).every(m => promptText.includes(m.mes)), `${item.id}/${mode}: recent complete messages retained`);
            const evaluation = grade(output.last, item);
            const inspection = /^(\d+) \/ (\d+) tokens/.exec(output.inspection);
            const injected = output.prompt.includes('Past conversation excerpt');
            if (mode === 'on' && injected) assert(inspection && Number(inspection[1]) <= 800, `${item.id}/${mode}: complete memory fits 800 host tokens`);
            if (mode === 'off') assert(!injected, `${item.id}/${mode}: memory disabled in final prompt`);
            const row = { case: item.id, mode, question: item.question, answer: output.last, ...evaluation, injected, memoryTokens: injected && inspection ? Number(inspection[1]) : 0, promptTokens: output.request.providerUsage?.prompt_tokens ?? null, hostTextTokens: output.request.hostTextTokens, promptCharacters: output.request.promptCharacters, generationMs: output.request.generationMs, providerMs: output.request.responseMs };
            result.rows.push(row); output.request.evaluation = row;
            console.log(`RESULT ${item.id}/${mode}: ${evaluation.correct ? 'correct' : 'incorrect'}`);
        }
    }
    result.summary = Object.fromEntries(['off', 'on'].map(mode => {
        const rows = result.rows.filter(r => r.mode === mode);
        const median = values => { const sorted = values.toSorted((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
        return [mode, { correct: rows.filter(r => r.correct).length, total: rows.length, forbiddenAnswers: rows.filter(r => r.forbiddenAnswerMatches.length).length, medianPromptTokens: median(rows.map(r => r.promptTokens).filter(x => x !== null)), medianGenerationMs: median(rows.map(r => r.generationMs)), medianProviderMs: median(rows.map(r => r.providerMs)), injected: rows.filter(r => r.injected).length }];
    }));
    return result;
}
