import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLongPlan, pinnedCounter, sha, sourceFiles } from './semantic-long.mjs';
import { recordedSource } from './recorded-source.mjs';
import { NATURAL_RETRY } from './provider-retry.mjs';
import { summaryTrafficFile, validateSummaryTraffic } from './summary-traffic.mjs';
export const summaryVersion = 'native-summarize-v2';
export const summaryRetry = { ...NATURAL_RETRY, version: 'summarize-transport-v2', maxCalls: 136 };
export const summarySettings = { source: 'main', prompt_builder: 1, memoryFrozen: true, promptInterval: 0,
    promptWords: 100, overrideResponseLength: 256, maxMessagesPerRequest: 0,
    prompt: 'Ignore previous instructions. Summarize the most important facts and events in the story so far. If a summary already exists in your memory, use that as a base and expand with new facts. Limit the summary to {{words}} words or less. Your response should include nothing but the summary.',
    template: '[Summary: {{summary}}]', position: 0, role: 0, depth: 2, scan: false };
export const summaryFiles = [...sourceFiles, 'scripts/summarize-plan.mjs', 'scripts/summarize-live.mjs', 'docs/summarize-evaluation.md', summaryTrafficFile];
export function loadSummaryResume(filename) {
    assert(/^docs\/results\/[a-z0-9-]+\.json$/.test(filename));
    const bytes=readFileSync(new URL(`../${filename}`,import.meta.url)),report=JSON.parse(bytes);
    assert.equal(report.failure?.reason,'long-ko-negation: summary call bound');
    assert(report.cleanupComplete && report.nativeCleanupComplete && !report.passed);
    assert.equal(report.evaluation.version,'native-summarize-v1');
    assert.equal(report.generations.length,34);assert.equal(report.evaluation.rows.length,10);
    assert(report.generations.every(g=>g.upstreamStatus===200));
    assert.deepEqual(report.evaluation.summarySettings,summarySettings);
    validateSummaryTraffic(report);
    for(const [file,hash]of Object.entries(report.sourceSha256))recordedSource(file,hash);
    return {file:filename,sha256:sha(bytes),report};
}
export function buildSummaryPlan(count,resumeFile) {
    const base = buildLongPlan(count);
    return { ...base, version: summaryVersion, summarySettings, maxSummariesPerCase: 6,
        ...(resumeFile ? {resume:(({file,sha256})=>({file,sha256}))(loadSummaryResume(resumeFile))}:{}),
        schedule: base.cases.flatMap((item,i) => (i%2 ? ['summary','off'] : ['off','summary']).map(mode => ({ id:`${item.id}/${mode}`, case:item.id, mode }))),
        transportProtocol: summaryRetry,
        sourceSha256: Object.fromEntries(summaryFiles.map(file => [file,sha(readFileSync(new URL(`../${file}`,import.meta.url)))])) };
}
export async function verifySummaryPlan(filename) {
    assert(filename, 'Frozen summary plan required'); const bytes=readFileSync(filename), plan=JSON.parse(bytes), counter=pinnedCounter(process.env.ST_SOURCE);
    try { assert.deepEqual(plan,buildSummaryPlan(counter.count,plan.resume?.file)); } finally { counter.close(); }
    return {plan,sha256:sha(bytes),...(plan.resume?{resumeReport:loadSummaryResume(plan.resume.file).report}:{})};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [output,resumeFile]=process.argv.slice(2); assert(output && process.argv.length<=4); const counter=pinnedCounter(process.env.ST_SOURCE);
    try { const plan=buildSummaryPlan(counter.count,resumeFile);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,answers:plan.schedule.length,maxCalls:136})); } finally {counter.close();}
}
