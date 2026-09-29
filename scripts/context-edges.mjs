import { loadNaturalFixture } from './natural-dialogue.mjs';

export function contextEdgeCases() {
    const fixture = loadNaturalFixture('long-dialogue-v1');
    return fixture.stories.flatMap(story => ['first-user', 'assistant-topic', 'explicit-switch'].map(kind => {
        const messages = story.messages.map((m, index) => ({ index, text: m.text, user: kind === 'first-user' ? false : m.role === 'user', name: kind === 'first-user' || m.role === 'assistant' ? story.character : 'User', eligible: true, swipe: 0 }));
        const english = story.language === 'en';
        const append = (text, user) => messages.push({ index: messages.length, text, user, name: user ? 'User' : story.character, eligible: true, swipe: 0 });
        if (kind === 'explicit-switch') {
            append(english ? 'Let us discuss the rolled canal map again.' : '접이식 노선도 이야기를 다시 해요.', true);
            append(english ? 'Yes, we can return to that map.' : '네, 그 노선도에 대해 이야기해요.', false);
        } else append(english ? 'Let us return to the green cloth banner for the reading room.' : '전시실에 걸 자주색 천 현수막 이야기를 다시 해요.', false);
        append(english ? (kind === 'explicit-switch' ? 'Who is bringing the green cloth banner, and when?' : 'Who is bringing it, and when?') : (kind === 'explicit-switch' ? '자주색 천 현수막은 누가 언제 가져오기로 했죠?' : '그건 누가 언제 가져오기로 했죠?'), true);
        return { id: `${story.language}-${kind}`, language: story.language, kind, snapshot: { character: `${story.id}.png`, chat: `${story.language}-${kind}`, messages }, target: { message: 8, text: story.messages[8].text } };
    }));
}

export async function runContextEdges(run, report) {
    report.contextEdges = { version: 'assistant-topic-boundaries-v1', generationCalls: 0, rows: [] };
    for (const item of contextEdgeCases()) {
        const row = await run(`${item.id}: current and historical contextual selection`, async item => {
            const t = globalThis.liveTest;
            const { oai_settings } = await import('/scripts/openai.js');
            oai_settings.chat_completion_source = 'custom'; oai_settings.custom_model = 'gpt-4.1-mini-2025-04-14';
            const { retrievalQueries, selectMemory, interleaveHits } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
            const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
            const config = { recent: 12, budget: 400, chunkChars: 800 }, snapshot = item.snapshot;
            const prepared = await t.engine.sync(snapshot, config);
            await t.poll(async () => {
                const hits = await t.client.query(t.memoryCollection, scopeFilter(t.owner, prepared.scope), { size: prepared.docs.length });
                return hits.length === prepared.docs.length && hits.every(h => prepared.docs.some(d => d.id === h.id && d.text === h.text));
            });
            const currentQueries = retrievalQueries(snapshot);
            const primary = snapshot.messages.at(-1).text.trim().slice(0, 6000);
            const previous = snapshot.messages.slice(0, -1).filter(m => m.text.trim()).slice(-2).reverse();
            const legacyQueries = [...new Set([primary, [primary, ...previous.map(m => m.text.trim())].join('\n').slice(0, 6000)])];
            const hits = new Map(), originalSearch = t.client.search.bind(t.client);
            const search = async (...args) => {
                if (!hits.has(args[3])) hits.set(args[3], await originalSearch(...args));
                return hits.get(args[3]);
            };
            let current;
            try { t.client.search = search; current = await t.engine.retrieve(snapshot, config, text => SillyTavern.getContext().getTokenCountAsync(text)); }
            finally { t.client.search = originalSearch; }
            if (!current) throw new Error('Current retrieval did not complete');
            for (const query of legacyQueries) await search(t.memoryCollection, t.owner, prepared.scope, query);
            const legacy = await selectMemory(interleaveHits(legacyQueries.map(q => hits.get(q))), prepared.docs, config.budget, text => SillyTavern.getContext().getTokenCountAsync(text));
            const summarize = (result, queries) => ({ queries, tokens: result.tokens, selected: result.passages.map(d => d.message), targetSelected: result.passages.some(d => d.message === item.target.message && d.text === item.target.text), targetRanks: queries.map(q => hits.get(q).findIndex(d => d.message === item.target.message && d.text === item.target.text) + 1) });
            if (current.tokens > config.budget || legacy.tokens > config.budget) throw new Error('Budget invariant failed');
            return { case: item.id, kind: item.kind, language: item.language, budget: config.budget, current: summarize(current, currentQueries), legacy: summarize(legacy, legacyQueries) };
        }, item);
        report.contextEdges.rows.push(row);
        console.log(`RESULT ${row.case}: v3=${row.current.targetSelected}, v2=${row.legacy.targetSelected}`);
    }
}
