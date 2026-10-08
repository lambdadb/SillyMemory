import test from 'node:test';
import assert from 'node:assert/strict';
import { contextTurnQueries } from '../scripts/context-turn-policy.mjs';
import { contextTurnCases, contextTurnDecision } from '../scripts/context-turn-cases.mjs';
import { documents } from '../src/memory.js';
import { auditNaturalDialogue, loadNaturalFixture } from '../scripts/natural-dialogue.mjs';

test('context scoring excludes its own candidate turns, ties retain user, and replacements stay outside the anchor', () => {
    const snapshot={messages:[{user:true,text:'Previous topic'},{user:false,text:'Brand new topic'},{user:true,text:'Question'},{user:false,text:'Retained answer'}]};
    for(const type of ['normal','regenerate','swipe']) assert.deepEqual(contextTurnQueries(snapshot,type).queries,['Question','Previous topic']);
    assert.deepEqual(contextTurnQueries(snapshot,'continue').queries,['Retained answer','Question']);
    assert.deepEqual(contextTurnQueries({messages:[{user:false,text:'Opening topic'},{user:true,text:'First question'}]}).queries,['First question','Opening topic']);
    assert.deepEqual(contextTurnQueries({messages:[]}).queries,[]);
});
test('bounded corpus and Unicode text do not grow query count or include an ineligible reference', () => {
    const messages=Array.from({length:300},(_,i)=>({user:false,text:`Reference ${i} about lanterns`,eligible:i>40}));
    messages.push({user:true,text:'Question context'},{user:false,text:'Lanterns'}, {user:true,text:'x'.repeat(7000)});
    const result=contextTurnQueries({messages});
    assert(result.queries.length<=2);assert.equal(result.queries[0].length,6000);
    assert(Object.values(result.scores).every(Number.isFinite));
    const noCorpus=contextTurnQueries({messages:[{user:false,text:'Lanterns',eligible:false},{user:true,text:'Earlier topic'},{user:false,text:'Lanterns'},{user:true,text:'Where?'}]});
    assert.equal(noCorpus.switched,false);
});
test('fixed 62-case corpus keeps every target old and freezes fourteen new shapes', async () => {
    const cases=contextTurnCases();assert.equal(cases.length,62);assert.equal(new Set(cases.map(c=>c.id)).size,62);
    assert.equal(cases.reduce((n,c)=>n+c.evidence.length,0),54);
    for(const item of cases){const {docs}=await documents(item.snapshot,'context-turn-test-owner',item.config);for(const e of item.evidence)assert(docs.some(d=>d.message===e.message&&d.text.includes(e.quote)));}
    assert.equal((await auditNaturalDialogue(loadNaturalFixture('context-turn-v1'))).scheduledSamples,56);
    assert.equal(contextTurnDecision([]),null);
});

test('the runtime query contains every eligible recent turn, with no lexical selection or text truncation', async () => {
    const { retrievalQueries, RETRIEVAL_POLICY } = await import('../src/memory.js');
    assert.equal(RETRIEVAL_POLICY, 'complete-recent-dialogue-v6');
    const messages = Array.from({ length: 15 }, (_, index) => ({ index, user: index % 2 === 0, text: `Turn ${index}`, eligible: true }));
    messages[7].eligible = false;
    messages[10].text = 'Long context '.repeat(600);
    messages[11].text = '  ';
    const [query] = retrievalQueries({ messages });
    assert.deepEqual(JSON.parse(query.split('\n')[1]), messages.slice(3, 14).filter(m => m.eligible && m.text.trim()).map(m => ({ turnId: m.index, role: m.user ? 'user' : 'assistant', text: m.text })));
    assert(query.endsWith('\nTurn 14'));
    for (const m of messages.slice(0, 3)) assert(!query.includes(`"text":"${m.text}"`));
});

test('generation amendment preserves new cases and adds the two historical boundary controls before execution', async () => {
    const { naturalCases, naturalSchedule } = await import('../scripts/natural-dialogue.mjs');
    const search = loadNaturalFixture('context-turn-v1'), generation = loadNaturalFixture('context-turn-generation-v1');
    assert.deepEqual(generation.cases.slice(0,14), search.cases);
    assert.deepEqual(generation.stories.slice(0,2), search.stories);
    assert.equal(generation.settings.context,1536);
    assert.equal(naturalCases(generation).length,16);
    assert.equal(naturalSchedule(generation).length,64);
    assert.equal((await auditNaturalDialogue(generation)).passed,true);
});

test('adoption rejects individual source regressions and follows the frozen candidate priority', async () => {
    // Synthetic selection outcomes; historical search observations are archived.
    const ids = ['boundaries/ko-assistant-topic', ...['en','ko'].flatMap(lang => ['assistant-topic','correction'].map(shape => `context-turn-v1/${lang}-fresh-${shape}`))];
    const rows = ids.map(id => ({ case: id, variants: Object.fromEntries(['baseline','relative','topical-latest'].map(mode => [mode, { evidence: [{ selected: true }] }])) }));
    assert.equal(contextTurnDecision(rows), 'relative');
    const changed = structuredClone(rows), control = changed.find(r => r.case === 'context-turn-v1/ko-fresh-correction');
    control.variants.relative.evidence[0].selected = false;
    assert.equal(contextTurnDecision(changed), 'topical-latest');
    control.variants['topical-latest'].evidence[0].selected = false;
    assert.equal(contextTurnDecision(changed), null);
    assert.equal(contextTurnDecision(rows.filter(r => r.case !== 'boundaries/ko-assistant-topic')), null);
});

test('captured file, media and tool assistant turns cannot supply the contextual query', async () => {
    const { capture, retrievalQueries } = await import('../src/memory.js');
    const captureChat = chat => capture({chat,characterId:0,characters:[{avatar:'test.png'}],chatMetadata: { sillymemory: { version: 1, id: 'special-context', story: 'special-context' } }, getCurrentChatId: () => 'special-context'});
    for (const extra of [{file:{name:'synthetic.txt'}}, {media:[{url:'synthetic'}]}, {tool_invocations:[{name:'synthetic'}]}]) {
        const message = (mes, is_user, extra = {}) => ({mes,is_user,extra});
        const snapshot = captureChat([message('Lantern repair history',false), message('Unrelated schedule',true), message('Lantern repair history',false,extra), message('Who brings it?',true)]);
        assert.equal(snapshot.messages[2].eligible,false);
        for (const type of ['normal','regenerate','swipe','continue']) {
            const turns = JSON.parse(retrievalQueries(snapshot,type)[0].split('\n')[1]);
            assert.deepEqual(turns.map(t => t.turnId), [0,1]);
        }
        snapshot.messages[2].eligible=true;
        assert.deepEqual(JSON.parse(retrievalQueries(snapshot)[0].split('\n')[1]).map(t => t.turnId), [0,1,2]);
        // The no-prior-user fallback must obey the same eligibility rule.
        const fallback = captureChat([message('Plain introduction',false),message('Special introduction',false,extra),message('First question',true)]);
        assert.deepEqual(JSON.parse(retrievalQueries(fallback)[0].split('\n')[1]).map(t => t.text), ['Plain introduction']);
        fallback.messages.shift();
        assert.deepEqual(retrievalQueries(fallback),['First question']);
    }
});
