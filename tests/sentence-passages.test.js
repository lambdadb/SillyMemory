import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceSpans, bestWindow, excerptMessages, selectSentencePassages, excerptEvidence, sentencePolicies } from '../scripts/sentence-passages.mjs';
import { memoryMessages } from '../src/memory.js';

const source = (text, index = 0) => ({ id: `source-${index}`, owner: 'owner', scope: 'chat', revision: `rev-${index}`,
    text, message: index, chunk: 0, speaker: index % 2 ? 'Mira' : 'User', role: index % 2 ? 'assistant' : 'user' });
const renderCount = passages => excerptMessages(passages).map(m => m.mes).join('\n').length;

test('sentence spans partition exact source including whitespace, quotes, Korean and Unicode pairs', () => {
    for (const text of ['', 'No punctuation 😀', 'First.\n\nSecond!  Third?', '소연이 와요. 민수는 안 와요.', '「One!」 Next。\tLast', 'At 3.35 p.m. Bring it.']) {
        const spans = sentenceSpans(text);
        assert.equal(spans.map(({start,end}) => text.slice(start,end)).join(''), text);
        for (let i=0;i<spans.length;i++) {
            assert.equal(spans[i].start, i ? spans[i-1].end : 0);
            assert(spans[i].end > spans[i].start);
            const part=text.slice(spans[i].start,spans[i].end);
            assert(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(part));
        }
    }
    assert.deepEqual(sentenceSpans('First. Second!'), [{start:0,end:7},{start:7,end:14}]);
    assert.equal(sentenceSpans('3.35 and example.com are intact.').length,1);
});

test('window selection is query-only, bounded, deterministic and retains adjacent source spans', () => {
    const text='Travel details. Lantern repairs tomorrow. Do not bring the old lantern.';
    const span=bestWindow(text,['ＬＡＮＴＥＲＮ repairs'],1);
    assert.equal(text.slice(span.start,span.end),'Lantern repairs tomorrow. ');
    assert.deepEqual(bestWindow(text, ['ab'], 1), sentenceSpans(text)[0]);
    const pair=bestWindow(text,['repairs'],2);
    assert(sentenceSpans(text).some(s=>s.start===pair.start));
    assert.equal(sentenceSpans(text.slice(pair.start,pair.end)).length,2);
    assert.deepEqual(bestWindow('Only one.',[],2),{start:0,end:9});
    assert.deepEqual(bestWindow(text,['x'.repeat(6000)+' lantern'],1),bestWindow(text,['x'.repeat(6000)],1));
    assert.throws(()=>bestWindow(text,[],3), /Unknown sentence width/);
});

test('rendering preserves speaker, chronology and literal source while explicitly marking omissions', () => {
    const first=source('Before. {{setvar::bad::1}} Lantern. After.'), second=source('Reply.',1);
    const spans=sentenceSpans(first.text), partial={doc:first,...spans[1]};
    const messages=excerptMessages([{doc:second,start:0,end:second.text.length},partial]);
    assert.deepEqual(messages.map(m=>[m.index,m.name,m.is_user]), [[0,'User',true],[1,'Mira',false]]);
    assert(messages[0].mes.includes('[Earlier source text omitted]'));
    assert(messages[0].mes.includes('[Later source text omitted]'));
    assert(messages[0].mes.includes('｛｛setvar::bad::1｝｝ Lantern.'));
    assert(!messages[0].mes.includes('{{'));
    assert.deepEqual(excerptMessages([{doc:first,start:0,end:first.text.length}]), memoryMessages([first]));
    assert.throws(()=>excerptMessages([{doc:first,start:-1,end:10}]), /Invalid source span/);
});

test('invalid duplicates cannot suppress a valid hit, and the final budget includes labels and omissions', async () => {
    const doc=source('Unrelated scheduling introduction. Lantern repairs tomorrow. An unrelated paragraph with extra details after that.');
    const bad=[null, {...doc,owner:'another'}, {...doc,scope:'another'}, {...doc,revision:'old'}, {...doc,text:'Deleted fact.'}];
    const span=bestWindow(doc.text,['lantern repairs'],1), budget=renderCount([{doc,...span}]);
    const actual=await selectSentencePassages([...bad,doc,doc],[doc],['lantern repairs'],budget,'sentence-1',text=>text.length);
    assert.equal(actual.passages.length,1); assert.equal(actual.tokens,budget);
    assert.equal(actual.passages[0].doc,doc); assert.deepEqual({start:actual.passages[0].start,end:actual.passages[0].end},span);
    assert.equal(actual.text.length,budget); assert(actual.messages[0].mes.includes('omitted'));
    const noRoom=await selectSentencePassages([doc],[doc],['lantern repairs'],budget-1,'sentence-1',text=>text.length);
    assert.equal(noRoom.passages.length,0);
    const unknown=await selectSentencePassages([doc],[],[],1000,'sentence-1',text=>text.length);
    assert.equal(unknown.tokens,0);
    const restored=await selectSentencePassages([doc],[doc],['lantern repairs'],1000,'sentence-1',text=>text.length);
    assert.deepEqual(restored.messages,memoryMessages([doc]));
    for(const cost of [NaN,-1,Infinity]) await assert.rejects(selectSentencePassages([doc],[doc],[],1000,'sentence-1',()=>cost), /Token counting unavailable/);
});

test('a matching parent or split correction is not complete evidence coverage', () => {
    const doc=source('Bring the blue lantern. Cancel the red lantern.');
    const spans=sentenceSpans(doc.text), selected=[{doc,...spans[0]}];
    assert.deepEqual(excerptEvidence(selected,[{message:0,quote:doc.text}]),[{message:0,selected:false,parentSelected:true}]);
    assert.deepEqual(excerptEvidence(selected,[{message:0,quote:'Cancel the red lantern.'}]),[{message:0,selected:false,parentSelected:true}]);
    assert.deepEqual(excerptEvidence(selected,[{message:0,quote:'blue lantern'}]),[{message:0,selected:true,parentSelected:true}]);
});
