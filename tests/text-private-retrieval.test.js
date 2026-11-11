// Unit evidence for the text-private retrieval experiment (benchmark tooling only).
// Expected analyzer outputs were produced by Lucene 10.4.0 EnglishAnalyzer through
// benchmark/text-private/LuceneParity.java; they are not derived from the JS port.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../benchmark/text-private/analyzer.mjs';
import { documentFrequencies, documentWeights, featureFieldValue, queryWeights, termKey } from '../benchmark/text-private/sparse.mjs';
import { coverage } from '../benchmark/text-private/metrics.mjs';

test('JS English analyzer matches recorded Lucene 10.4.0 tokens', () => {
    const cases = [
        ["Don’t forget Sarah’s birthday — it's James' party.", ['don’t', 'forget', 'sarah', 'birthdai', 'jame', 'parti']],
        ["The dog's bone and the dogs' bones; CHRIS'S car; O'Neill's pub", ['dog', 'bone', 'dog', 'bone', 'chri', 'car', "o'neil", 'pub']],
        ['Version 3.14.159, 1,000,000 items, 2023/05/30 at 10:18, 4th of July, 1990s, $12.50, 50% off, 3x faster.',
            ['version', '3.14.159', '1,000,000', 'item', '2023', '05', '30', '10', '18', '4th', 'juli', '1990', '12.50', '50', 'off', '3x', 'faster']],
        ['Emoji test 😀👍🏽 👨‍👩‍👧 🇰🇷 ❤️ ☕ ✔ © ® ™ #1 *', ['emoji', 'test', '😀', '👍🏽', '👨‍👩‍👧', '🇰🇷', '❤️', '☕', '✔', '©', '®', '™', '1']],
        ['Ünïcödé café naïve façade résumé İstanbul ǅemal ß Straße ﬁnance', ['ünïcödé', 'café', 'naïv', 'façad', 'résumé', 'istanbul', 'ǆemal', 'ß', 'straße', 'ﬁnanc']],
        ['U.S.A. e.g. i.e. Ph.D. a.m. p.m. No. 5', ['u.s.a', 'e.g', 'i.', 'ph.d', 'a.m', 'p.m', '5']],
        ['Hyphen‐nonbreaking‑figure‒en–em—minus−', ['hyphen', 'nonbreak', 'figur', 'en', 'em', 'minu']],
    ];
    for (const [text, expected] of cases) assert.deepEqual(analyze(text), expected, text);
});

test('sparse weights omit empty documents, drop unseen query terms, sum duplicates and cap at 64', () => {
    assert.equal(documentWeights(analyze('the and of to')), null);
    const docs = [analyze('red apple'), analyze('green apple'), analyze('blue sky')];
    const stats = documentFrequencies(docs);
    const q = queryWeights('apple apple banana', stats);
    assert.deepEqual(Object.keys(q), ['appl']);
    assert.ok(Math.abs(q.appl - 2 * Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5))) < 1e-12);
    assert.equal(queryWeights('banana', stats), null);
    const rare = documentFrequencies([['x'], ...Array.from({ length: 1e6 }, () => [])]);
    assert.equal(queryWeights(Array(20).fill('x').join(' '), rare).x, 64);
    assert.match(termKey(Buffer.alloc(32), 'appl'), /^[0-9a-f]{16}$/);
    // Live LambdaDB returned 999424 for a stored weight of 1e6 (FeatureField truncation).
    assert.equal(featureFieldValue(1e6), 999424);
});

test('coverage merges overlapping spans and separates partial from complete', () => {
    const docs = [{ id: 'a', message: 1, start: 0, end: 5, benchmarkSession: 1 }, { id: 'b', message: 1, start: 3, end: 10, benchmarkSession: 1 },
        { id: 'c', message: 2, start: 0, end: 4, benchmarkSession: 2 }];
    const ev = { indexed: [1, 2], answerSessions: new Set([2]), length: new Map([[1, 10], [2, 8]]), byId: new Map(docs.map(d => [d.id, d])) };
    assert.deepEqual(coverage(ev, ['a', 'b', 'c']), { annotated: 2, partial: 1, complete: 1, missing: 0, allComplete: false,
        firstEvidence: 1, firstSession: 3, sessionHit: true });
    assert.equal(coverage(ev, ['a']).partial, 1);
});
