import { createHash } from 'node:crypto';
import { challengeCases, challengeVersion, challengeSettings, gradeChallenge } from './recall-challenges.mjs';
const sourceView = messages => messages.map(m => ({ text: m.mes, user: m.is_user, name: m.name }));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function runChallenges({ page, field, openSettings, waitStatus, generate, assert, setStage, result, startSample = 0 }) {
    const cases = challengeCases();
    Object.assign(result, { version: challengeVersion, settings: challengeSettings, fixtureHash: hash(cases), plannedSamples: cases.length * 2, startSample, rows: [], preparation: [] });
    async function enable(value) {
        await openSettings();
        if (await field('enabled').isChecked() !== value) await field('enabled').setChecked(value);
        if (value) await waitStatus('synchronized');
    }
    await field('recent').fill(String(challengeSettings.recent)); await field('recent').dispatchEvent('change');
    await field('budget').fill(String(challengeSettings.budget)); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const original = LambdaClient.prototype.search;
        globalThis.challengeQueries = [];
        LambdaClient.prototype.search = async function (...args) {
            const hits = await original.apply(this, args);
            globalThis.challengeQueries.push({ query: args[3], hits: hits.map(h => ({ id: h.id, text: h.text })) });
            return hits;
        };
    });
    for (const [caseIndex, item] of cases.entries()) {
        for (const [modeIndex, mode] of (caseIndex % 2 ? ['on', 'off'] : ['off', 'on']).entries()) {
            const index = caseIndex * 2 + modeIndex;
            if (index < startSample) continue;
            setStage(`challenge/${item.id}/${mode}/prepare`);
            await enable(false);
            await page.evaluate(async source => {
                const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...source);
                await c.saveChat(); await c.reloadCurrentChat();
            }, item.source);
            const sourceHash = hash(sourceView(item.source));
            const before = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ text: m.mes, user: m.is_user, name: m.name })));
            assert(hash(before) === sourceHash, `${item.id}/${mode}: identical source restored`);
            const sourceTokens = await page.evaluate(async () => { const c = SillyTavern.getContext(); return c.getTokenCountAsync(c.chat.map(m => m.mes).join('\n')); });
            assert(item.kind === 'overflow' ? sourceTokens > challengeSettings.context : sourceTokens < challengeSettings.context - 1000, `${item.id}/${mode}: intended context boundary verified`);
            const started = performance.now(); await enable(mode === 'on');
            result.preparation.push({ index, case: item.id, mode, sourceHash, sourceTokens, syncMs: performance.now() - started });
            await page.evaluate(() => { globalThis.challengeQueries = []; });
            const output = await generate(`challenge/${item.id}/${mode}`, item.type, false, { question: item.question, evaluate: true });
            const after = await page.evaluate(({ length, continuation }) => SillyTavern.getContext().chat.slice(0, continuation ? length - 1 : length).map(m => ({ text: m.mes, user: m.is_user, name: m.name })), { length: item.source.length, continuation: item.type === 'continue' });
            assert(hash(after) === hash(before.slice(0, after.length)) && after.length === item.source.length - (item.type === 'continue' ? 1 : 0), `${item.id}/${mode}: original source preserved`);
            const promptText = output.request.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
            const injected = promptText.includes('Past conversation excerpts');
            const counts = /^(\d+) \/ (\d+) tokens/.exec(output.inspection);
            if (injected) assert(mode === 'on' && counts && Number(counts[1]) <= challengeSettings.budget, `${item.id}/${mode}: memory budget enforced`);
            if (mode === 'off') assert(!injected, `${item.id}/${mode}: memory disabled`);
            assert(item.source.slice(-11).every(m => promptText.includes(m.mes.trim())), `${item.id}/${mode}: recent source retained`);
            const sourceMessagesPresent = item.source.filter(m => promptText.includes(m.mes.trim())).length;
            if (mode === 'off') assert(item.kind === 'overflow' ? sourceMessagesPresent < item.source.length : sourceMessagesPresent === item.source.length, `${item.id}/${mode}: baseline inclusion measured`);
            const queries = await page.evaluate(label => globalThis.challengeQueries.map(q => ({ query: q.query, targetRank: q.hits.findIndex(h => h.text.includes(label)) + 1 })), item.label);
            const answer = item.type === 'continue' ? output.request.providerAnswer : output.last;
            const row = { index, case: item.id, kind: item.kind, mode, type: item.type, label: item.label, answer, correct: gradeChallenge(answer, item.label), sourceHash, sourceTokens, sourceMessagesPresent, targetInPrompt: promptText.includes(item.label), targetInMemory: injected && output.inspection.includes(item.label), injected, memoryTokens: injected ? Number(counts[1]) : 0, queries, promptTokens: output.request.providerUsage?.prompt_tokens ?? null, generationMs: output.request.generationMs };
            result.rows.push(row); output.request.challenge = row;
            console.log(`RESULT ${item.id}/${mode}: ${row.correct ? 'correct' : 'incorrect'}; target ${row.targetInPrompt ? 'present' : 'absent'}; memory ${injected ? 'injected' : 'absent'}`);
        }
    }
    result.complete = startSample === 0 && result.rows.length === result.plannedSamples;
}
