import { capture } from '../src/memory.js';
import { contextEdgeCases } from './context-edges.mjs';
import { loadNaturalFixture, naturalCases, hash } from './natural-dialogue.mjs';
const selectionFixtures = ['natural-dialogue-v1', 'speaker-native-v1', 'long-dialogue-v1'];

export function assistantTopicCases() {
    const existing = selectionFixtures.flatMap(version => {
        const fixture = loadNaturalFixture(version);
        return naturalCases(fixture).map(item => ({
            id: `${version}/${item.id}`, fixture: version, fixtureHash: hash(fixture), kind: item.kind, language: item.language,
            config: { recent: fixture.settings.recent, budget: fixture.settings.budget, chunkChars: fixture.settings.chunkChars || 800 },
            snapshot: capture({ chat: [...item.input.source, { mes: item.input.question, name: 'User', is_user: true }], characterId: 0, characters: [{ avatar: `${item.story}.png` }], chatMetadata: { sillymemory: { version: 1, id: `${version}/${item.id}`, story: `${version}/${item.id}` } }, getCurrentChatId: () => `${version}/${item.id}` }),
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
