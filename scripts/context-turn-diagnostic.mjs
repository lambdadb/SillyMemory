import { contextTurnCases, contextTurnDecision } from './context-turn-cases.mjs';
export async function runContextTurnDiagnostic(run, report) {
    report.contextTurn = { version: 'context-turn-selection-v1', generationCalls: 0, rows: [] };
    for (const item of contextTurnCases()) {
        const row = await run(`${item.id}: frozen context-turn comparison`, async item => {
            const t = globalThis.liveTest;
            const { oai_settings } = await import('/scripts/openai.js');
            oai_settings.chat_completion_source = 'custom'; oai_settings.custom_model = 'gpt-4.1-mini-2025-04-14';
            const { selectMemory, interleaveHits } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
            const { contextTurnQueries } = await import('/scripts/extensions/third-party/sillymemory/scripts/context-turn-policy.mjs');
            const { assistantFallbackQueries } = await import('/scripts/extensions/third-party/sillymemory/scripts/assistant-fallback-policy.mjs');
            const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
            const prepared = await t.engine.sync(item.snapshot, item.config);
            await t.poll(async () => {
                const hits = await t.client.query(t.memoryCollection, scopeFilter(t.owner, prepared.scope), { size: prepared.docs.length });
                return hits.length === prepared.docs.length && hits.every(h => prepared.docs.some(d => d.id === h.id && d.text === h.text));
            });
            const relative = contextTurnQueries(item.snapshot), topical = contextTurnQueries(item.snapshot, 'normal', 1.25, 0.20);
            const variants = { baseline: assistantFallbackQueries(item.snapshot), relative: relative.queries, 'topical-latest': topical.queries };
            const searches = new Map();
            for (const query of new Set(Object.values(variants).flat())) searches.set(query, await t.client.search(t.memoryCollection, t.owner, prepared.scope, query));
            const output = {};
            for (const [name, queries] of Object.entries(variants)) {
                const selected = await selectMemory(interleaveHits(queries.map(q => searches.get(q))), prepared.docs, item.config.budget, text => SillyTavern.getContext().getTokenCountAsync(text));
                if (selected.tokens > item.config.budget) throw new Error('Budget invariant failed');
                output[name] = { queries, selected: selected.passages.map(d => d.message), tokens: selected.tokens, evidence: item.evidence.map(ref => ({ message: ref.message, ranks: queries.map(q => searches.get(q).findIndex(d => d.message === ref.message && d.text.includes(ref.quote)) + 1), selected: selected.passages.some(d => d.message === ref.message && d.text.includes(ref.quote)) })) };
            }
            return { case: item.id, kind: item.kind, shape: item.shape, scores: relative.scores, switched: { relative: relative.switched, 'topical-latest': topical.switched }, budget: item.config.budget, variants: output, searches: [...searches].map(([query, hits]) => ({ query, hits })) };
        }, item);
        report.contextTurn.rows.push(row);
        console.log(`RESULT ${row.case}: ${Object.entries(row.variants).map(([name,v])=>`${name}=${v.evidence.filter(e=>e.selected).length}/${v.evidence.length}`).join(' ')}`);
    }
    report.contextTurn.adopt = contextTurnDecision(report.contextTurn.rows);
}
