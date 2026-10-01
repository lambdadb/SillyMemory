import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryPlan, summarySettings, summaryRetry } from '../scripts/summarize-plan.mjs';
import { loadLong } from '../scripts/semantic-long.mjs';
test('summary plan pairs every unchanged source with one native-summary and one off answer',()=>{
    const plan=buildSummaryPlan(text=>text.length/2),fixture=loadLong();
    assert.deepEqual(plan.cases,fixture.cases);assert.deepEqual(plan.settings,fixture.settings);assert.deepEqual(plan.generation,fixture.generation);
    assert.equal(plan.schedule.length,32);assert.equal(new Set(plan.schedule.map(row=>row.id)).size,32);
    for(const item of fixture.cases)assert.deepEqual(plan.schedule.filter(row=>row.case===item.id).map(row=>row.mode).sort(),['off','summary']);
    assert.deepEqual(plan.schedule.slice(0,2).map(row=>row.mode),plan.schedule.slice(2,4).map(row=>row.mode).reverse());
    assert.equal(plan.maxSummariesPerCase*plan.cases.length+plan.schedule.length+8,summaryRetry.maxCalls);
    assert.equal(summarySettings.source,'main');assert.equal(summarySettings.prompt_builder,1);assert.equal(summarySettings.promptInterval,0);assert.equal(summarySettings.memoryFrozen,true);
    assert(!fixture.cases.some(item=>summarySettings.prompt.includes(item.question)));
});

test('continuation freezes the interrupted cohort and never treats capacity stop as quality failure',async()=>{
    const {loadSummaryResume}=await import('../scripts/summarize-plan.mjs');
    const resume=loadSummaryResume('docs/results/summarize-v1-interrupted.json');
    const plan=buildSummaryPlan(text=>text.length/2,resume.file);
    assert.equal(plan.resume.sha256,resume.sha256);assert.equal(plan.maxSummariesPerCase,6);
    assert.equal(resume.report.generations.length,34);assert.equal(resume.report.evaluation.rows.length,10);
    assert.equal(resume.report.evaluation.preparation.at(-1).steps.at(-1).to,55);
    assert.deepEqual(plan.summarySettings,resume.report.evaluation.summarySettings);
    assert.equal(plan.transportProtocol.maxCalls,136);
    assert.throws(()=>loadSummaryResume('../.env.local'));
});

test('summary transport cap is finite without expanding other cohorts or default calls',async()=>{
    const {requestWithRetry,NATURAL_RETRY}=await import('../scripts/provider-retry.mjs');
    const send=async()=>new Response('{}',{status:200});
    assert.equal(NATURAL_RETRY.maxCalls,72);
    await requestWithRetry({body:'{}',send,budget:{calls:135,retries:0},attempts:[],maxCalls:136});
    await assert.rejects(requestWithRetry({body:'{}',send,budget:{calls:136,retries:0},attempts:[],maxCalls:136}));
    await assert.rejects(requestWithRetry({body:'{}',send,budget:{calls:104,retries:0},attempts:[],maxCalls:104}));
    await assert.rejects(requestWithRetry({body:'{}',send,budget:{calls:0,retries:0},attempts:[],maxCalls:137}));
});
