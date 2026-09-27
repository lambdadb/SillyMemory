import test from 'node:test';
import assert from 'node:assert/strict';
import { exactSearch, recall, cosine, queryVariants } from '../scripts/retrieval-analysis.mjs';
test('exact search filters before ranking and uses normalized cosine', () => {
    const docs = [{ id:'a',owner:'x',scope:'s',embedding:[1,0] }, { id:'b',owner:'x',scope:'s',embedding:[2,2] }, { id:'foreign',owner:'y',scope:'s',embedding:[1,0] }];
    assert.deepEqual(exactSearch(docs,[10,0],'x','s').map(d=>d.id),['a','b']);
    assert(Math.abs(cosine([2,2],[10,0])-Math.SQRT1_2)<1e-12);
    assert.throws(()=>cosine([0,0],[1,0])); assert.throws(()=>cosine([1],[1,0]));
});
test('recall tolerates boundary ties but detects missed neighbors, duplicates and leakage', () => {
    const exact=[{id:'a',cosine:1},{id:'b',cosine:0.8},{id:'c',cosine:0.8},{id:'d',cosine:0.1}];
    assert.equal(recall(exact,[{id:'a'},{id:'c'}],2).recallAtK,0.5);
    assert.equal(recall(exact,[{id:'a'},{id:'c'}],2).tieAwareRecallAtK,1);
    assert.equal(recall(exact,[{id:'a'},{id:'d'}],2).tieAwareRecallAtK,0.5);
    assert.throws(()=>recall(exact,[{id:'a'},{id:'a'}],2));
    assert.throws(()=>recall(exact,[{id:'a'},{id:'foreign'}],2));
});
test('query controls change ordering and context independently of question instructions', () => {
    const v=queryVariants([{mes:'old'},{mes:'previous'},{mes:'recent'}],'question?');
    assert(v.current.startsWith('previous\nrecent\nquestion?'));
    assert(v.reverse.endsWith('\nrecent\nprevious'));
    assert(v.latest.includes('UNKNOWN')); assert.equal(v.question,'question?');
});
