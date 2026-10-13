import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export const hybridFiles = ['scripts/hybrid-query.mjs', 'scripts/hybrid-eval.mjs', 'tests/fixtures/hybrid-v1.json', 'docs/hybrid-retrieval.md'];
const bytes = readFileSync(new URL('../tests/fixtures/hybrid-v1.json', import.meta.url));
export const hybridFixtureHash = createHash('sha256').update(bytes).digest('hex');
export const hybridCases = JSON.parse(bytes).cases.map(item => {
    const source = Array.from({ length: 44 }, (_, i) => ({
        mes: i >= 40 ? `Recent neutral turn ${i}: we sorted plain paper and empty baskets.` :
            (i === 24 ? item.fact : i === 2 && item.earlier ? item.earlier : item.distractor.replaceAll('{n}', String(300 + i))) +
            ' We wrote the details in the ordinary ledger before walking past the market. The afternoon was quiet, and we took time to sort the loose pages and straighten the shelves.',
        name: i % 2 ? 'User' : 'SillyMemory E2E Mira', is_user: Boolean(i % 2), is_system: false, send_date: 0, extra: {},
    }));
    return { ...item, source };
});
export function gradeHybrid(answer, expected) { return answer.trim().replace(/^["']|["'.!]+$/g, '').toLowerCase() === expected.toLowerCase(); }

export async function runHybrid({ page, field, openSettings, waitStatus, generate, setStage, result, checkpoint, credentials }) {
    Object.assign(result, { version: 'hybrid-v1', fixtureSha256: hybridFixtureHash, settings: { context: 32768, recent: 4, budget: 800, size: 30, k: 30 }, rows: [], complete: false });
    setStage('hybrid/contract-preflight');
    result.preflight = await page.evaluate(async credentials => {
        const { LambdaClient, scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { hybridQuery } = await import('/scripts/extensions/third-party/sillymemory/scripts/hybrid-query.mjs');
        const c = SillyTavern.getContext(), owner = c.extensionSettings.sillymemory.owner;
        const client = new LambdaClient(credentials, credentials.key);
        const collection = `sm_hybrid_${crypto.randomUUID().replaceAll('-', '')}`, scope = 'b'.repeat(64), foreign = 'c'.repeat(64);
        const docs = [{ id: 'allowed', owner, scope, text: 'The alpha beacon belongs to the permitted memory.' },
            { id: 'foreign-chat', owner, scope: foreign, text: 'alpha beacon '.repeat(20) },
            { id: 'foreign-owner', owner: foreign, scope, text: 'alpha beacon '.repeat(20) }];
        const checks = [];
        try {
            await client.create(collection, owner); await client.upsert(collection, docs);
            for (const text of ['alpha beacon', 'alpha OR owner:* scope:* (NOT beacon) +"x" /a.*/ [0 TO 9]']) {
                const query = hybridQuery(owner, scope, text);
                for (const [leg, q] of [['vector', query.rrf[0]], ['lexical', query.rrf[1]], ['hybrid', query]]) {
                    const hits = await client.query(collection, q);
                    if (!hits.length || hits.some(d => d.id !== 'allowed' || d.owner !== owner || d.scope !== scope)) throw new Error('Hybrid preflight isolation failed');
                    checks.push({ input: text, leg, ids: hits.map(d => d.id) });
                }
            }
            await client.deleteIds(collection, docs.map(d => d.id));
            if ((await client.query(collection, scopeFilter(owner, scope))).length) throw new Error('Preflight deletion not visible');
        } finally { try { await client.deleteOwnedCollection(collection, owner); } finally { client.forget(); } }
        return { passed: true, checks, cleanup: true };
    }, credentials);
    await checkpoint(); console.log('PASS hybrid live literal-input and both-leg isolation preflight');
    await field('recent').fill('4'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const runtime = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { comparisonSearch } = await import('/scripts/extensions/third-party/sillymemory/scripts/hybrid-query.mjs');
        const t = globalThis.hybridTest = { runtime, LambdaClient, search: LambdaClient.prototype.search, retrieve: runtime.MemoryEngine.prototype.retrieve, queries: [] };
        LambdaClient.prototype.search = comparisonSearch(t);
        runtime.MemoryEngine.prototype.retrieve = async function (...args) {
            const expected = await runtime.documents(args[0], this.owner, args[1]), start = performance.now();
            const selected = await t.retrieve.apply(this, args);
            t.trace = { expected, selected, elapsedMs: performance.now() - start }; return selected;
        };
    });
    try {
        for (const [index, item] of hybridCases.entries()) for (const mode of index % 2 ? ['hybrid', 'vector'] : ['vector', 'hybrid']) {
            setStage(`hybrid/${item.id}/${mode}/prepare`); await openSettings();
            if (await field('enabled').isChecked()) await field('enabled').uncheck();
            await page.evaluate(async ({ source, mode }) => {
                const t = globalThis.hybridTest, c = SillyTavern.getContext(); t.mode = mode;
                c.chat.splice(0, c.chat.length, ...source); await c.saveChat(); await c.reloadCurrentChat();
                t.trace = null; t.queries = [];
            }, { source: item.source, mode });
            await field('enabled').check(); await waitStatus('synchronized');
            const output = await generate(`hybrid/${item.id}/${mode}`, 'normal', false, { question: item.question, evaluate: true });
            const actual = await page.evaluate(length => ({ source: SillyTavern.getContext().chat.slice(0, length).map(m => m.mes), trace: globalThis.hybridTest.trace, queries: globalThis.hybridTest.queries }), item.source.length);
            assert.deepEqual(actual.source, item.source.map(m => m.mes));
            const selected = actual.trace?.selected;
            assert(selected?.passages.length, 'No fallback to full history'); assert(selected.tokens <= 800);
            assert.equal(output.request.model, 'gpt-4.1-mini-2025-04-14'); assert.equal(output.request.requestOptions.temperature, 0);
            const prompt = output.request.messages.map(m => m.content).join('\n');
            assert(selected.messages.every(m => prompt.includes(m.mes)), 'Memory delivered to actual request');
            assert(item.source.slice(-3).every(m => prompt.includes(m.mes)) && prompt.includes(item.question));
            result.rows.push({ case: item.id, mode, sourceSha256: createHash('sha256').update(JSON.stringify(item.source)).digest('hex'), answer: output.last, correct: gradeHybrid(output.last, item.answer), factRetrieved: actual.queries.some(q => q.hits.some(d => d.text.includes(item.fact))), factSelected: selected.passages.some(d => d.text.includes(item.fact)), memoryTokens: selected.tokens, inputTokens: output.request.providerUsage?.prompt_tokens, generationMs: output.request.generationMs, trace: actual.trace, queries: actual.queries });
            await checkpoint(); const row = result.rows.at(-1);
            console.log(`RESULT ${item.id}/${mode}: correct=${row.correct}; fact retrieved=${row.factRetrieved}; selected=${row.factSelected}`);
        }
        result.complete = result.rows.length === 16;
    } finally {
        await openSettings(); if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(() => { const t = globalThis.hybridTest; t.LambdaClient.prototype.search = t.search; t.runtime.MemoryEngine.prototype.retrieve = t.retrieve; });
    }
}
