import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { hybridCases, hybridFiles } from './hybrid-eval.mjs';
import { runRerank, rerankFiles, compareCandidateSets } from './rerank-eval.mjs';
export const rescueFiles = [...new Set([...rerankFiles, ...hybridFiles, 'scripts/rerank-rescue.mjs', 'tests/fixtures/rerank-confirmation-v1.json', 'docs/rerank-rescue-protocol.md'])];
const makeCase = item => ({ ...item,
    source: Array.from({ length: 44 }, (_, i) => ({
        mes: i >= 40 ? (i === 43 && item.context ? item.context : `Recent neutral turn ${i}: we sorted plain paper and empty baskets.`) :
            (i === 24 ? item.fact : i === 2 && item.earlier ? item.earlier : item.distractor.replaceAll('{n}', String(300 + i))) +
            ' We wrote the details in the ordinary ledger before walking past the market. The afternoon was quiet, and we took time to sort the loose pages and straighten the shelves.',
        name: i % 2 ? 'User' : 'SillyMemory E2E Mira', is_user: Boolean(i % 2), is_system: false, send_date: 0, extra: {},
    })),
});
export const confirmationCases = JSON.parse(readFileSync(new URL('../tests/fixtures/rerank-confirmation-v1.json', import.meta.url))).cases.map(makeCase);
export const intentCases = JSON.parse(readFileSync(new URL('../tests/fixtures/rerank-intent-v1.json', import.meta.url))).cases.map(makeCase);
export const intentFiles = [...rescueFiles, 'tests/fixtures/rerank-intent-v1.json', 'docs/rerank-intent-protocol.md'];
export function gradeIdentifier(answer, expected) {
    const normalized = answer.trim().replace(/^["']|["'.!]+$/g, '');
    if (expected === 'UNKNOWN') return normalized.toUpperCase() === 'UNKNOWN';
    if (/\b(?:not|never|unknown|isn't|wasn't|no longer|rather than)\b/i.test(normalized)) return false;
    const ids = [...new Set(normalized.match(/\b[A-Z]+-[A-Z0-9]+\b/g) || [])];
    return ids.length === 1 && ids[0] === expected;
}
export function chooseRescuePolicy(rows, ids) {
    const baseline = ids.map(id => rows.find(r => r.case === id && r.mode === 'vector'));
    assert(baseline.every(Boolean), 'Incomplete diagnostic baseline');
    const eligible = ['rerank', 'hybrid-rerank'].flatMap(mode => {
        const candidate = ids.map(id => rows.find(r => r.case === id && r.mode === mode));
        if (!candidate.every(row => row && row.queries.length && row.queries.every(q => q.rerank?.status === 'applied'))) return [];
        const gains = candidate.filter((r, i) => r.factSelected && !baseline[i].factSelected).length;
        const losses = candidate.filter((r, i) => !r.factSelected && baseline[i].factSelected).length;
        return gains && !losses ? [{ mode, gains, coverage: candidate.filter(r => r.factSelected).length }] : [];
    });
    return eligible.sort((a, b) => b.coverage - a.coverage)[0] || null;
}
export function answerGate(rows, ids, policy, baseline = 'vector') {
    return ids.every(id => rows.some(r => r.case === id && r.mode === baseline) && rows.some(r => r.case === id && r.mode === policy)) &&
        ids.some(id => !rows.find(r => r.case === id && r.mode === baseline).correct && rows.find(r => r.case === id && r.mode === policy).correct) &&
        !ids.some(id => rows.find(r => r.case === id && r.mode === baseline).correct && !rows.find(r => r.case === id && r.mode === policy).correct);
}

export async function runRerankRescue(args) {
    const { page, field, openSettings, waitStatus, generate, setStage, result, checkpoint, intentMode = false } = args;
    await runRerank({ ...args, contractOnly: true, preflightModes: intentMode ? ['hybrid-rerank', 'hybrid-intent'] : ['rerank', 'hybrid-rerank'] });
    Object.assign(result, { version: intentMode ? 'rerank-intent-v1' : 'rerank-rescue-v1', probes: [], rows: [], gates: {}, complete: false, fixtureSha256: undefined });
    await field('recent').fill('4'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const runtime = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { rerankSearch, sharedRerankText } = await import('/scripts/extensions/third-party/sillymemory/scripts/rerank-query.mjs');
        const t = globalThis.rescueTest = { runtime, LambdaClient, search: LambdaClient.prototype.search, sync: runtime.MemoryEngine.prototype.sync,
            retrieve: runtime.MemoryEngine.prototype.retrieve, queries: [], probes: new Map() };
        const liveSearch = rerankSearch(t);
        LambdaClient.prototype.search = async function (collection, owner, scope, text, signal, branch) {
            if (!t.replay) return liveSearch.call(this, collection, owner, scope, text, signal, branch);
            signal?.throwIfAborted();
            const p = t.probes.get(t.replay), q = p?.queries.find(q => q.text === text);
            if (!q || p.collection !== collection || p.owner !== owner || p.scope !== scope || p.branch !== branch) throw new Error('Replay identity/query changed');
            t.queries.push({ ...q, replayed: true }); return structuredClone(q.hits);
        };
        runtime.MemoryEngine.prototype.sync = async function (...args) { const prepared = await t.sync.apply(this, args); t.engine = this; return prepared; };
        runtime.MemoryEngine.prototype.retrieve = async function (...args) {
            const expected = await runtime.documents(args[0], this.owner, args[1]);
            t.intent = t.mode === 'hybrid-intent' ? sharedRerankText(runtime.retrievalQueries(args[0], args[5] || 'normal')) : undefined;
            const selected = await t.retrieve.apply(this, args); t.trace = { expected, selected }; return selected;
        };
    });
    async function prepare(item, mode, replay = null) {
        await openSettings(); if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(async ({ source, mode, replay }) => {
            const t = globalThis.rescueTest, c = SillyTavern.getContext(); t.mode = mode; t.replay = replay; t.engine = null;
            c.chat.splice(0, c.chat.length, ...source); await c.saveChat(); await c.reloadCurrentChat();
            t.trace = null; t.queries = [];
        }, { source: item.source, mode, replay });
        await field('enabled').check(); await waitStatus('synchronized');
    }
    async function probe(item, mode, cohort) {
        const cached = result.probes.find(r => r.case === item.id && r.mode === mode && r.cohort === cohort); if (cached) return cached;
        const key = `${cohort}/${item.id}/${mode}`; setStage(`rescue/probe/${key}`);
        await prepare(item, mode); await field('enabled').uncheck();
        const row = await page.evaluate(async ({ question, fact, key }) => {
            const t = globalThis.rescueTest, c = SillyTavern.getContext(), snapshot = t.runtime.capture(c);
            snapshot.messages.push({ index: snapshot.messages.length, text: question, name: 'User', user: true, swipe: 0, eligible: true });
            t.queries = []; t.trace = null;
            const selected = await t.engine.retrieve(snapshot, t.runtime.options({ recent: 4, budget: 800 }), text => c.getTokenCountAsync(text));
            if (!selected?.passages.length || selected.tokens > 800) throw new Error('Probe has no bounded memory');
            if (selected.passages.some(p => !t.trace.expected.docs.some(d => JSON.stringify(d) === JSON.stringify(p)))) throw new Error('Probe selected stale source');
            const row = { collection: t.engine.collection, owner: t.engine.owner, scope: t.trace.expected.scope, branch: t.engine.branch,
                selected, queries: t.queries, expected: t.trace.expected, factRetrieved: t.queries.some(q => q.hits.some(d => d.text.includes(fact))), factSelected: selected.passages.some(d => d.text.includes(fact)) };
            t.probes.set(key, structuredClone(row)); return row;
        }, { question: item.question, fact: item.fact, key });
        assert.equal(row.queries.length, 2); assert(row.queries.every(q => q.hits.length <= 30));
        const source = await page.evaluate(() => SillyTavern.getContext().chat.map(m => m.mes)); assert.deepEqual(source, item.source.map(m => m.mes));
        const entry = { case: item.id, mode, cohort, sourceSha256: createHash('sha256').update(JSON.stringify(item.source)).digest('hex'), ...row };
        const baseline = result.probes.find(r => r.case === item.id && r.cohort === cohort && r.mode === (mode === 'hybrid-intent' ? 'hybrid-rerank' : mode === 'hybrid-rerank' ? 'hybrid' : 'vector'));
        if (baseline) entry.sameCandidates = compareCandidateSets(baseline.queries, row.queries);
        result.probes.push(entry); await checkpoint();
        console.log(`PROBE ${key}: retrieved=${row.factRetrieved}; selected=${row.factSelected}`); return entry;
    }
    async function answers(cases, modes, cohort) {
        for (const [index, item] of cases.entries()) for (const mode of index % 2 ? [...modes].reverse() : modes) {
            const key = `${cohort}/${item.id}/${mode}`; setStage(`rescue/answer/${key}`); await prepare(item, mode, key);
            const output = await generate(`rescue/answer/${key}`, 'normal', false, { question: item.question, evaluate: true });
            const actual = await page.evaluate(length => ({ trace: globalThis.rescueTest.trace, queries: globalThis.rescueTest.queries,
                source: SillyTavern.getContext().chat.slice(0, length).map(m => m.mes) }), item.source.length);
            const p = result.probes.find(r => r.case === item.id && r.mode === mode && r.cohort === cohort);
            assert.deepEqual(actual.source, item.source.map(m => m.mes)); assert.deepEqual(actual.trace.selected, p.selected);
            assert.equal(actual.queries.length, 2); assert(actual.queries.every(q => q.replayed));
            const prompt = output.request.messages.map(m => m.content).join('\n');
            assert(p.selected.messages.every(m => prompt.includes(m.mes))); assert(item.source.slice(-3).every(m => prompt.includes(m.mes)) && prompt.includes(item.question));
            assert.equal(output.request.requestOptions.temperature, 0); assert.equal(output.request.model, 'gpt-4.1-mini-2025-04-14');
            const row = { case: item.id, mode, cohort, answer: output.last, correct: gradeIdentifier(output.last, item.answer),
                exact: output.last.trim().replace(/[.!]+$/, '').toUpperCase() === item.answer, factSelected: p.factSelected, memoryTokens: p.selected.tokens,
                inputTokens: output.request.providerUsage?.prompt_tokens, outputTokens: output.request.providerUsage?.completion_tokens, generationMs: output.request.generationMs, liveDerivedReplay: true };
            result.rows.push(row); await checkpoint(); console.log(`ANSWER ${key}: identifierCorrect=${row.correct}; ${row.answer}`);
        }
    }
    try {
        if (intentMode) {
            const known = [...hybridCases, ...confirmationCases], modes = ['vector', 'hybrid-rerank', 'hybrid-intent'];
            for (const item of known) for (const mode of modes) await probe(item, mode, 'intent-diagnostic');
            const diagnostic = result.probes.filter(r => r.cohort === 'intent-diagnostic');
            const current = id => diagnostic.find(r => r.case === id && r.mode === 'hybrid-intent');
            result.gates.evidence = current('new-paraphrase-medicine').factSelected && known.every(item => {
                const candidate = current(item.id);
                return candidate.queries.every(q => q.rerank?.status === 'applied') &&
                    diagnostic.filter(r => r.case === item.id).every(r => !r.factSelected || candidate.factSelected);
            });
            await checkpoint();
            if (!result.gates.evidence) { result.stop = 'Shared question did not recover the medicine fact without evidence loss'; result.complete = true; return; }
            const targets = ['new-paraphrase-medicine', 'rare-name', 'correction', 'new-revocation', 'new-historical-state'];
            await answers(targets.map(id => known.find(c => c.id === id)), ['hybrid-rerank', 'hybrid-intent'], 'intent-diagnostic');
            result.gates.diagnosticAnswers = answerGate(result.rows, targets, 'hybrid-intent', 'hybrid-rerank');
            await checkpoint();
            if (!result.gates.diagnosticAnswers) { result.stop = 'No targeted answer recovery without a regression'; result.complete = true; return; }
            for (const item of intentCases) for (const mode of modes) await probe(item, mode, 'intent-confirmation');
            await answers(intentCases, modes, 'intent-confirmation');
            result.gates.confirmationNoLoss = intentCases.every(item => {
                const rows = result.rows.filter(r => r.cohort === 'intent-confirmation' && r.case === item.id);
                return rows.find(r => r.mode === 'hybrid-intent').correct || rows.every(r => !r.correct);
            });
            result.complete = true; result.stop = 'Frozen shared-question stages complete; semantic review required'; return;
        }
        for (const item of hybridCases) for (const mode of ['vector', 'rerank']) await probe(item, mode, 'diagnostic');
        result.gates.vectorProbeComplete = true; await checkpoint();
        const missing = hybridCases.filter(item => !result.probes.find(r => r.case === item.id && r.mode === 'vector').factRetrieved);
        result.gates.hybridTrigger = missing.map(item => item.id);
        for (const item of missing) for (const mode of ['hybrid', 'hybrid-rerank']) await probe(item, mode, 'diagnostic');
        if (missing.some(item => result.probes.find(r => r.case === item.id && r.mode === 'hybrid-rerank').factSelected)) {
            for (const item of hybridCases) for (const mode of ['hybrid', 'hybrid-rerank']) await probe(item, mode, 'diagnostic');
        }
        result.gates.policy = chooseRescuePolicy(result.probes, hybridCases.map(c => c.id)); await checkpoint();
        if (!result.gates.policy) { result.stop = 'No policy rescued evidence without a regression'; result.complete = true; return; }
        const policy = result.gates.policy.mode;
        await answers(hybridCases, ['vector', policy], 'diagnostic');
        result.gates.diagnosticAnswers = answerGate(result.rows, hybridCases.map(c => c.id), policy); await checkpoint();
        if (!result.gates.diagnosticAnswers) { result.stop = 'No diagnostic answer gain without regression'; result.complete = true; return; }
        for (const item of confirmationCases) for (const mode of ['vector', policy]) await probe(item, mode, 'confirmation');
        await answers(confirmationCases, ['vector', policy], 'confirmation');
        result.gates.confirmationAnswers = answerGate(result.rows.filter(r => r.cohort === 'confirmation'), confirmationCases.map(c => c.id), policy);
        result.complete = true; result.stop = 'Frozen stages complete; semantic review required before any product adoption';
    } finally {
        await openSettings(); if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(() => { const t = globalThis.rescueTest; t.LambdaClient.prototype.search = t.search; t.runtime.MemoryEngine.prototype.sync = t.sync; t.runtime.MemoryEngine.prototype.retrieve = t.retrieve; });
        await checkpoint();
    }
}
