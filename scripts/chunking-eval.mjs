// Bounded same-source indexing comparison. Baseline code is loaded from the
// immutable parent revision, never kept as a second production implementation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export const chunkingBaseline = '20f818b106af2c8fcf5a13a7a5db865f77cdbe4d';
export const chunkingFiles = ['src/chunking.js', 'scripts/chunking-eval.mjs', 'tests/fixtures/chunking-v1.json', 'docs/boundary-chunking.md'];
const bytes = readFileSync(new URL('../tests/fixtures/chunking-v1.json', import.meta.url));
export const chunkingFixtureHash = createHash('sha256').update(bytes).digest('hex');
export const chunkingCases = JSON.parse(bytes).cases.map(item => {
    const filler = item.unpunctuated ? 'ordinary paper on the quiet table ' : 'The room contained ordinary paper. ';
    // A complete filler sentence ends exactly before the target fact.
    const prefix = item.prefix ? filler.repeat(Math.ceil(item.prefix / filler.length)).slice(0, item.prefix - 2) + (item.unpunctuated ? '  ' : '. ') : '';
    const suffix = item.prefix ? ' We sorted plain cups on the shelf.'.repeat(40) : '';
    const text = prefix + item.fact + suffix;
    const source = Array.from({ length: 12 }, (_, i) => ({ mes: i === 0 ? text : `Ordinary conversation turn ${i}: we discussed empty baskets and blank paper.`, name: i % 2 ? 'User' : 'SillyMemory E2E Mira', is_user: Boolean(i % 2), is_system: false, send_date: 0, extra: {} }));
    return { ...item, source };
});
export function gradeChunking(answer, expected) { return answer.trim().replace(/^["']|["'.!]+$/g, '').toLowerCase() === expected.toLowerCase(); }
export async function runChunking({ page, field, openSettings, waitStatus, generate, setStage, result, checkpoint }) {
    Object.assign(result, { version: 'chunking-v1', baseline: chunkingBaseline, fixtureSha256: chunkingFixtureHash, settings: { context: 32768, recent: 4, budget: 800 }, rows: [], complete: false });
    await field('recent').fill('4'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const runtime = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const baseline = await import('/scripts/extensions/third-party/sillymemory/src/memory-baseline.js');
        globalThis.chunkingTest = { runtime, baseline, sync: runtime.MemoryEngine.prototype.sync, retrieve: runtime.MemoryEngine.prototype.retrieve };
    });
    for (const [index, item] of chunkingCases.entries()) for (const mode of index % 2 ? ['boundary', 'fixed'] : ['fixed', 'boundary']) {
        setStage(`chunking/${item.id}/${mode}/prepare`); await openSettings();
        if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(async ({ source, mode }) => {
            const t = globalThis.chunkingTest, api = mode === 'fixed' ? t.baseline : t.runtime;
            const retrieve = mode === 'fixed' ? t.baseline.MemoryEngine.prototype.retrieve : t.retrieve;
            t.runtime.MemoryEngine.prototype.sync = mode === 'fixed' ? t.baseline.MemoryEngine.prototype.sync : t.sync;
            t.runtime.MemoryEngine.prototype.retrieve = async function (...args) {
                const expected = await api.documents(args[0], this.owner, args[1]);
                const result = await retrieve.apply(this, args); t.trace = { expected, result }; return result;
            };
            const c = SillyTavern.getContext();
            c.chat.splice(0, c.chat.length, ...source); await c.saveChat(); await c.reloadCurrentChat();
            t.trace = null;
        }, { source: item.source, mode });
        await field('enabled').check(); await waitStatus('synchronized');
        const output = await generate(`chunking/${item.id}/${mode}`, 'normal', false, { question: item.question, evaluate: true });
        const actualSource = await page.evaluate(length => SillyTavern.getContext().chat.slice(0, length).map(m => m.mes), item.source.length);
        assert.deepEqual(actualSource, item.source.map(m => m.mes), 'Source text unchanged by generation');
        const trace = await page.evaluate(() => globalThis.chunkingTest.trace);
        assert(trace?.result?.passages.length, 'Retrieval must succeed; no full-history fallback');
        assert(trace.result.tokens <= 800); assert.equal(output.request.model, 'gpt-4.1-mini-2025-04-14');
        assert.equal(output.request.requestOptions.temperature, 0);
        const prompt = output.request.messages.map(m => m.content).join('\n');
        assert(item.source.slice(-3).every(m => prompt.includes(m.mes)) && prompt.includes(item.question));
        assert(trace.result.messages.every(m => prompt.includes(m.mes)), 'Selected memory reached actual outgoing prompt');
        const target = trace.expected.docs.filter(d => d.message === 0);
        const row = { case: item.id, mode, sourceSha256: createHash('sha256').update(JSON.stringify(item.source)).digest('hex'), answer: output.last, correct: gradeChunking(output.last, item.answer), factWholeInIndex: target.some(d => d.text.includes(item.fact)), factWholeSelected: trace.result.passages.some(d => d.text.includes(item.fact)), memoryTokens: trace.result.tokens, inputTokens: output.request.providerUsage?.prompt_tokens, documents: trace.expected.docs.length, trace };
        result.rows.push(row); await checkpoint(); console.log(`RESULT ${item.id}/${mode}: answer ${row.correct ? 'correct' : 'incorrect'}; whole fact indexed ${row.factWholeInIndex}`);
    }
    await openSettings(); if (await field('enabled').isChecked()) await field('enabled').uncheck();
    await page.evaluate(() => { const t = globalThis.chunkingTest; t.runtime.MemoryEngine.prototype.sync = t.sync; t.runtime.MemoryEngine.prototype.retrieve = t.retrieve; });
    result.complete = result.rows.length === 12;
}
