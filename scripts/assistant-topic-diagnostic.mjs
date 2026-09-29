import { capture } from '../src/memory.js';
import { contextEdgeCases } from './context-edges.mjs';
import { loadNaturalFixture, naturalCases, hash } from './natural-dialogue.mjs';
import { selectionFixtures } from './selection-diagnostic.mjs';

export function assistantTopicCases() {
    const existing = selectionFixtures.flatMap(version => {
        const fixture = loadNaturalFixture(version);
        return naturalCases(fixture).map(item => ({
            id: `${version}/${item.id}`, fixture: version, fixtureHash: hash(fixture), kind: item.kind, language: item.language,
            config: { recent: fixture.settings.recent, budget: fixture.settings.budget, chunkChars: fixture.settings.chunkChars || 800 },
            snapshot: capture({ chat: [...item.input.source, { mes: item.input.question, name: 'User', is_user: true }], characterId: 0, characters: [{ avatar: `${item.story}.png` }], getCurrentChatId: () => `${version}/${item.id}` }),
            evidence: item.rubric.requiredEvidence,
        }));
    });
    return [...existing, ...contextEdgeCases().map(item => ({ ...item, id: `boundaries/${item.id}`, fixture: 'assistant-topic-boundaries-v1', config: { recent: 12, budget: 400, chunkChars: 800 }, evidence: [{ message: item.target.message, quote: item.target.text }] }))];
}

export function candidateDecision(rows) {
    const qualifies = name => {
        const recovered = ['boundaries/ko-first-user', 'boundaries/ko-assistant-topic'].every(id => rows.find(r => r.case === id)?.variants[name].evidence.every(e => e.selected));
        const noLoss = rows.every(r => r.variants.baseline.evidence.every((e, i) => !e.selected || r.variants[name].evidence[i].selected));
        return recovered && noLoss;
    };
    return ['user-first', 'assistant-first'].find(qualifies) || null;
}

export async function runAssistantTopicDiagnostic(run, report) {
    report.assistantTopic = { version: 'assistant-topic-selection-v1', generationCalls: 0, rows: [] };
    for (const item of assistantTopicCases()) {
        const row = await run(`${item.id}: shared-query assistant-topic comparison`, async item => {
            const t = globalThis.liveTest;
            const { oai_settings } = await import('/scripts/openai.js');
            oai_settings.chat_completion_source = 'custom'; oai_settings.custom_model = 'gpt-4.1-mini-2025-04-14';
            const { retrievalQueries, selectMemory, interleaveHits } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
            const { assistantTopicQueries } = await import('/scripts/extensions/third-party/sillymemory/scripts/assistant-topic-policy.mjs');
            const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
            const prepared = await t.engine.sync(item.snapshot, item.config);
            await t.poll(async () => {
                const hits = await t.client.query(t.memoryCollection, scopeFilter(t.owner, prepared.scope), { size: prepared.docs.length });
                return hits.length === prepared.docs.length && hits.every(h => prepared.docs.some(d => d.id === h.id && d.text === h.text));
            });
            const variants = assistantTopicQueries(item.snapshot);
            if (JSON.stringify(variants.baseline) !== JSON.stringify(retrievalQueries(item.snapshot))) throw new Error('Baseline drift');
            const searches = new Map();
            for (const query of new Set(Object.values(variants).flat())) searches.set(query, await t.client.search(t.memoryCollection, t.owner, prepared.scope, query));
            const output = {};
            for (const [name, queries] of Object.entries(variants)) {
                const selected = await selectMemory(interleaveHits(queries.map(q => searches.get(q))), prepared.docs, item.config.budget, text => SillyTavern.getContext().getTokenCountAsync(text));
                if (selected.tokens > item.config.budget) throw new Error('Budget invariant failed');
                output[name] = { queries, selected: selected.passages.map(d => d.message), tokens: selected.tokens,
                    evidence: item.evidence.map(ref => ({ message: ref.message, ranks: queries.map(q => searches.get(q).findIndex(d => d.message === ref.message && d.text.includes(ref.quote)) + 1), selected: selected.passages.some(d => d.message === ref.message && d.text.includes(ref.quote)) })) };
            }
            return { case: item.id, fixture: item.fixture, fixtureHash: item.fixtureHash, kind: item.kind, language: item.language, budget: item.config.budget, variants: output, searches: [...searches].map(([query, hits]) => ({ query, hits })) };
        }, item);
        report.assistantTopic.rows.push(row);
        console.log(`RESULT ${row.case}: ${Object.entries(row.variants).map(([name, v]) => `${name}=${v.evidence.filter(e => e.selected).length}/${v.evidence.length}`).join(' ')}`);
    }
    report.assistantTopic.adopt = candidateDecision(report.assistantTopic.rows);
}
