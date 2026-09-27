// Offline evidence verification. No network calls.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { scenarios } from './comparison-fixture.mjs';
import { exactSearch, recall, queryVariants, normalize } from './retrieval-analysis.mjs';
import { selectMemory } from '../src/memory.js';
const input=process.argv[2],output=process.argv[3];assert(input&&output&&input!==output,'Provide distinct report and output paths');
const sha=v=>createHash('sha256').update(v).digest('hex');
const raw=await readFile(input,'utf8'),r=JSON.parse(raw);
assert(r.passed&&r.cleanupComplete&&r.complete&&r.rows.length===36,'Complete cleaned-up diagnostic required');
const vectorPath=path.join(path.dirname(input),r.vectorArtifact),vectorRaw=await readFile(vectorPath,'utf8');assert.equal(sha(vectorRaw),r.vectorSha256);
const v=JSON.parse(vectorRaw);assert.equal(v.corpus.length,507);assert.equal(v.probes.length,36);
for(const [file,hash]of Object.entries(r.sourceSha256))assert.equal(sha(await readFile(file)),hash,`Evaluated source changed: ${file}`);
const hostSource=process.env.ST_SOURCE||'/tmp/sillymemory-st-source';
assert.equal(execFileSync('git',['-C',hostSource,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),r.host);
const require=createRequire(path.resolve(hostSource,'package.json')),enc=require('tiktoken').encoding_for_model('gpt-4o');
const count=async text=>enc.encode(text).length+6;
const rows=[],seen=new Set();let index=0;
try {
    for(const s of scenarios)for(const item of s.cases)for(const [variant,text]of Object.entries(queryVariants(s.messages,item.question))) {
        const row=r.rows[index],probe=v.probes.find(p=>p.id===`probe_${index}`);index++;
        assert.equal(row.scenario,s.id);assert.equal(row.case,item.id);assert.equal(row.variant,variant);assert.equal(row.text,text);assert.equal(probe.text,text);
        const id=`${s.id}/${item.id}/${variant}`;assert(!seen.has(id));seen.add(id);
        const docs=v.corpus.filter(d=>d.owner===probe.owner&&d.scope===row.scope),byId=new Map(docs.map(d=>[d.id,d]));
        assert.equal(docs.length,s.messages.length-11);
        for(const d of docs)assert.equal(d.text,s.messages[d.message].mes);
        const targets=item.required?docs.filter(d=>item.required.every(t=>normalize(d.text).includes(normalize(t)))).map(d=>d.id):[];
        assert.deepEqual(row.targets,targets);
        const exact=exactSearch(docs,probe.embedding,probe.owner,row.scope);assert.deepEqual(row.exact,exact);
        for(const hits of [row.numeric,row.managed])assert(hits.every((h,i)=>Number.isFinite(h.score)&&(i===0||hits[i-1].score>=h.score)),'Server candidates must be in descending score order');
        const numeric=recall(exact,row.numeric),managed=recall(exact,row.managed);
        assert.equal(row.recallAtK,numeric.recallAtK);assert.equal(row.tieAwareRecallAtK,numeric.tieAwareRecallAtK);
        assert.deepEqual(row.managedVsMaterializedQuery,managed);
        const selected=await selectMemory(row.managed.map(h=>byId.get(h.id)),docs,800,count);
        assert.deepEqual(row.selected,selected.passages.map(d=>({id:d.id,message:d.message,text:d.text})));assert.equal(row.tokens,selected.tokens);assert(row.tokens<=800);
        const ranks=targets.map(id=>({message:byId.get(id).message,exact:exact.findIndex(h=>h.id===id)+1,managed:row.managed.findIndex(h=>h.id===id)+1,selected:selected.passages.some(p=>p.id===id)}));
        for(let i=0;i<ranks.length;i++)for(const key of Object.keys(ranks[i]))assert.deepEqual(ranks[i][key],row.ranks[i][key]);
        rows.push({scenario:s.id,case:item.id,variant,ranks,tokenCount:selected.tokens,numericRecallAt30:numeric.recallAtK,managedProbeRecallAt30:managed.recallAtK});
    }
} finally {enc.free();}
const variants=Object.fromEntries(['current','reverse','latest','question'].map(variant=>{
    const cases=rows.filter(r=>r.variant===variant&&r.ranks.length);
    return [variant,{oldFactQuestions:cases.length,managedCandidateHits:cases.filter(r=>r.ranks.every(x=>x.managed>0)).length,selectedHits:cases.filter(r=>r.ranks.every(x=>x.selected)).length,exactTop30Hits:cases.filter(r=>r.ranks.every(x=>x.exact<=30)).length}];
}));
const summary={version:r.version,report:input,reportSha256:sha(raw),vectorArtifact:vectorPath,vectorSha256:r.vectorSha256,cleanupComplete:r.cleanupComplete,generationCalls:r.generationCalls,committedCounts:r.committedCounts,numericQueries:rows.length,numericRecallAt30Min:Math.min(...rows.map(r=>r.numericRecallAt30)),numericRecallAt30Mean:rows.reduce((a,r)=>a+r.numericRecallAt30,0)/rows.length,managedProbeRecallAt30Min:Math.min(...rows.map(r=>r.managedProbeRecallAt30)),managedProbeExactSetMatches:rows.filter(r=>r.managedProbeRecallAt30===1).length,variants,rows,limits:'The identical-vector comparison covers consistent-read queryVector against a copied corpus. Committed visibility is recorded above; ANN graph execution is not identified by the public API. queryText vectors are internal and may differ from materialized document embeddings; managed/probe differences are not ANN recall measurements. Retrieval success is not generated-answer quality.'};
await writeFile(output,JSON.stringify(summary,null,2));console.log(JSON.stringify({variants,numericRecallAt30Min:summary.numericRecallAt30Min,managedProbeExactSetMatches:summary.managedProbeExactSetMatches,committedCounts:r.committedCounts},null,2));
