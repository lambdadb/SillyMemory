import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeNativeSummary,summaryReviewPacket,scoreNativeSummary} from '../scripts/summarize-results.mjs';
import {loadLong,sha} from '../scripts/semantic-long.mjs';
import {summaryFiles} from '../scripts/summarize-plan.mjs';
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
        r=>{r.vectorQueries.push({status:404});},
        r=>{r.nativeTrafficObservation={version:1,embeddingBridge:true,nativeVectorRoutes:true};},
        r=>{r.cleanupComplete=false;},
    ]){const report=read('raw');change(report);assert.throws(()=>summarizeNativeSummary(report));}
});
test('strict summary scoring counts abstention only for unknown controls',()=>{
    const report=read('raw'),annotations=read('assistant-annotations');
    const known=annotations.rows.find(row=>row.expected.type!=='abstain');
    const unknown=annotations.rows.find(row=>row.expected.type==='abstain');
    known.grade='abstained';unknown.grade='abstained';
    const score=scoreNativeSummary(report,annotations);
    assert.equal(score.rows.find(row=>row.id===known.id).strictPass,false);
    assert.equal(score.rows.find(row=>row.id===unknown.id).strictPass,true);
    unknown.grade='correct';
    assert.throws(()=>scoreNativeSummary(report,annotations));
});
test('instrumented continuation cannot verify the unobserved historical prefix',()=>{
    // Synthetic validator input, not a replacement for the checked-in live report.
    const report=read('raw');
    report.nativeTrafficObservation={version:1,embeddingBridge:true,nativeVectorRoutes:true};
    for(const file of summaryFiles){
        const hash=sha(readFileSync(new URL(`../${file}`,import.meta.url)));
        report.initialSourceSha256[file]=hash;report.sourceSha256[file]=hash;
    }
    assert.deepEqual(summarizeNativeSummary(report).nativeTraffic,
        {verified:false,coverage:'current-process-only; resumed history unobserved'});
});
test('summary review cannot rewrite evidence or omit unfavorable answers',()=>{
    const report=read('raw');for(const change of [a=>a.rows.pop(),a=>{a.rows[0].answer='rewritten';},a=>{a.summaryFidelity[0].summary='rewritten';}]){const a=read('assistant-annotations');change(a);assert.throws(()=>scoreNativeSummary(report,a));}
});
