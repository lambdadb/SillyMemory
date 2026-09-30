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

test('v5 runtime matches the frozen relative candidate for all 62 cases and generation anchors', async () => {
    const { retrievalQueries, RETRIEVAL_POLICY } = await import('../src/memory.js');
    assert.equal(RETRIEVAL_POLICY, 'latest-anchor-with-context-selection-v5');
    for (const item of contextTurnCases()) for (const type of ['normal', 'regenerate', 'swipe', 'continue']) {
        assert.deepEqual(retrievalQueries(item.snapshot, type), contextTurnQueries(item.snapshot, type).queries, `${item.id}/${type}`);
    }
});

test('v5 reproduces independent live queries and the selected-source decision without hiding baseline losses', async () => {
    const { readFileSync } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const { retrievalQueries } = await import('../src/memory.js');
    const report = JSON.parse(readFileSync(new URL('../docs/results/context-turn-search-v1.json', import.meta.url)));
    assert.equal(report.passed, true); assert.equal(report.cleanupComplete, true); assert.equal(report.sourceUnchanged, true);
    assert.equal(report.rows.length, 62); assert.equal(new Set(report.rows.map(r => r.case)).size, 62);
    assert.equal(contextTurnDecision(report.rows), 'relative');
    for (const item of contextTurnCases()) {
        const row = report.rows.find(r => r.case === item.id); assert(row);
        assert.deepEqual(retrievalQueries(item.snapshot), row.variants.relative.queries);
        assert.equal(row.budget, item.config.budget);
        assert.deepEqual(row.variants.relative.evidence.map(e => e.message), item.evidence.map(e => e.message));
        assert(row.variants.baseline.evidence.every((e, i) => !e.selected || row.variants.relative.evidence[i].selected));
        assert(Object.values(row.variants).every(v => v.tokens <= row.budget));
    }
    for (const file of ['scripts/context-turn-policy.mjs', 'docs/context-turn-evaluation.md', 'tests/fixtures/context-turn-v1.json']) {
        assert.equal(createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex'), report.sourceSha256[file]);
    }
});

test('context selection respects lexical evidence, Unicode normalization and the reference window', async () => {
    const { retrievalQueries } = await import('../src/memory.js');
    const message = (text, user = false, eligible = true) => ({ text, user, eligible });
    const question = message('Who brings it?', true), user = message('Other subject', true), assistant = message('ＬＡＮＴＥＲＮ');
    assert.deepEqual(retrievalQueries({messages:[message('lantern'), user, assistant, question]}), ['Who brings it?', 'ＬＡＮＴＥＲＮ']);
    assert.deepEqual(retrievalQueries({messages:[message('lantern', false, false), user, assistant, question]}), ['Who brings it?', 'Other subject']);
    assert.deepEqual(retrievalQueries({messages:[message('lantern'), ...Array.from({length:256},()=>message('unrelated')), user, assistant, question]}), ['Who brings it?', 'Other subject']);
    assert.deepEqual(retrievalQueries({messages:[message('lantern'), assistant, user, question]}), ['Who brings it?', 'Other subject']);
    assert.deepEqual(retrievalQueries({messages:[message('ab'), user, message('ab'), question]}), ['Who brings it?', 'Other subject']);
    // A candidate's words beyond the same 6,000-unit query boundary cannot steer selection.
    assert.deepEqual(retrievalQueries({messages:[message('lantern'), user, message('x'.repeat(6000)+' lantern'), question]}), ['Who brings it?', 'Other subject']);
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
    const { readFileSync } = await import('node:fs');
    const rows = JSON.parse(readFileSync(new URL('../docs/results/context-turn-search-v1.json', import.meta.url))).rows;
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
    const { preferAssistantContext } = await import('../src/context.js');
    const captureChat = chat => capture({chat,characterId:0,characters:[{avatar:'test.png'}],getCurrentChatId:()=> 'special-context'});
    for (const extra of [{file:{name:'synthetic.txt'}}, {media:[{url:'synthetic'}]}, {tool_invocations:[{name:'synthetic'}]}]) {
        const message = (mes, is_user, extra = {}) => ({mes,is_user,extra});
        const snapshot = captureChat([message('Lantern repair history',false), message('Unrelated schedule',true), message('Lantern repair history',false,extra), message('Who brings it?',true)]);
        assert.equal(snapshot.messages[2].eligible,false);
        assert.equal(preferAssistantContext(snapshot.messages,1,2),false);
        for (const type of ['normal','regenerate','swipe','continue']) assert.deepEqual(retrievalQueries(snapshot,type),['Who brings it?','Unrelated schedule']);
        snapshot.messages[2].eligible=true;
        assert.deepEqual(retrievalQueries(snapshot),['Who brings it?','Lantern repair history']);
        // The no-prior-user fallback must obey the same eligibility rule.
        const fallback = captureChat([message('Plain introduction',false),message('Special introduction',false,extra),message('First question',true)]);
        assert.deepEqual(retrievalQueries(fallback),['First question','Plain introduction']);
        fallback.messages.shift();
        assert.deepEqual(retrievalQueries(fallback),['First question']);
    }
});
