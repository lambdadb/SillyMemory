import { assistantFallbackCases } from './assistant-fallback-cases.mjs';
export async function runAssistantFallbackDiagnostic(run, report) {
    report.assistantFallback = { version: 'assistant-fallback-v1', generationCalls: 0, rows: [] };
    for (const item of assistantFallbackCases()) {
        const row = await run(`${item.id}: frozen assistant fallback comparison`, async item => {
            const t = globalThis.liveTest;
            const { oai_settings } = await import('/scripts/openai.js');
            oai_settings.chat_completion_source = 'custom'; oai_settings.custom_model = 'gpt-4.1-mini-2025-04-14';
            const { selectMemory, interleaveHits } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
            const { assistantTopicQueries } = await import('/scripts/extensions/third-party/sillymemory/scripts/assistant-topic-policy.mjs');
            const { assistantFallbackQueries } = await import('/scripts/extensions/third-party/sillymemory/scripts/assistant-fallback-policy.mjs');
            const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
            const prepared = await t.engine.sync(item.snapshot, item.config);
            await t.poll(async () => {
                const hits = await t.client.query(t.memoryCollection, scopeFilter(t.owner, prepared.scope), { size: prepared.docs.length });
                return hits.length === prepared.docs.length && hits.every(h => prepared.docs.some(d => d.id === h.id && d.text === h.text));
            });
            const variants = { baseline: assistantTopicQueries(item.snapshot).baseline, fallback: assistantFallbackQueries(item.snapshot) };
            const searches = new Map();
            for (const query of new Set(Object.values(variants).flat())) searches.set(query, await t.client.search(t.memoryCollection, t.owner, prepared.scope, query));
            const output = {};
            for (const [name, queries] of Object.entries(variants)) {
                const selected = await selectMemory(interleaveHits(queries.map(q => searches.get(q))), prepared.docs, item.config.budget, text => SillyTavern.getContext().getTokenCountAsync(text));
                if (selected.tokens > item.config.budget) throw new Error('Budget invariant failed');
                output[name] = { queries, selected: selected.passages.map(d => d.message), tokens: selected.tokens, evidence: item.evidence.map(ref => ({ message: ref.message, ranks: queries.map(q => searches.get(q).findIndex(d => d.message === ref.message && d.text.includes(ref.quote)) + 1), selected: selected.passages.some(d => d.message === ref.message && d.text.includes(ref.quote)) })) };
            }
            return { case: item.id, kind: item.kind, budget: item.config.budget, variants: output, searches: [...searches].map(([query, hits]) => ({ query, hits })) };
        }, item);
        report.assistantFallback.rows.push(row);
        console.log(`RESULT ${row.case}: ${Object.entries(row.variants).map(([name,v])=>`${name}=${v.evidence.filter(e=>e.selected).length}/${v.evidence.length}`).join(' ')}`);
    }
    const rows = report.assistantFallback.rows;
    report.assistantFallback.qualifies = rows.every(r => r.variants.baseline.evidence.every((e,i) => !e.selected || r.variants.fallback.evidence[i].selected)) && rows.filter(r => r.case.startsWith('fallback-controls/') || r.case.endsWith('-first-user')).every(r => r.variants.fallback.evidence.every(e => e.selected));
}
