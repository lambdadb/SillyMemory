import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantTopicQueries } from '../scripts/assistant-topic-policy.mjs';
import { assistantFallbackQueries } from '../scripts/assistant-fallback-policy.mjs';
import { assistantFallbackCases } from '../scripts/assistant-fallback-cases.mjs';
import { documents, retrievalQueries } from '../src/memory.js';

test('fallback never overrides a previous nonempty user topic or includes a replaced answer', () => {
    const snapshot = { messages: [{user:false,text:'topic'}, {user:true,text:'  '}, {user:true,text:'question'}, {user:false,text:'wrong answer'}] };
    for (const type of ['normal','regenerate','swipe']) assert.deepEqual(assistantFallbackQueries(snapshot,type), ['question','topic']);
    assert.deepEqual(assistantFallbackQueries(snapshot,'continue'), ['wrong answer','question']);
    snapshot.messages.unshift({user:true,text:'older user topic'});
    assert.deepEqual(assistantFallbackQueries(snapshot), ['question','older user topic']);
    assert.deepEqual(assistantFallbackQueries({messages:[]}), []);
    assert.deepEqual(assistantFallbackQueries({messages:[{user:false,text:'intro'}]}), ['intro']);
    assert.deepEqual(assistantFallbackQueries({messages:[{user:false,text:'x'.repeat(7000)}, {user:true,text:' x'.trim().repeat(7000)}]}), ['x'.repeat(6000)]);
});

test('48-case fallback comparison preserves indexable targets and all existing-user query contracts', async () => {
    const cases = assistantFallbackCases();
    assert.equal(cases.length,48); assert.equal(new Set(cases.map(c=>c.id)).size,48);
    assert.equal(cases.reduce((n,c)=>n+c.evidence.length,0),42);
    for (const item of cases) {
        const {docs}=await documents(item.snapshot,'fallback-test-owner',item.config);
        for (const e of item.evidence) assert(docs.some(d=>d.message===e.message && d.text.includes(e.quote)));
        const candidate=assistantFallbackQueries(item.snapshot);
        const baseline=assistantTopicQueries(item.snapshot).baseline;
        assert(candidate.length<=2);
        if(baseline.length===2) assert.deepEqual(candidate,baseline);
        if(item.kind==='retained-answer') assert(!candidate.includes(item.snapshot.messages.at(-1).text));
    }
});

test('runtime exactly matches the frozen candidate for every comparison case and generation anchor', () => {
    for(const item of assistantFallbackCases()) for(const type of ['normal','regenerate','swipe','continue']) {
        assert.deepEqual(retrievalQueries(item.snapshot,type),assistantFallbackQueries(item.snapshot,type));
    }
});

test('frozen first-user generation corpus covers both languages and all three shapes without answer leakage', async () => {
    const {loadNaturalFixture,naturalCases,naturalSchedule,auditNaturalDialogue}=await import('../scripts/natural-dialogue.mjs');
    const fixture=loadNaturalFixture('assistant-fallback-v1');
    assert.equal(naturalCases(fixture).length,6); assert.equal(naturalSchedule(fixture).length,24);
    for(const item of naturalCases(fixture)) {
        assert(item.input.source.every(m=>!m.is_user));
        assert(item.input.source.every(m=>m.name==='SillyMemory E2E Mira'));
    }
    assert.equal((await auditNaturalDialogue(fixture)).passed,true);
});

test('runtime reproduces every independently recorded fallback query and retains the known unresolved case', async () => {
    const {readFileSync}=await import('node:fs');
    const report=JSON.parse(readFileSync(new URL('../docs/results/assistant-fallback-search-v1.json',import.meta.url)));
    const cases=assistantFallbackCases();
    assert.equal(report.rows.length,48);assert.equal(new Set(report.rows.map(r=>r.case)).size,48);
    assert.equal(report.qualifies,true);assert.equal(report.cleanupComplete,true);assert.equal(report.sourceUnchanged,true);
    for(const item of cases){
        const row=report.rows.find(r=>r.case===item.id);assert(row);
        assert.deepEqual(retrievalQueries(item.snapshot),row.variants.fallback.queries);
        assert(row.variants.baseline.evidence.every((e,i)=>!e.selected||row.variants.fallback.evidence[i].selected));
    }
    const missing=report.rows.filter(r=>r.variants.fallback.evidence.some(e=>!e.selected)).map(r=>r.case);
    assert.deepEqual(missing,['boundaries/ko-assistant-topic']);
});
