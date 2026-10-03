import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantTopicQueries } from '../scripts/assistant-topic-policy.mjs';
import { assistantTopicCases, candidateDecision } from '../scripts/assistant-topic-diagnostic.mjs';
import { assistantFallbackQueries } from '../scripts/assistant-fallback-policy.mjs';
import { documents } from '../src/memory.js';

const snapshot = (...messages) => ({ messages: messages.map(([user, text]) => ({ user, text })) });
test('assistant context stays before the generation anchor and preserves v3', () => {
    const s = snapshot([true, 'previous user topic'], [false, 'assistant topic'], [true, 'question'], [false, 'replaced answer']);
    for (const type of ['normal', 'regenerate', 'swipe']) {
        const queries = assistantTopicQueries(s, type);
        assert.deepEqual(queries.baseline, assistantFallbackQueries(s, type));
        assert.deepEqual(queries['user-first'], ['question', 'previous user topic', 'assistant topic']);
        assert.deepEqual(queries['assistant-first'], ['question', 'assistant topic', 'previous user topic']);
    }
    assert.deepEqual(assistantTopicQueries(s, 'continue')['user-first'], ['replaced answer', 'question', 'assistant topic']);
    assert.deepEqual(assistantTopicQueries(snapshot([false, 'topic'], [true, 'question']))['user-first'], ['question', 'topic']);
    assert.deepEqual(assistantTopicQueries(snapshot())['user-first'], []);
    assert.deepEqual(assistantTopicQueries(snapshot([false, 'fallback']))['user-first'], ['fallback']);
});

test('queries bound and deduplicate text after trimming, including blank context', () => {
    const long = 'x'.repeat(6100);
    const s = snapshot([true, long], [false, ` ${long} `], [false, ' '], [true, long]);
    for (const queries of Object.values(assistantTopicQueries(s))) assert.deepEqual(queries, ['x'.repeat(6000)]);
});

test('fixed cohort preserves all 32 regression and six boundary source targets', async () => {
    const cases = assistantTopicCases();
    assert.equal(cases.length, 38);
    assert.equal(new Set(cases.map(c => c.id)).size, 38);
    assert.equal(cases.filter(c => !c.evidence.length).length, 6);
    assert.equal(cases.reduce((n, c) => n + c.evidence.length, 0), 32);
    for (const item of cases) {
        const { docs } = await documents(item.snapshot, 'assistant-test-owner', item.config);
        for (const ref of item.evidence) assert(docs.some(d => d.message === ref.message && d.text.includes(ref.quote)));
        const queries = assistantTopicQueries(item.snapshot);
        assert.deepEqual(item.kind === 'first-user' ? queries['user-first'] : queries.baseline, assistantFallbackQueries(item.snapshot));
        assert(Object.values(queries).every(q => q.length <= 3));
    }
});

test('decision requires both recoveries and no individual baseline loss', () => {
    const row = (id, baseline, user, assistant) => ({ case: id, variants: Object.fromEntries([['baseline', baseline], ['user-first', user], ['assistant-first', assistant]].map(([name, selected]) => [name, { evidence: [{ selected }] }])) });
    const rows = [row('boundaries/ko-first-user', false, true, true), row('boundaries/ko-assistant-topic', false, true, true), row('prior-user', true, true, true)];
    assert.equal(candidateDecision(rows), 'user-first');
    rows[2].variants['user-first'].evidence[0].selected = false;
    assert.equal(candidateDecision(rows), 'assistant-first');
    rows[2].variants['assistant-first'].evidence[0].selected = false;
    assert.equal(candidateDecision(rows), null);
    assert.equal(candidateDecision(rows.slice(1)), null);
});
