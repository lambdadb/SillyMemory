import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeCases, gradeChallenge } from '../scripts/recall-challenges.mjs';
import { capture, retrievalQueries } from '../src/memory.js';
test('challenge fixtures cover all language/type pairs and keep target facts outside recent source', () => {
    const cases = challengeCases();
    assert.equal(new Set(cases.map(c => c.id)).size, 6);
    assert.deepEqual(cases, challengeCases());
    for (const item of cases) {
        assert(item.source[4].mes.includes(item.label));
        assert(!item.source.slice(-12).some(m => m.mes.includes(item.label)));
        assert.equal(item.source.filter(m => m.mes.includes(item.label)).length, 1);
        const snapshot = capture({ groupId: null, characterId: 0, characters: [{ avatar: 'fixture.png' }], getCurrentChatId: () => item.id, chat: item.source });
        if (item.type === 'continue') {
            assert(snapshot.messages.slice(-7).every(m => !m.user));
            assert(retrievalQueries(snapshot).every(q => !q.includes(item.language === 'ko' ? '수아' : 'Mira')));
        }
    }
});
test('label grader rejects guesses, alternatives and non-answers without accepting substring collisions', () => {
    assert(gradeChallenge('CEDAR-741.', 'CEDAR-741'));
    for (const wrong of ['UNKNOWN', 'not CEDAR-741', 'CEDAR-7410', 'CEDAR-741 or RUBY-592', '']) assert(!gradeChallenge(wrong, 'CEDAR-741'));
});
