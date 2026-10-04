// Rubrics are kept here/the scorer, never passed into candidate selection.
import assert from 'node:assert/strict';
import { capture, documents, retrievalQueries, interleaveHits } from '../src/memory.js';
import { readFileSync } from 'node:fs';
const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
import { hostSource } from './semantic-long.mjs';
import { validateSemanticCase, sourceExcerpt, evidenceCoverage } from './semantic-evidence.mjs';

async function sourceDocuments(item, id, recent) {
    const chat = hostSource(item); chat.push({ mes: item.question, name: 'User', is_user: true });
    const snapshot = capture({ chat, characterId: 0, characters: [{ avatar: 'synthetic.png' }], chatMetadata: { sillymemory: { version: 1, id: id, story: id } }, getCurrentChatId: () => id });
    return { snapshot, ...(await documents(snapshot, 'offline-context-bundle', { recent, chunkChars: 800 })) };
}
export async function freshBundleInputs() {
    const fixture = read('tests/fixtures/context-bundles-v1.json');
    assert.equal(fixture.version, 'context-bundles-v1'); assert.equal(fixture.cases.length, 16);
    assert.equal(new Set(fixture.cases.map(item => item.id)).size, fixture.cases.length);
    const inputs = [];
    for (const item of fixture.cases) {
        validateSemanticCase(item);
        const { docs } = await sourceDocuments(item, item.id, item.recent);
        const lists = item.rankedMessages.map(list => list.flatMap(message => {
            const parts = docs.filter(doc => doc.message === message); assert(parts.length, 'Synthetic rank outside eligible source');
            // The split-message control ranks the later chunk first. This is
            // declared synthetic input, not a semantic score or an ANN claim.
            return item.shape === 'split-message' && message === 1 ? [...parts].reverse() : parts;
        }));
        inputs.push({ id: `fresh/${item.id}`, corpus: 'fresh-synthetic-ranks', docs, hits: interleaveHits(lists), item, budgets: [320, 400, 800] });
    }
    return inputs;
}
export function coverageFor(item, passages) {
    const excerpts = passages.map(doc => {
        const source = item.messages[doc.message]; assert(source);
        const start = doc.start ?? Array.from(source.text).slice(0, doc.chunk * 800).join('').length;
        assert.equal(source.text.slice(start, start + doc.text.length), doc.text);
        assert.equal(doc.role, source.role); assert.equal(doc.speaker, source.speaker);
        return sourceExcerpt(item, doc.message, start, start + doc.text.length);
    });
    return evidenceCoverage(item, excerpts);
}
export function diagnoseEvidence(item, result, hits, docs) {
    const available = coverageFor(item, docs), retrieved = coverageFor(item, [...new Map(hits.map(doc => [doc.id, doc])).values()]);
    const selected = coverageFor(item, result.passages);
    return selected.units.map((unit, i) => ({ ...unit, available: available.units[i].covered, retrieved: retrieved.units[i].covered,
        reason: unit.covered ? 'selected' : !available.units[i].covered ? 'not-in-eligible-source' : !retrieved.units[i].covered ? 'not-in-retrieved-candidates' : 'not-selected-within-budget' }));
}
