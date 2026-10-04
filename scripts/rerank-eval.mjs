import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export const rerankFiles = ['src/commit.js', 'src/checkpoints.js', 'scripts/rerank-query.mjs', 'scripts/rerank-eval.mjs', 'tests/fixtures/rerank-v1.json', 'docs/managed-reranking-protocol.md'];
const bytes = readFileSync(new URL('../tests/fixtures/rerank-v1.json', import.meta.url));
export const rerankFixtureHash = createHash('sha256').update(bytes).digest('hex');
export const rerankCases = JSON.parse(bytes).cases.map(item => ({ ...item,
    source: Array.from({ length: 44 }, (_, i) => ({
        mes: i >= 40 ? `Recent neutral turn ${i}: we sorted plain paper and empty baskets.` :
            (i === 2 ? item.facts[0] : i === 24 ? item.facts[1] : item.distractor) +
            ` This was recorded on ledger page ${300 + i}. We walked through the market, sorted loose paper, straightened the shelves, and counted the empty baskets.`,
        name: i % 2 ? 'User' : 'SillyMemory E2E Mira', is_user: Boolean(i % 2), is_system: false, send_date: 0, extra: {},
    })),
}));
export function gradeRerank(answer, expected) {
    return answer.trim().replace(/^["']|["'.!]+$/g, '').toLowerCase() === expected.toLowerCase();
}
export function evidenceCoverage(passages, evidence) {
    return evidence.map(text => passages.some(p => p.text.includes(text)));
}
export function compareCandidateSets(left, right) {
    if (left.length !== right.length) return false;
    const ordered = rows => [...rows].sort((a, b) => a.text.localeCompare(b.text));
    const a = ordered(left), b = ordered(right);
    return a.every((query, index) => query.text === b[index].text &&
        JSON.stringify(query.hits.map(d => d.id).sort()) === JSON.stringify(b[index].hits.map(d => d.id).sort()));
}
export async function runRerank({ page, field, openSettings, waitStatus, generate, setStage, result, checkpoint, credentials }) {
    Object.assign(result, { version: 'rerank-v1', fixtureSha256: rerankFixtureHash, settings: { context: 32768, recent: 4, budget: 800, size: 30, k: 30, candidateSize: 30 }, rows: [], complete: false });
    setStage('rerank/contract-preflight');
    result.preflight = await page.evaluate(async credentials => {
        const { LambdaClient, scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { rerankSearch } = await import('/scripts/extensions/third-party/sillymemory/scripts/rerank-query.mjs');
        const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner;
        const client = new LambdaClient(credentials, credentials.key), trace = { mode: 'rerank', queries: [] };
        const collection = `sm_rerank_${crypto.randomUUID().replaceAll('-', '')}`, scope = 'b'.repeat(64), foreign = 'c'.repeat(64), branch = 'chat_preflight';
        const docs = [{ id: 'allowed', owner, scope, text: 'The brass compass is in the attic cabinet.' },
            { id: 'foreign-chat', owner, scope: foreign, text: 'The brass compass is in the attic cabinet.' },
            { id: 'foreign-owner', owner: foreign, scope, text: 'The brass compass is in the attic cabinet.' }];
        let error;
        try {
            await client.create(collection, owner);
            await client.createBranch(collection, branch);
            await client.upsert(collection, [{ id: 'sibling-only', owner, scope, text: 'The brass compass is in the attic cabinet.' }]);
            await client.upsert(collection, docs, undefined, branch);
            const hits = await rerankSearch(trace).call(client, collection, owner, scope, 'Where is the brass compass?', undefined, branch);
            if (hits.length !== 1 || hits[0].id !== 'allowed') throw new Error('Reranking isolation failed');
            if (trace.queries[0].rerank.status !== 'applied') throw new Error('Preflight reranking was not applied');
            await client.deleteIds(collection, docs.map(d => d.id), undefined, branch);
            if ((await client.query(collection, scopeFilter(owner, scope), { branch })).length) throw new Error('Deleted preflight evidence remains visible');
        } catch (e) { error = { message: e.message, status: e.status, code: e.code }; }
        finally { try { await client.deleteOwnedCollection(collection, owner); } finally { client.forget(); } }
        return { passed: !error, error, queries: trace.queries, cleanup: true };
    }, credentials);
    await checkpoint(); assert(result.preflight.passed, `Rerank preflight failed: ${result.preflight.error?.message}`);
    console.log('PASS managed Jev score metadata, owner/scope/branch isolation and deletion');
    await field('recent').fill('4'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const runtime = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { rerankSearch } = await import('/scripts/extensions/third-party/sillymemory/scripts/rerank-query.mjs');
        const t = globalThis.rerankTest = { runtime, LambdaClient, search: LambdaClient.prototype.search, retrieve: runtime.MemoryEngine.prototype.retrieve, queries: [] };
        LambdaClient.prototype.search = rerankSearch(t);
        runtime.MemoryEngine.prototype.retrieve = async function (...args) {
            const expected = await runtime.documents(args[0], this.owner, args[1]), start = performance.now();
            const selected = await t.retrieve.apply(this, args);
            t.trace = { expected, selected, elapsedMs: performance.now() - start }; return selected;
        };
    });
    try {
        for (const [index, item] of rerankCases.entries()) for (const mode of index % 2 ? ['rerank', 'vector'] : ['vector', 'rerank']) {
            setStage(`rerank/${item.id}/${mode}/prepare`); await openSettings();
            if (await field('enabled').isChecked()) await field('enabled').uncheck();
            await page.evaluate(async ({ source, mode }) => {
                const t = globalThis.rerankTest, c = SillyTavern.getContext(); t.mode = mode;
                c.chat.splice(0, c.chat.length, ...source); await c.saveChat(); await c.reloadCurrentChat();
                t.trace = null; t.queries = [];
            }, { source: item.source, mode });
            await field('enabled').check(); await waitStatus('synchronized');
            const output = await generate(`rerank/${item.id}/${mode}`, 'normal', false, { question: item.question, evaluate: true });
            const actual = await page.evaluate(length => ({ source: SillyTavern.getContext().chat.slice(0, length).map(m => m.mes), trace: globalThis.rerankTest.trace, queries: globalThis.rerankTest.queries }), item.source.length);
            assert.deepEqual(actual.source, item.source.map(m => m.mes));
            const selected = actual.trace?.selected;
            assert(selected?.passages.length, 'No fallback to full history'); assert(selected.tokens <= 800);
            assert.equal(output.request.model, 'gpt-4.1-mini-2025-04-14'); assert.equal(output.request.requestOptions.temperature, 0);
            const prompt = output.request.messages.map(m => m.content).join('\n');
            assert(selected.messages.every(m => prompt.includes(m.mes)), 'Memory delivered to actual request');
            assert(item.source.slice(-3).every(m => prompt.includes(m.mes)) && prompt.includes(item.question));
            const retrieved = evidenceCoverage(actual.queries.flatMap(q => q.hits), item.evidence), delivered = evidenceCoverage(selected.passages, item.evidence);
            const correct = gradeRerank(output.last, item.answer);
            result.rows.push({ case: item.id, category: item.category, mode, sourceSha256: createHash('sha256').update(JSON.stringify(item.source)).digest('hex'), answer: output.last, correct, retrieved, delivered,
                failureClass: correct ? null : !retrieved.every(Boolean) ? 'absent-candidate' : !delivered.every(Boolean) ? 'budget-exclusion' : 'generation-with-complete-evidence',
                memoryTokens: selected.tokens, inputTokens: output.request.providerUsage?.prompt_tokens, outputTokens: output.request.providerUsage?.completion_tokens, generationMs: output.request.generationMs, trace: actual.trace, queries: actual.queries });
            await checkpoint(); const row = result.rows.at(-1);
            console.log(`RESULT ${item.id}/${mode}: correct=${row.correct}; complete evidence=${delivered.every(Boolean)}`);
        }
        result.pairs = rerankCases.map(item => {
            const vector = result.rows.find(r => r.case === item.id && r.mode === 'vector'), rerank = result.rows.find(r => r.case === item.id && r.mode === 'rerank');
            return { case: item.id, gained: !vector.correct && rerank.correct, lost: vector.correct && !rerank.correct, sameCandidates: compareCandidateSets(vector.queries, rerank.queries) };
        });
        result.complete = result.rows.length === 24;
        result.adoptionGate = result.complete && result.pairs.some(p => p.gained) && !result.pairs.some(p => p.lost) && result.rows.filter(r => r.mode === 'rerank').every(r => r.queries.length && r.queries.every(q => q.rerank?.status === 'applied'));
    } finally {
        await openSettings(); if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(() => { const t = globalThis.rerankTest; t.LambdaClient.prototype.search = t.search; t.runtime.MemoryEngine.prototype.retrieve = t.retrieve; });
    }
}
