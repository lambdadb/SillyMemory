import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLong, validateLong, longSchedule, semanticPromptEvidence, hostSource } from '../scripts/semantic-long.mjs';
import { capture, documents, memoryMessages } from '../src/memory.js';
const fixture=loadLong();
async function docsFor(item){const chat=hostSource(item);chat.push({mes:item.question,name:'User',is_user:true});return (await documents(capture({chat,characterId:0,characters:[{avatar:'synthetic.png'}],getCurrentChatId:()=>item.id}),'test-owner',{recent:8,chunkChars:800})).docs;}
const outgoing=docs=>memoryMessages(docs).map(m=>({role:m.is_user?'user':'assistant',content:m.mes}));
test('long fixture preserves all frozen semantic facts and creates 64 balanced isolated samples',()=>{
    validateLong(fixture);const schedule=longSchedule(fixture);assert.equal(schedule.length,64);assert.equal(new Set(schedule.map(s=>s.id)).size,64);
    for(const item of fixture.cases){const samples=schedule.filter(s=>s.case===item.id);assert.equal(samples.filter(s=>s.mode==='on').length,2);assert.equal(samples.filter(s=>s.mode==='off').length,2);assert(samples[0].mode!==samples[2].mode);}
    const changed=structuredClone(fixture);changed.cases[0].evidence[0].quote='new expected fact';assert.throws(()=>validateLong(changed));
    changed.cases[0]=structuredClone(fixture.cases[0]);changed.settings.effectiveBudget=400;assert.throws(()=>validateLong(changed));
});
test('outgoing evidence preserves native roles, source headers and all mandatory context',async()=>{
    for(const item of fixture.cases){const docs=await docsFor(item),required=docs.filter(d=>item.evidence.some(e=>e.message===d.message));const coverage=semanticPromptEvidence(item,required,outgoing(required));
        assert.equal(coverage.prompt.completeEvidence,item.expected.type==='answer'?true:null);assert.deepEqual(coverage.prompt,coverage.memory);
        if(required.length){const wrong=outgoing(required);wrong[0].role=wrong[0].role==='user'?'assistant':'user';assert.throws(()=>semanticPromptEvidence(item,required,wrong),/role changed/);assert.throws(()=>semanticPromptEvidence(item,required,[]),/missing/);}
    }
});
test('off prompt coverage requires real role-correct source turns and unknowns stay null',()=>{
    const item=fixture.cases.find(c=>c.shape==='speaker'&&c.language==='en');
    const prompt=item.messages.slice(0,2).map(m=>({role:m.role,content:m.text}));
    const coverage=semanticPromptEvidence(item,[],prompt);assert.equal(coverage.memory.completeEvidence,false);assert.equal(coverage.prompt.completeEvidence,true);
    prompt[0].role='assistant';assert.equal(semanticPromptEvidence(item,[],prompt).prompt.completeEvidence,false);
    const unknown=fixture.cases.find(c=>c.shape==='unknown');assert.equal(semanticPromptEvidence(unknown,[],[]).prompt.completeEvidence,null);
});
test('source chunk changes, role swaps and removed qualifiers cannot produce a complete prompt',async()=>{
    const item=fixture.cases.find(c=>c.shape==='quotation'&&c.language==='ko'),docs=(await docsFor(item)).filter(d=>d.message<2);
    const changed=structuredClone(docs);changed[0].text='Invented statement';assert.throws(()=>semanticPromptEvidence(item,changed,outgoing(changed)),/chunk changed/);
    const wrong=structuredClone(docs);wrong[0].speaker='Another actor';assert.throws(()=>semanticPromptEvidence(item,wrong,outgoing(wrong)));
    const partial=docs.filter(d=>d.message===1);assert.equal(semanticPromptEvidence(item,partial,outgoing(partial)).prompt.completeEvidence,false);
});
