// Bounded synthetic retrieval diagnosis. No generation API or direct OpenAI call.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { parseEnv } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from './comparison-fixture.mjs';
import { documents, selectMemory } from '../src/memory.js';
import { schema, scopeFilter } from '../src/client.js';
import { exactSearch, recall, queryVariants, normalize } from './retrieval-analysis.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(), revision);
assert.equal(await realpath(path.join(source,'public/scripts/extensions/third-party/sillymemory')),root);
const env = parseEnv(await readFile(path.join(root,'.env.local'),'utf8'));
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
assert(Object.values(credentials).every(Boolean),'Missing LambdaDB connection');
const tag=process.env.SM_ARTIFACT_TAG || 'v1'; assert(/^[a-zA-Z0-9._-]{1,80}$/.test(tag));
const artifactDir=path.join(root,'artifacts'); await mkdir(artifactDir,{recursive:true});
const owner=randomUUID().replaceAll('-',''), managed=`smdiag_${owner}`, mirror=`smcopy_${owner}`;
const pendingPath=path.join(artifactDir,`retrieval-diagnostic-${tag}-pending.json`);
await writeFile(pendingPath,JSON.stringify({owner,collections:[managed,mirror]}),{flag:'wx'});
const work=await mkdtemp(path.join(tmpdir(),'sillymemory-retrieval-'));
const require=createRequire(path.join(source,'package.json')), tokenizer=require('tiktoken').encoding_for_model('gpt-4o');
const countTokens=async text=>tokenizer.encode(text).length+6;
const report={version:'retrieval-diagnostic-v1',startedAt:new Date().toISOString(),host:revision,config:{recent:12,budget:800,chunkChars:800,k:30,dimensions:1536},rows:[],checks:[],requests:[],generationCalls:0};
const vectors={corpus:[],probes:[]};
const check=(condition,name)=>{assert(condition,name);report.checks.push(name);};
let browser,page,server,stage='startup',failed=false;
async function request(collection,suffix,body,method='POST') {
    const out=await page.evaluate(async ({collection,suffix,body,method})=>{
        try {
            const c=globalThis.retrievalClient;
            const data=await c.call((sdk, options)=>{
                const handle=sdk.collection(collection);
                if(suffix==='/docs/upsert')return handle.docs.upsert(body,options);
                if(suffix==='/docs/fetch')return handle.docs.fetch(body,options);
                if(suffix==='/query')return handle.query(body,options);
                throw new Error('Unsupported diagnostic operation');
            });
            return {ok:true,data};
        }
        catch(e){return {ok:false,status:Number(e.status)||0};}
    },{collection,suffix,body,method});
    report.requests.push({stage,operation:suffix||method,status:out.ok?200:out.status});
    if(!out.ok) throw new Error(`LambdaDB operation failed: ${out.status}`);
    return out.data;
}
async function upsert(collection,docs) { for(let i=0;i<docs.length;i+=25) await request(collection,'/docs/upsert',{docs:docs.slice(i,i+25),branch:'main'}); }
async function fetchDocs(collection,ids,consistentRead=true) {
    const docs=[];
    for(let i=0;i<ids.length;i+=25) {
        const r=await request(collection,'/docs/fetch',{ids:ids.slice(i,i+25),includeVectors:true,consistentRead,ref:{kind:'branch',name:'main'}});
        check(r.isDocsInline!==false&&Array.isArray(r.docs),'vector export is inline');
        docs.push(...r.docs.map(x=>x.doc));
    }
    return docs;
}
async function query(collection,field,value,filter) {
    const r=await request(collection,'/query',{query:{knn:{field,...value,k:30,filter}},size:30,consistentRead:true,includeVectors:false,ref:{kind:'branch',name:'main'}});
    check(Array.isArray(r.docs)&&r.isDocsInline!==false,'query returns inline candidates');
    return r.docs.map(x=>({id:x.doc.id,score:x.score,doc:x.doc}));
}
try {
    const config=path.join(work,'config.yaml');await writeFile(config,await readFile(path.join(source,'default/config.yaml')));
    const port=Number(process.env.ST_RETRIEVAL_PORT||18129),url=`http://127.0.0.1:${port}`;
    server=spawn(process.execPath,['server.js','--configPath',config,'--dataRoot',path.join(work,'data'),'--port',String(port),'--listen','false','--browserLaunchEnabled','false','--corsProxy','false'],{cwd:source,stdio:'ignore'});
    let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw new Error('Host exited');try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,'Host startup timeout');
    browser=await chromium.launch();page=await browser.newPage();
    await page.goto(url);await page.getByText('Welcome to SillyTavern!',{exact:true}).waitFor();await page.getByText('Save',{exact:true}).last().click();
    await page.locator('#sillymemory').waitFor({state:'attached',timeout:45000});
    await page.evaluate(async credentials=>{const {LambdaClient}=await import('/scripts/extensions/third-party/sillymemory/src/client.js');globalThis.retrievalClient=new LambdaClient(credentials,credentials.key,{timeoutMs:30000});},credentials);
    stage='create owned collections';
    for(const [name,indexConfigs] of [[managed,schema],[mirror,{...schema,embedding:{type:'vector',dimensions:1536,similarity:'cosine'}}]]) {
        await page.evaluate(async ({name,indexConfigs,owner})=>{await globalThis.retrievalClient.call((sdk,options)=>sdk.createCollection({collectionName:name,indexConfigs,tags:{application:'sillymemory',owner},description:'Synthetic retrieval diagnosis',snapshotRetentionInDays:1},options));},{name,indexConfigs,owner});
    }
    const jobs=[], corpus=[];const probeScope='f'.repeat(64);
    for(const scenario of scenarios) {
        for(const item of scenario.cases) {
            const variants=queryVariants(scenario.messages,item.question);
            const snapshot={character:'diagnostic-mira.png',chat:scenario.id,memory:{story:scenario.id},messages:[...scenario.messages,{name:'User',is_user:true,mes:variants.latest}].map((m,index)=>({index,text:m.mes,name:m.name,user:m.is_user,swipe:0,eligible:true}))};
            const prepared=await documents(snapshot,owner,report.config);
            if(!corpus.some(d=>d.scope===prepared.scope))corpus.push(...prepared.docs);
            const targets=item.required?prepared.docs.filter(d=>item.required.every(p=>normalize(d.text).includes(normalize(p)))).map(d=>d.id):[];
            for(const [variant,text] of Object.entries(variants)) jobs.push({scenario:scenario.id,case:item.id,variant,text,scope:prepared.scope,targets,probeId:`probe_${jobs.length}`});
        }
    }
    const probes=jobs.map(j=>({id:j.probeId,text:j.text,owner,scope:probeScope,revision:'1'}));
    stage='managed corpus/probe upsert';await upsert(managed,[...corpus,...probes]);
    stage='export actual managed vectors';
    const exported=await fetchDocs(managed,[...corpus,...probes].map(d=>d.id));
    const byId=new Map(exported.map(d=>[d.id,d]));
    check(byId.size===corpus.length+probes.length,'every expected vector exported exactly once');
    for(const d of [...corpus,...probes]){const actual=byId.get(d.id);check(actual?.text===d.text&&actual.scope===d.scope&&actual.owner===owner,'exported source matches');check(Array.isArray(actual.embedding)&&actual.embedding.length===1536&&actual.embedding.every(Number.isFinite),'valid 1536-dimensional managed vector');}
    vectors.corpus=corpus.map(d=>byId.get(d.id));vectors.probes=probes.map(d=>byId.get(d.id));
    stage='mirror exact stored vectors';await upsert(mirror,vectors.corpus);
    const copy=await fetchDocs(mirror,corpus.map(d=>d.id));
    check(copy.length===corpus.length,'mirror contains all expected documents');
    for(const d of copy)check(JSON.stringify(d.embedding)===JSON.stringify(byId.get(d.id).embedding),'mirror preserves every vector component');
    // Check committed document visibility separately. Small collections may still
    // use an exact query execution path; this does not prove an ANN graph ran.
    async function committedCount() {
        const r=await request(mirror,'/query',{query:{queryString:{query:`owner:${owner}`}},size:1,includeVectors:false,consistentRead:false,ref:{kind:'branch',name:'main'}});
        return r.total;
    }
    stage='initial committed visibility';
    report.committedCounts={before:await committedCount()};
    report.corpusDocuments=corpus.length;report.probeDocuments=probes.length;
    for(const job of jobs) {
        stage=`${job.scenario}/${job.case}/${job.variant}`;
        const filter=scopeFilter(owner,job.scope), vector=byId.get(job.probeId).embedding;
        const exact=exactSearch(vectors.corpus,vector,owner,job.scope);
        const numeric=await query(mirror,'embedding',{queryVector:vector},filter);
        const managedHits=await query(managed,'embedding',{queryText:job.text},filter);
        check([...numeric,...managedHits].every(r=>r.doc.owner===owner&&r.doc.scope===job.scope),'both server paths respect identical owner/scope filters');
        const expected=corpus.filter(d=>d.scope===job.scope);
        const selected=await selectMemory(managedHits.map(r=>r.doc),expected,800,countTokens);
        const numericSelection=await selectMemory(numeric.map(r=>r.doc),expected,800,countTokens);
        const exactSelection=await selectMemory(exact.slice(0,30).map(r=>byId.get(r.id)),expected,800,countTokens);
        const ranks=job.targets.map(id=>({id,message:byId.get(id).message,exact:exact.findIndex(r=>r.id===id)+1,numeric:numeric.findIndex(r=>r.id===id)+1,managed:managedHits.findIndex(r=>r.id===id)+1,selected:selected.passages.some(p=>p.id===id),numericSelected:numericSelection.passages.some(p=>p.id===id),exactSelected:exactSelection.passages.some(p=>p.id===id)}));
        report.rows.push({...job,exact, numeric:numeric.map(({id,score})=>({id,score})),managed:managedHits.map(({id,score})=>({id,score})),...recall(exact,numeric),managedVsMaterializedQuery:recall(exact,managedHits),ranks,selected:selected.passages.map(d=>({id:d.id,message:d.message,text:d.text})),tokens:selected.tokens});
        console.log(`DONE ${report.rows.length}/${jobs.length} ${stage}: numeric recall=${report.rows.at(-1).recallAtK.toFixed(3)} targets=${ranks.map(r=>`${r.exact}/${r.managed}/${r.selected}`).join(',')||'not indexed'}`);
    }
    stage='final committed visibility';
    report.committedCounts.after=await committedCount();
    report.committedMirrorVisible=report.committedCounts.after===corpus.length;
    if(report.committedMirrorVisible) {
        const committed=await fetchDocs(mirror,corpus.map(d=>d.id),false);
        check(committed.length===corpus.length,'all mirrored documents visible without consistent-read overlay');
    }
    stage='secret persistence audit';
    const stored=await page.evaluate(async()=>{const c=SillyTavern.getContext(),r=await fetch('/api/settings/get',{method:'POST',headers:c.getRequestHeaders(),body:'{}'});return JSON.stringify({local:{...localStorage},session:{...sessionStorage},settings:await r.json()});});
    check(!stored.includes(credentials.key),'key absent from persisted browser/host state');
    report.complete=report.rows.length===36;
} catch(e) {failed=true;report.failure={stage,message:String(e.message).split('\n')[0].slice(0,200)};console.log(`FAIL ${stage}`);}
finally {
    report.cleanup=[];
    if(page&&!page.isClosed())for(const collection of [managed,mirror]) {
        try{await page.evaluate(async({collection,owner})=>{if(!globalThis.retrievalClient)throw new Error('No cleanup client');await globalThis.retrievalClient.deleteOwnedCollection(collection,owner);},{collection,owner});report.cleanup.push({collection,absent:true});}
        catch{report.cleanup.push({collection,absent:false});}
    }
    report.cleanupComplete=report.cleanup.length===2&&report.cleanup.every(x=>x.absent);
    if(report.cleanupComplete)await rm(pendingPath,{force:true});
    report.passed=!failed&&report.complete&&report.cleanupComplete;report.completedAt=new Date().toISOString();report.sourceSha256={};
    for(const file of ['src/client.js','src/memory.js', 'src/time.js','scripts/comparison-fixture.mjs','scripts/retrieval-analysis.mjs','scripts/retrieval-diagnostic.mjs'])report.sourceSha256[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
    const vectorText=JSON.stringify(vectors);report.vectorArtifact=`retrieval-vectors-${tag}.json`;report.vectorSha256=createHash('sha256').update(vectorText).digest('hex');
    let output=JSON.stringify(report,null,2);
    for(const secret of [credentials.key,env.LLM_API_KEY,credentials.endpoint,credentials.project].filter(Boolean)){assert(!vectorText.includes(secret),'Vector artifact secret guard');output=output.replaceAll(secret,'[REDACTED]');}
    await writeFile(path.join(artifactDir,report.vectorArtifact),vectorText);
    await writeFile(path.join(artifactDir,`retrieval-diagnostic-${tag}.json`),output);
    tokenizer.free();await browser?.close();if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}await rm(work,{recursive:true,force:true});
}
process.exitCode=report.passed?0:1;
