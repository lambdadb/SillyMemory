import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadLong,sha,hostSource,semanticHost} from './semantic-long.mjs';
import {summaryVersion,summarySettings,summaryRetry,summaryFiles,loadSummaryResume} from './summarize-plan.mjs';
import {recordedSource} from './recorded-source.mjs';
import {median} from './three-mode-results.mjs';
import {summarizeProviderSpacing} from './provider-spacing.mjs';
import {summaryTrafficFile,validateSummaryTraffic} from './summary-traffic.mjs';
export function summarizeNativeSummary(report) {
    assert(report.passed&&!report.failure&&!report.incomplete&&report.cleanupComplete&&report.nativeCleanupComplete);
    const f=loadLong(),e=report.evaluation;
    assert(e.complete);assert.equal(e.version,summaryVersion);assert.equal(e.fixtureSha256,sha(JSON.stringify(f)));
    assert.deepEqual(e.settings,f.settings);assert.deepEqual(e.generation,f.generation);assert.deepEqual(e.summarySettings,summarySettings);
    assert.equal(report.sillyTavern,semanticHost);assert.equal(report.hostContextTokens,1536);assert.equal(report.embeddingMode,'none');assert.equal(report.lambdaDB,'unused');
    assert.deepEqual(report.lambdaRequests,[]);assert.deepEqual(report.transportProtocol,summaryRetry);
    let nativeTraffic=validateSummaryTraffic(report);
    const files=nativeTraffic.verified?summaryFiles:summaryFiles.filter(file=>file!==summaryTrafficFile);
    for(const file of files) {assert.equal(report.initialSourceSha256[file],report.sourceSha256[file]);recordedSource(file,report.sourceSha256[file]);}
    for(const [file,hash]of Object.entries(report.sourceSha256))recordedSource(file,hash);
    assert.equal(e.preparation.length,16);assert.equal(e.rows.length,32);
    assert.equal(new Set([...e.preparation,...e.rows].map(row=>row.chatId)).size,48);
    const used=new Set();let cursor=0;
    for(const [caseIndex,item]of f.cases.entries()) {
        const prep=e.preparation[caseIndex],sourceHash=sha(JSON.stringify(hostSource(item).map(m=>({text:m.mes,user:m.is_user,name:m.name}))));
        assert.equal(prep.case,item.id);assert.equal(prep.sourceHash,sourceHash);assert(prep.steps.length>0&&prep.steps.length<=6);
        let previous='',last=-1;
        for(const [i,step]of prep.steps.entries()) {
            assert.equal(step.requestIndex,cursor++);used.add(step.requestIndex);const g=report.generations[step.requestIndex];
            assert.equal(g.kind,'summary');assert.equal(g.summaryCase,item.id);assert.equal(g.summaryStep,i+1);
            assert.equal(step.from,last+1);assert(step.to>=step.from&&step.to<=58);
            const expected=[previous,...item.messages.slice(step.from,step.to+1).map(m=>`${m.speaker}:\n${m.text}`)].filter(Boolean).join('\n\n');
            assert.deepEqual(g.messages,[{role:'system',content:summarySettings.prompt.replace('{{words}}','100')},{role:'user',content:expected}]);
            assert(!JSON.stringify(g.messages).includes(item.question),'Question leaked into summarization');
            assert.equal(g.providerAnswer.trim(),step.summary.trim());assert.equal(g.finishReason,step.finishReason);assert(step.summary.trim());
            previous=step.summary;last=step.to;
        }
        assert.equal(last,58);assert.equal(prep.summary,previous);
        for(const [j,mode]of (caseIndex%2?['summary','off']:['off','summary']).entries()) {
            const row=e.rows[caseIndex*2+j];assert.equal(row.id,`${item.id}/${mode}`);assert.equal(row.case,item.id);assert.equal(row.mode,mode);assert.equal(row.sourceHash,sourceHash);
            assert.equal(row.requestIndex,cursor++);used.add(row.requestIndex);const g=report.generations[row.requestIndex];assert.equal(g.kind,'answer');assert.equal(g.semanticSampleId,row.id);
            assert.equal(g.providerAnswer.trim(),row.answer.trim());assert.equal(g.answer.trim(),row.answer.trim());assert.equal(g.finishReason,'stop');assert.deepEqual(row.usage,g.providerUsage);
            assert.equal(row.summary,mode==='summary'?`[Summary: ${previous}]`:'');
            const text=g.messages.map(m=>m.content).join('\n');assert(text.includes(item.question)&&text.includes(f.generation.instruction));
            if(mode==='summary')assert(g.messages.some(m=>m.content.includes(row.summary)));else assert(!text.includes('[Summary:'));
            const recentPreserved=item.messages.slice(-7).every(m=>text.includes(m.text));assert.equal(row.recentPreserved,recentPreserved);
            assert(Number.isFinite(row.summaryTokens)&&row.summaryTokens>=0);
        }
    }
    assert.equal(used.size,report.generations.length);assert(report.generations.length<=128);
    let calls=0;
    for(const g of report.generations) {
        assert.equal(g.model,f.generation.model);assert.equal(g.upstreamStatus,200);assert.equal(g.requestOptions.temperature,0);assert.equal(g.maxOutputTokens,256);
        assert(['stop','length'].includes(g.finishReason));assert(g.attempts.length>0&&g.attempts.length<=3);
        for(const [i,a]of g.attempts.entries()) {assert(!a.failure);assert.equal(a.number,i+1);assert.match(a.requestSha256,/^[a-f0-9]{64}$/);assert.equal(a.requestSha256,g.attempts[0].requestSha256);if(i===g.attempts.length-1)assert.equal(a.status,200);else assert(summaryRetry.statuses.includes(a.status));}
        calls+=g.attempts.length;
        for(const n of [g.providerUsage.prompt_tokens,g.providerUsage.completion_tokens,g.providerUsage.prompt_tokens_details.cached_tokens,g.generationMs])assert(Number.isFinite(n)&&n>=0);
    }
    assert.equal(calls,report.providerCalls);assert(calls<=136&&calls-report.generations.length<=8);
    let spacing;
    if(report.resume){
        const initial=loadSummaryResume(report.resume.file);assert.equal(initial.sha256,report.resume.sha256);const old=initial.report,n=old.generations.length;
        if(nativeTraffic.verified&&!validateSummaryTraffic(old).verified)nativeTraffic={verified:false,coverage:'current-process-only; resumed history unobserved'};
        assert.equal(report.resume.generations,n);assert.equal(report.resume.providerCalls,old.providerCalls);
        assert.deepEqual(report.generations.slice(0,n),old.generations);assert.deepEqual(e.rows.slice(0,old.evaluation.rows.length),old.evaluation.rows);
        for(const [i,p]of old.evaluation.preparation.entries()){assert.equal(e.preparation[i].case,p.case);assert.deepEqual(e.preparation[i].steps.slice(0,p.steps.length),p.steps);}
        const segments=[summarizeProviderSpacing(old.generations,old.providerSpacing),summarizeProviderSpacing(report.generations.slice(n),report.providerSpacing)];
        const restartBoundaryMs=report.generations[n].startedAt-Date.parse(old.time);assert(restartBoundaryMs>=15000);
        spacing={verified:segments.every(s=>s.verified),segments,restartBoundaryMs,restartEvidence:'wall-clock lower bound from prior report completion to next bridge entry; separate process clocks'};
    }else spacing=summarizeProviderSpacing(report.generations,report.providerSpacing);
    assert(spacing.verified);
    const groups=['off','summary'].map(mode=>{
        const rows=e.rows.filter(row=>row.mode===mode);
        return {mode,samples:rows.length,medianPromptTokens:median(rows.map(r=>r.usage.prompt_tokens)),medianCachedTokens:median(rows.map(r=>r.usage.prompt_tokens_details.cached_tokens)),medianGenerationMs:median(rows.map(r=>report.generations[r.requestIndex].generationMs)),medianSummaryTokens:median(rows.map(r=>r.summaryTokens)),recentPreserved:rows.filter(r=>r.recentPreserved).length};
    });
    const summaries=report.generations.filter(g=>g.kind==='summary');
    return {version:summaryVersion,nativeTraffic,groups,summaryCalls:summaries.length,summaryInputTokens:summaries.reduce((n,g)=>n+g.providerUsage.prompt_tokens,0),summaryOutputTokens:summaries.reduce((n,g)=>n+g.providerUsage.completion_tokens,0),summaryCachedTokens:summaries.reduce((n,g)=>n+(g.providerUsage.prompt_tokens_details.cached_tokens||0),0),summaryCallsPerCase:e.preparation.map(p=>({case:p.case,calls:p.steps.length})),summaryTruncations:summaries.filter(g=>g.finishReason==='length').length,medianSummaryBuildMs:median(e.preparation.map(p=>p.steps.reduce((n,s)=>n+report.generations[s.requestIndex].generationMs,0))),providerCalls:calls,retries:calls-report.generations.length,spacing,cleanupComplete:true,answerQuality:null};
}
export function summaryReviewPacket(report) {
    const f=loadLong();return {version:summaryVersion,reportSha256:sha(JSON.stringify(report)),reviewerType:null,reviewer:null,rows:report.evaluation.rows.map(row=>{const item=f.cases.find(x=>x.id===row.case);return {id:row.id,source:item.messages.slice(0,2),question:item.question,expected:item.expected,summary:row.summary,answer:row.answer,grade:null,rationale:null};}),summaryFidelity:report.evaluation.preparation.map(p=>({case:p.case,summary:p.summary,grade:null,rationale:null}))};
}
export function scoreNativeSummary(report,annotations) {
    const stats=summarizeNativeSummary(report),packet=summaryReviewPacket(report);assert.equal(annotations.version,packet.version);assert.equal(annotations.reportSha256,packet.reportSha256);assert(['assistant','human'].includes(annotations.reviewerType)&&annotations.reviewer);
    assert.equal(annotations.rows.length,32);assert.equal(annotations.summaryFidelity.length,16);
    const rows = packet.rows.map((original, i) => {
        const annotation = annotations.rows[i];
        const { grade, rationale, ...annotatedContent } = annotation;
        const { grade: _grade, rationale: _rationale, ...originalContent } = original;
        assert.deepEqual(annotatedContent, originalContent);
        assert(['correct', 'partial', 'incorrect', 'abstained'].includes(grade));
        assert(rationale?.trim());

        const isUnknownControl = original.expected.type === 'abstain';
        if (isUnknownControl) assert(['abstained', 'incorrect'].includes(grade));
        const strictPass = grade === (isUnknownControl ? 'abstained' : 'correct');
        return { id: annotation.id, mode: report.evaluation.rows[i].mode, grade, strictPass };
    });
    for(const [i,a]of annotations.summaryFidelity.entries()) {const {grade,rationale,...rest}=a,{grade:_g,rationale:_r,...content}=packet.summaryFidelity[i];assert.deepEqual(rest,content);assert(['complete','partial','incorrect','unknown-control'].includes(grade)&&rationale?.trim());}
    return {...stats,provisional:annotations.reviewerType==='assistant',reviewer:annotations.reviewer,groups:stats.groups.map(g=>({...g,strictPasses:rows.filter(r=>r.mode===g.mode&&r.strictPass).length})),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
    const [input,prefix]=process.argv.slice(2);assert(input&&prefix&&process.argv.length===4);const report=JSON.parse(readFileSync(input));
    const stats=summarizeNativeSummary(report);writeFileSync(`${prefix}-summary.json`,JSON.stringify(stats,null,2)+'\n',{flag:'wx'});writeFileSync(`${prefix}-review.json`,JSON.stringify(summaryReviewPacket(report),null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(stats));
}
