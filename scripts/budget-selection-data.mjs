// Reconstruct synthetic local documents; recorded hits supply only ordering.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { capture, documents, retrievalQueries } from '../src/memory.js';
import { contextTurnCases } from './context-turn-cases.mjs';
import { loadNaturalFixture, naturalCases } from './natural-dialogue.mjs';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
const key = doc => `${doc.message}:${doc.chunk}`;
const fields = ['revision', 'text', 'message', 'chunk', 'speaker', 'role'];
function matchHits(lists, docs) {
    const local = new Map(docs.map(doc => [key(doc), doc]));
    return lists.map(list => list.map(hit => {
        const doc = local.get(key(hit)); assert(doc, 'Recorded hit is outside the local eligible source');
        for (const field of fields) assert.deepEqual(hit[field], doc[field], `Recorded/local mismatch: ${field}`);
        return doc;
    }));
}

// Export once from the retained historical raw search report. Hash it against the
// already checked-in summary, then verify every hit before discarding its text/IDs.
export async function compactSearch(report, bytes) {
    const original = read('docs/results/context-turn-search-v1.json');
    assert.equal(sha(bytes), original.rawSha256, 'Wrong historical search report');
    assert(report.passed && report.cleanupComplete && report.sourceUnchanged);
    const rows = [];
    for (const item of contextTurnCases()) {
        const row = report.contextTurn.rows.find(row => row.case === item.id); assert(row);
        assert.deepEqual(row.variants.relative, original.rows.find(row => row.case === item.id).variants.relative);
        const { docs } = await documents(item.snapshot, 'offline-selection', item.config);
        const queries = retrievalQueries(item.snapshot);
        assert.deepEqual(queries, row.variants.relative.queries);
        const lists = matchHits(queries.map(query => row.searches.find(search => search.query === query).hits), docs);
        rows.push({ case: item.id, lists: lists.map(list => list.map(key)) });
    }
    assert.equal(report.contextTurn.rows.length, rows.length);
    return { version: 'budget-selection-hits-v1', rawSearchSha256: sha(bytes), rows };
}

export async function replayInputs() {
    const compact = read('tests/fixtures/budget-selection-hits-v1.json');
    const search = read('docs/results/context-turn-search-v1.json');
    assert.equal(compact.version, 'budget-selection-hits-v1');
    assert.equal(compact.rawSearchSha256, search.rawSha256);
    const searchCases = contextTurnCases(), inputs = [];
    assert.equal(compact.rows.length, searchCases.length);
    assert.equal(new Set(compact.rows.map(row => row.case)).size, searchCases.length);
    for (const item of searchCases) {
        const row = compact.rows.find(row => row.case === item.id); assert(row);
        const recorded = search.rows.find(row => row.case === item.id); assert(recorded);
        const { docs } = await documents(item.snapshot, 'offline-selection', item.config);
        const local = new Map(docs.map(doc => [key(doc), doc]));
        const queries = retrievalQueries(item.snapshot);
        assert.deepEqual(queries, recorded.variants.relative.queries);
        assert.equal(row.lists.length, queries.length);
        assert.equal(recorded.budget, item.config.budget);
        const lists = row.lists.map(list => list.map(id => { assert(local.has(id), 'Unknown/ineligible passage'); return local.get(id); }));
        inputs.push({ id: `search/${item.id}`, recent: item.config.recent, queries, lists, docs, evidence: item.evidence,
            budgets: [320, 400, 800], originalBudget: recorded.budget, original: recorded.variants.relative, selectionKey: 'message' });
    }
    const fixture = loadNaturalFixture('context-turn-generation-v1');
    const generation = read('docs/results/context-turn-generation-v1.json');
    assert(generation.passed && generation.cleanupComplete && generation.nativeCleanupComplete);
    const effectiveBudget = Math.min(fixture.settings.budget, Math.floor((fixture.settings.context - fixture.settings.maxOutputTokens) / 4));
    assert.equal(effectiveBudget, 320); assert.equal(fixture.settings.recent, 8);
    const cases = new Map(naturalCases(fixture).map(item => [item.id, item]));
    const rows = generation.rows.filter(row => row.mode === 'on');
    assert.equal(rows.length, 32); assert.equal(new Set(rows.map(row => row.id)).size, 32);
    for (const row of rows) {
        const item = cases.get(row.case); assert(item);
        // The real host uses this character label, which contributes to tokens.
        const chat = item.input.source.map(message => ({ ...message, name: message.is_user ? 'User' : 'SillyMemory E2E Mira' }));
        chat.push({ mes: item.input.question, name: 'User', is_user: true });
        const snapshot = capture({ chat, characterId: 0, characters: [{ avatar: 'synthetic.png' }], getCurrentChatId: () => row.id });
        const { docs } = await documents(snapshot, 'offline-selection', { recent: 8, chunkChars: 800 });
        const queries = retrievalQueries(snapshot);
        assert.equal(row.queries.length, queries.length);
        // Request telemetry is in completion order; restore runtime query order.
        const hits = queries.map(query => { const matches = row.queries.filter(search => search.query === query); assert.equal(matches.length, 1); return matches[0].hits; });
        const lists = matchHits(hits, docs);
        const recordedDocs = new Map(hits.flat().map(doc => [doc.id, doc]));
        const selected = row.selectedIds.map(id => { assert(recordedDocs.has(id)); return key(recordedDocs.get(id)); });
        inputs.push({ id: `generation/${row.id}`, recent: 8, queries, lists, docs, evidence: item.rubric.requiredEvidence,
            budgets: [effectiveBudget], originalBudget: effectiveBudget, original: { selected, tokens: row.memoryTokens }, selectionKey: 'passage' });
    }
    return inputs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [input, output] = process.argv.slice(2);
    assert(input && output && process.argv.length === 4, 'Usage: node scripts/budget-selection-data.mjs raw-search.json new-output.json');
    const bytes = readFileSync(input);
    writeFileSync(output, JSON.stringify(await compactSearch(JSON.parse(bytes), bytes), null, 2) + '\n', { flag: 'wx' });
}
