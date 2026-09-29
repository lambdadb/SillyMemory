// Development comparison, never an oracle-driven runtime query or reranker.
import { loadNaturalFixture, naturalCases, hash } from './natural-dialogue.mjs';

export const selectionFixtures = ['natural-dialogue-v1', 'speaker-native-v1', 'long-dialogue-v1'];
export async function runSelectionDiagnostic(run, report) {
    report.selection = { version: 'context-selection-v1', generationCalls: 0, rows: [], fixtures: {} };
    await run('OpenAI host tokenizer configured without a generation connection', async () => {
        const { oai_settings } = await import('/scripts/openai.js');
        oai_settings.chat_completion_source = 'custom';
        oai_settings.custom_model = 'gpt-4.1-mini-2025-04-14';
    });
    for (const version of selectionFixtures) {
        const fixture = loadNaturalFixture(version);
        report.selection.fixtures[version] = hash(fixture);
        for (const item of naturalCases(fixture)) {
            const row = await run(`${version}/${item.id}: shared-candidate selection comparison`, async ({ version, item, config }) => {
                const t = globalThis.liveTest;
                const { capture, selectMemory, interleaveHits } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
                const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
                const chat = [...item.input.source, { mes: item.input.question, name: 'User', is_user: true }];
                const snapshot = capture({ chat, characterId: 0, characters: [{ avatar: `${item.story}.png` }], getCurrentChatId: () => `${version}/${item.id}` });
                const prepared = await t.engine.sync(snapshot, config);
                await t.poll(async () => {
                    const rows = await t.client.query(t.memoryCollection, scopeFilter(t.owner, prepared.scope), { size: prepared.docs.length });
                    return rows.length === prepared.docs.length && rows.every(hit => prepared.docs.some(doc => doc.id === hit.id && doc.text === hit.text));
                });
                const primary = item.input.question.trim().slice(0, 6000);
                const preceding = snapshot.messages.slice(0, -1).filter(m => m.text.trim()).slice(-2).reverse();
                const context = preceding.map(m => m.text.trim()).join('\n').slice(0, 6000);
                const priorUser = snapshot.messages.slice(0, -1).findLast(m => m.user && m.text.trim())?.text.trim().slice(0, 6000);
                const variants = {
                    baseline: [primary, [primary, ...preceding.map(m => m.text.trim())].join('\n').slice(0, 6000)],
                    'context-only': [primary, context],
                    'prior-user': [primary, priorUser],
                };
                const results = new Map();
                // One request per distinct text; all policies reuse exactly these hits.
                for (const query of new Set(Object.values(variants).flat().filter(Boolean))) {
                    results.set(query, await t.client.search(t.memoryCollection, t.owner, prepared.scope, query));
                }
                const evidence = item.rubric.requiredEvidence;
                const variantsResult = {};
                for (const [name, texts] of Object.entries(variants)) {
                    const queries = [...new Set(texts.filter(Boolean))];
                    const selected = await selectMemory(interleaveHits(queries.map(q => results.get(q))), prepared.docs, config.budget, text => SillyTavern.getContext().getTokenCountAsync(text));
                    variantsResult[name] = { queries, selected: selected.passages.map(d => d.message), tokens: selected.tokens,
                        evidence: evidence.map(ref => ({ message: ref.message, ranks: queries.map(q => results.get(q).findIndex(d => d.message === ref.message && d.text.includes(ref.quote)) + 1), selected: selected.passages.some(d => d.message === ref.message && d.text.includes(ref.quote)) })) };
                }
                return { fixture: version, case: item.id, kind: item.kind, budget: config.budget, variants: variantsResult,
                    searches: [...results].map(([query, hits]) => ({ query, hits })) };
            }, { version, item, config: { recent: fixture.settings.recent, budget: fixture.settings.budget, chunkChars: fixture.settings.chunkChars || 800 } });
            report.selection.rows.push(row);
            console.log(`RESULT ${version}/${item.id}: ${Object.entries(row.variants).map(([name, v]) => `${name}=${v.evidence.filter(e => e.selected).length}/${v.evidence.length}`).join(' ')}`);
        }
    }
}
