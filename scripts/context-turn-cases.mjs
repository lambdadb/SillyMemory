import { capture } from '../src/memory.js';
import { assistantFallbackCases } from './assistant-fallback-cases.mjs';
import { loadNaturalFixture, naturalCases, hash } from './natural-dialogue.mjs';
export function contextTurnCases() {
    const fixture = loadNaturalFixture('context-turn-v1');
    return [...assistantFallbackCases(), ...naturalCases(fixture).map(item => ({
        id: `context-turn-v1/${item.id}`, fixture: fixture.version, fixtureHash: hash(fixture), kind: item.kind, shape: fixture.cases.find(c => c.id === item.id).shape, language: item.language,
        snapshot: capture({ chat: [...item.input.source, { mes: item.input.question, name: 'User', is_user: true }], characterId: 0, characters: [{ avatar: `${item.story}.png` }], chatMetadata: { sillymemory: { version: 1, id: `${fixture.version}/${item.id}`, story: `${fixture.version}/${item.id}` } }, getCurrentChatId: () => `${fixture.version}/${item.id}` }),
        config: { recent: fixture.settings.recent, budget: fixture.settings.budget, chunkChars: 800 }, evidence: item.rubric.requiredEvidence,
    }))];
}
export function contextTurnDecision(rows) {
    const required = ['boundaries/ko-assistant-topic', ...['en','ko'].flatMap(lang => ['assistant-topic','correction'].map(shape => `context-turn-v1/${lang}-fresh-${shape}`))];
    for (const candidate of ['relative', 'topical-latest']) {
        if (required.every(id => rows.find(r => r.case === id)?.variants[candidate].evidence.every(e => e.selected)) && rows.every(r => r.variants.baseline.evidence.every((e,i) => !e.selected || r.variants[candidate].evidence[i].selected))) return candidate;
    }
    return null;
}
