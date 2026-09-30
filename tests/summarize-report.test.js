import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeNativeSummary,summaryReviewPacket,scoreNativeSummary} from '../scripts/summarize-results.mjs';
import {loadLong,sha} from '../scripts/semantic-long.mjs';
const read=suffix=>JSON.parse(readFileSync(new URL(`../docs/results/summarize-v2-${suffix}.json`,import.meta.url)));
test('actual-host summary evidence, usage and provisional annotations revalidate',()=>{
    const report=read('raw');assert.deepEqual(summarizeNativeSummary(report),read('summary'));assert.deepEqual(summaryReviewPacket(report),read('review'));assert.deepEqual(scoreNativeSummary(report,read('assistant-annotations')),read('assistant-score'));
    assert.equal(sha(readFileSync(new URL('../docs/results/summarize-v2-plan.json',import.meta.url))),report.evaluation.planSha256);
    for(const row of report.evaluation.rows){const item=loadLong().cases.find(item=>item.id===row.case);const messages=report.generations[row.requestIndex].messages;assert.deepEqual(messages.slice(-8,-1),item.messages.slice(-7).map(m=>({role:m.role,content:m.text})));assert.equal(messages.at(-1).content,item.question);}
});
test('summary verifier rejects skipped sources, question leakage, undelivered summaries and foreign traffic',()=>{
    for(const change of [
        r=>r.evaluation.rows.pop(),
        r=>{r.evaluation.preparation[0].steps[1].from++;},
        r=>{r.evaluation.preparation[0].steps[0].summary='invented';},
        r=>{r.generations[0].messages[1].content+=' '+loadLong().cases[0].question;},
        r=>{r.generations[r.evaluation.rows.find(x=>x.mode==='summary').requestIndex].messages=[];},
        r=>{r.generations[r.evaluation.rows[0].requestIndex].providerAnswer='rewritten';},
        r=>{r.evaluation.summarySettings.promptWords=200;},
        r=>{r.lambdaRequests.push({method:'GET',path:'/collections/foreign'});},
        r=>{r.embeddings.push({status:200});},
        r=>{r.cleanupComplete=false;},
    ]){const report=read('raw');change(report);assert.throws(()=>summarizeNativeSummary(report));}
});
test('summary review cannot rewrite evidence or omit unfavorable answers',()=>{
    const report=read('raw');for(const change of [a=>a.rows.pop(),a=>{a.rows[0].answer='rewritten';},a=>{a.summaryFidelity[0].summary='rewritten';}]){const a=read('assistant-annotations');change(a);assert.throws(()=>scoreNativeSummary(report,a));}
});
