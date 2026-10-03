// Real SillyTavern adapter: the browser gets only source text and the question.
import assert from 'node:assert/strict';
import { hostSource, semanticPromptEvidence, sha } from './semantic-long.mjs';
import { configureNative, setNative, indexNative, nativePromptEvidence } from './three-mode-native.mjs';
const sourceView = source => source.map(m=>({text:m.mes,user:m.is_user,name:m.name}));
export async function runSemanticDialogue({page,field,openSettings,waitStatus,generate,assert:check,setStage,result,frozen,checkpoint,bridgeUrl,vectorQueries}){
    const {plan}=frozen,cases=new Map(plan.cases.map(item=>[item.id,item]));
    Object.assign(result,{version:plan.version,planSha256:frozen.sha256,settings:plan.settings,generation:plan.generation,fixtureSha256:plan.fixtureSha256,rows:[],preparation:[],complete:false});
    if (plan.nativeSettings) { result.nativeSettings = plan.nativeSettings; await configureNative(page, bridgeUrl, plan.nativeSettings); }
    const enable=async value=>{await openSettings();if(await field('enabled').isChecked()!==value)await field('enabled').setChecked(value);if(value)await waitStatus('synchronized');};
    await field('recent').fill(String(plan.settings.recent));await field('recent').dispatchEvent('change');
    await field('budget').fill(String(plan.settings.budget));await field('budget').dispatchEvent('change');
    await page.evaluate(async()=>{
        const {MemoryEngine,documents}=await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const {LambdaClient}=await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const retrieve=MemoryEngine.prototype.retrieve,search=LambdaClient.prototype.search;
        MemoryEngine.prototype.retrieve=async function(...args){const started=performance.now();const expected=await documents(args[0],this.owner,args[1]);const selected=await retrieve.apply(this,args);globalThis.semanticRetrieval={elapsedMs:performance.now()-started,config:{...args[1]},snapshot:args[0],expected:expected.docs,selected,hostTokens:selected?.text?await SillyTavern.getContext().getTokenCountAsync(selected.text):0};return selected;};
        LambdaClient.prototype.search=async function(...args){const started=performance.now();const hits=await search.apply(this,args);globalThis.semanticQueries.push({query:args[3],hits,elapsedMs:performance.now()-started});return hits;};
    });
    const chats=new Set();
    for(const [index,sample]of plan.schedule.entries()){
        const item=cases.get(sample.case),source=hostSource(item),sourceHash=sha(JSON.stringify(sourceView(source))),chatId=`semantic-${index}-${sample.id.replaceAll('/','-')}`;
        setStage(`semantic/${sample.id}/prepare`);await enable(false);
        if (plan.nativeSettings) await setNative(page, false);
        await page.evaluate(async({source,chatId})=>{const c=SillyTavern.getContext();await c.openCharacterChat(chatId);c.chat.splice(0,c.chat.length,...source);await c.saveChat();await c.reloadCurrentChat();},{source,chatId});
        const before=await page.evaluate(async()=>{const c=SillyTavern.getContext();return {id:c.getCurrentChatId(),source:c.chat.map(m=>({text:m.mes,user:m.is_user,name:m.name})),tokens:await c.getTokenCountAsync(c.chat.map(m=>m.mes).join('\n'))};});
        check(!chats.has(before.id)&&before.id===chatId,`${sample.id}: isolated chat`);chats.add(before.id);
        check(sha(JSON.stringify(before.source))===sourceHash,`${sample.id}: exact source restored`);
        check(before.tokens>plan.settings.context,`${sample.id}: actual host source exceeds context`);
        const syncStarted=performance.now();await enable(sample.mode==='on');
        if (sample.insert !== undefined) await page.evaluate(insert => {
            $('#vectors_insert').val(insert).trigger('input');
            if (SillyTavern.getContext().extensionSettings.vectors.insert !== insert) throw new Error('Native Insert# setting did not apply');
        }, sample.insert);
        const nativeIndex = sample.mode === 'vectors' ? await indexNative(page) : null;
        result.preparation.push({id:sample.id,sourceTokens:before.tokens,syncMs:performance.now()-syncStarted,...(nativeIndex ? { nativeIndex } : {})});
        await page.evaluate(()=>{globalThis.semanticRetrieval=null;globalThis.semanticQueries=[];});
        const queryStart = vectorQueries?.length || 0;
        const output=await generate(`semantic/${sample.id}`,'normal',false,{question:item.question,evaluate:true});
        const after=await page.evaluate(length=>SillyTavern.getContext().chat.slice(0,length).map(m=>({text:m.mes,user:m.is_user,name:m.name})),source.length);
        check(sha(JSON.stringify(after))===sourceHash&&output.chatLength===source.length+2,`${sample.id}: source preserved after generation`);
        const telemetry=await page.evaluate(()=>({retrieval:globalThis.semanticRetrieval,queries:globalThis.semanticQueries}));
        const selected=telemetry.retrieval?.selected,passages=selected?.passages||[],prompt=output.request.messages;
        const promptText=prompt.map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
        if(sample.mode==='off')check(!telemetry.retrieval&&!promptText.includes('Past conversation excerpt'),`${sample.id}: memory disabled`);
        else if (sample.mode === 'on'){
            check(Boolean(selected),`${sample.id}: retrieval succeeded without fallback`);
            check(telemetry.retrieval.config.budget===plan.settings.effectiveBudget&&telemetry.retrieval.config.recent===plan.settings.recent,`${sample.id}: observed effective budget and recent window`);
            const expected=new Map(telemetry.retrieval.expected.map(doc=>[doc.id,doc]));
            check(passages.every(doc=>JSON.stringify(doc)===JSON.stringify(expected.get(doc.id))),`${sample.id}: exact current local source documents`);
            check(selected.tokens===telemetry.retrieval.hostTokens&&selected.tokens<=plan.settings.effectiveBudget,`${sample.id}: actual token count within effective cap`);
        }
        let nativePrompt = '', nativeTokens = 0, nativeQuery;
        if (plan.nativeSettings) {
            const native = await page.evaluate(async () => { const c = SillyTavern.getContext(), text = c.extensionPrompts['3_vectors']?.value || ''; return { text, tokens: text ? await c.getTokenCountAsync(text) : 0 }; });
            if (sample.mode === 'vectors') {
                check(!telemetry.retrieval && !promptText.includes('Past conversation excerpt'), `${sample.id}: SillyMemory disabled`);
                check(vectorQueries.length === queryStart + 1 && vectorQueries.at(-1).status === 200, `${sample.id}: native query succeeded`);
                nativePrompt = native.text; nativeTokens = native.tokens; nativeQuery = vectorQueries.at(-1);
            } else check(!native.text && vectorQueries.length === queryStart, `${sample.id}: native memory disabled`);
        }
        const coverage=sample.mode === 'vectors' ? nativePromptEvidence(item,nativePrompt,prompt) : semanticPromptEvidence(item,passages,prompt);check(true,`${sample.id}: outgoing roles source headers and evidence verified`);
        const recentPreserved = source.slice(-(plan.settings.recent-1)).every(m=>promptText.includes(m.mes.trim()));
        check((sample.insert !== undefined || recentPreserved)&&promptText.includes(item.question),`${sample.id}: question retained and recent-history status recorded`);
        check(promptText.includes(plan.generation.instruction),`${sample.id}: fixed instruction retained`);
        check(output.request.requestOptions.temperature===plan.generation.temperature&&output.request.maxOutputTokens===plan.settings.maxOutputTokens&&output.request.model===plan.generation.model,`${sample.id}: fixed generation settings`);
        const sourceMessagesPresent=source.filter(m=>promptText.includes(m.mes.trim())).length;
        if(sample.mode==='off')check(sourceMessagesPresent<source.length,`${sample.id}: baseline actually truncated`);
        assert.equal(coverage.memory.answerQuality,null);
        result.rows.push({...sample,index,language:item.language,shape:item.shape,chatId,sourceHash,sourceTokens:before.tokens,sourceMessagesPresent,answer:output.last,passages,memoryTokens:sample.mode === 'vectors' ? nativeTokens : selected?.tokens||0,effectiveBudget:telemetry.retrieval?.config.budget??null,coverage,queries:telemetry.queries,usage:output.request.providerUsage??null,...(plan.nativeSettings ? { nativePrompt, nativeQuery } : {}),...(sample.insert !== undefined ? { recentPreserved } : {})});
        output.request.semanticSampleId=sample.id;await checkpoint();console.log(`RESULT ${sample.id}: integrity passed; answer quality ungraded`);
    }
    result.complete=result.rows.length===plan.schedule.length;
}
