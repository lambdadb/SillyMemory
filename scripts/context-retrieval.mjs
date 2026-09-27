// Held-out synthetic retrieval cases fixed before their first live run.
// This checks real managed retrieval/selection, not generated-answer quality.
export const contextCases = [
    { id: 'english-passport', fact: 'Elena put her burgundy passport inside the ceramic owl in the attic.', context: 'Let us return to Elena and her burgundy passport.', question: 'Where did she put it?', required: 'ceramic owl', wrong: 'An incorrect earlier answer says the passport is at the station.' },
    { id: 'english-lantern', fact: 'Noah stored his copper lantern underneath the observatory staircase.', context: 'I want to ask about Noah and his copper lantern again.', question: 'Where is it kept?', required: 'observatory staircase', wrong: 'An incorrect earlier answer says the lantern is in the pantry.' },
    { id: 'korean-violin', fact: '수아의 흰색 바이올린은 남쪽 음악당의 네 번째 사물함에 보관되어 있다.', context: '다시 수아의 흰색 바이올린 이야기를 해 보자.', question: '그건 어디에 보관했지?', required: '네 번째 사물함', wrong: '잘못된 이전 답변: 바이올린은 북쪽 시장에 있다.' },
    { id: 'topic-switch', fact: 'Elena put her burgundy passport inside the ceramic owl in the attic.', context: 'We were discussing Noah and his copper lantern and its broken handle.', question: 'Where did Elena put her burgundy passport?', required: 'ceramic owl', wrong: 'An incorrect earlier answer says the passport is at the station.' },
];
export async function runContextRetrieval(run, report) {
    report.contextRetrieval = { version: 'heldout-context-v1', generationCalls: 0, rows: [] };
    for (const item of contextCases) {
        const rows = await run(`${item.id}: live contextual retrieval and previous-answer exclusion`, async item => {
            const t = globalThis.liveTest;
            const { retrievalQueries, RETRIEVAL_POLICY } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
            const config = { recent: 6, budget: 800, chunkChars: 800 };
            const messages = Array.from({ length: 80 }, (_, index) => ({ index, name: index % 2 ? 'Mira' : 'User', user: !(index % 2), swipe: 0, eligible: true,
                text: `Routine ${index}: we discussed paper, window repairs, empty baskets and the afternoon weather.` }));
            messages[8].text = item.fact;
            messages[20].text = 'Elena left her blue notebook behind the library curtains.';
            messages[34].text = 'Noah kept his wooden flute in a basket by the kitchen door.';
            messages[46].text = '수아의 검은색 가방은 동쪽 정원의 벤치 밑에 있다.';
            messages[78].text = item.context; messages[78].user = false;
            messages[79].text = item.question; messages[79].user = true;
            const snapshot = { character: 'heldout-context.png', chat: item.id, messages };
            const rows = [];
            const originalSearch = t.client.search.bind(t.client);
            try {
                for (const retainedAnswer of [false, true]) {
                    const snap = structuredClone(snapshot);
                    if (retainedAnswer) snap.messages.push({ index: 80, name: 'Mira', user: false, swipe: 1, eligible: true, text: item.wrong });
                    const prepared = await t.engine.sync(snap, config);
                    const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
                    await t.poll(async () => (await t.client.query(t.memoryCollection, scopeFilter(t.owner, prepared.scope), { size: prepared.docs.length })).length === prepared.docs.length);
                    const calls = [];
                    t.client.search = async (...args) => { const hits = await originalSearch(...args); calls.push({ query: args[3], targetRank: hits.findIndex(h => h.text.includes(item.required)) + 1 }); return hits; };
                    const start = performance.now();
                    const result = await t.engine.retrieve(snap, config, text => SillyTavern.getContext().getTokenCountAsync(text));
                    if (!result || result.tokens > 800 || calls.length !== 2 || calls.some(c => c.query.includes(item.wrong))) throw new Error('Context pipeline invariant failed');
                    rows.push({ case: item.id, retainedAnswer, policy: RETRIEVAL_POLICY, queries: retrievalQueries(snap), calls, targetSelected: result.text.includes(item.required), tokens: result.tokens, elapsedMs: performance.now() - start, inspection: result.text });
                }
            } finally { t.client.search = originalSearch; }
            return rows;
        }, item);
        report.contextRetrieval.rows.push(...rows);
        for (const row of rows) console.log(`RESULT ${row.case}/${row.retainedAnswer ? 'retained-answer' : 'normal'}: ${row.targetSelected ? 'target selected' : 'target missed'}`);
    }
}
