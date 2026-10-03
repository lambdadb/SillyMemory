// Offline human annotation form. It accepts only the blinded packet, never its key.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateReviewPacket(packet) {
    const exactKeys = (value, keys) => assert.deepEqual(Object.keys(value).sort(), keys.sort(), 'Only blinded review fields are accepted');
    exactKeys(packet, ['version', 'reportHash', 'reviewer', 'reviewerType', 'records']);
    assert.equal(packet.version, 'natural-human-review-v1');
    assert.match(packet.reportHash, /^[a-f0-9]{64}$/);
    assert.equal(packet.reviewerType, 'human', 'Use the unfilled human packet, not assistant annotations');
    assert(packet.reviewer === null || typeof packet.reviewer === 'string');
    assert(Array.isArray(packet.records) && packet.records.length > 0);
    assert.equal(new Set(packet.records.map(r => r.reviewId)).size, packet.records.length);
    for (const record of packet.records) {
        exactKeys(record, ['reviewId', 'question', 'source', 'rubric', 'answer', 'outcome', 'unsupportedAssertion', 'rationale']);
        assert(typeof record.reviewId === 'string' && record.reviewId);
        assert(typeof record.question === 'string' && typeof record.answer === 'string');
        assert(Array.isArray(record.source) && record.source.length > 0);
        for (const message of record.source) { exactKeys(message, ['speaker', 'text']); assert(typeof message.speaker === 'string' && typeof message.text === 'string'); }
        exactKeys(record.rubric, ['requiredEvidence', 'supersededEvidence', 'answerRule']);
        assert(Array.isArray(record.rubric.requiredEvidence) && Array.isArray(record.rubric.supersededEvidence));
        assert(typeof record.rubric.answerRule === 'string');
        for (const [field, keys] of [['requiredEvidence', ['message', 'quote', 'meaning']], ['supersededEvidence', ['message', 'quote']]]) {
            for (const ref of record.rubric[field]) {
                const allowed = field === 'requiredEvidence' && !Object.hasOwn(ref, 'meaning') ? ['message', 'quote'] : keys;
                exactKeys(ref, allowed); assert(Number.isInteger(ref.message) && ref.message >= 0 && ref.message < record.source.length);
                assert(typeof ref.quote === 'string' && record.source[ref.message].text.includes(ref.quote));
                if (field === 'requiredEvidence' && Object.hasOwn(ref, 'meaning')) assert(typeof ref.meaning === 'string');
            }
        }
        assert([null, 'correct', 'partial', 'incorrect', 'abstained', 'unknown-handled'].includes(record.outcome));
        assert(record.unsupportedAssertion === null || typeof record.unsupportedAssertion === 'boolean');
        assert(record.rationale === null || typeof record.rationale === 'string');
    }
    return packet;
}

export function renderReview(packet) {
    validateReviewPacket(packet);
    // Data never enters HTML markup or executable source unescaped; rendering uses textContent.
    const data = JSON.stringify(packet).replaceAll('<', '\\u003c');
    return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<title>SillyMemory human review</title>
<style>
body{font:16px/1.55 system-ui,sans-serif;max-width:900px;margin:30px auto;padding:0 20px;color:#182238;background:#f6f8fb}
h1{font-size:26px}label{display:block;margin-top:12px}input,select,textarea,button{font:inherit;padding:8px;border:1px solid #aab4c4;border-radius:5px}textarea{width:95%;min-height:75px}button{cursor:pointer;background:white}button:disabled{opacity:.45;cursor:default}section{background:white;border:1px solid #d7deea;border-radius:10px;padding:20px;margin:18px 0}pre{white-space:pre-wrap;font:inherit;margin:8px 0}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.source{max-height:380px;overflow:auto;border:1px solid #d7deea;padding:12px}.source p{margin:0 0 14px;white-space:pre-wrap}#answer{background:#edf3ff;padding:12px}#message{color:#7d2b13}small{display:block}
</style>
<h1>SillyMemory human review</h1>
<p>Review each answer against the full source and rubric. Conditions and repetitions are withheld. There are no automatic scores. This page sends nothing over the network and does not save in browser storage.</p>
<p>Save a draft before closing or reloading. To resume, render the downloaded draft with the same command. Only a human reviewer should export final human annotations.</p>
<label>Reviewer name <input id="reviewer" autocomplete="off"></label>
<nav><button id="previous">Previous</button><span id="position"></span><button id="next">Next</button><span id="progress"></span></nav>
<section><h2 id="question"></h2><h3>Answer to assess</h3><pre id="answer"></pre>
<details open><summary>Full source conversation</summary><div class="source" id="source"></div></details>
<h3>Rubric</h3><pre id="rule"></pre><ul id="evidence"></ul>
<label>Outcome <select id="outcome"></select></label>
<label>Unsupported extra assertion <select id="unsupported"><option value="">Unscored</option><option value="false">No</option><option value="true">Yes</option></select></label>
<label>Rationale <textarea id="rationale" placeholder="Explain the asserted meaning, actor, corrections, or missing information."></textarea></label>
</section>
<nav><button id="draft">Save draft JSON</button><button id="final">Export complete human annotations</button></nav><p id="message" role="status"></p>
<script id="packet" type="application/json">${data}</script>
<script>
const packet=JSON.parse(document.getElementById('packet').textContent);
const el=id=>document.getElementById(id);let current=0;
el('reviewer').value=packet.reviewer||'';
function valid(r){const unknown=r.rubric.requiredEvidence.length===0;return (unknown?['unknown-handled','incorrect']:['correct','partial','incorrect','abstained']).includes(r.outcome)&&typeof r.unsupportedAssertion==='boolean'&&Boolean(r.rationale?.trim())&&!(r.outcome==='unknown-handled'&&r.unsupportedAssertion);}
function progress(){el('progress').textContent=packet.records.filter(valid).length+' / '+packet.records.length+' complete';}
function save(){const r=packet.records[current];r.outcome=el('outcome').value||null;r.unsupportedAssertion=el('unsupported').value===''?null:el('unsupported').value==='true';r.rationale=el('rationale').value||null;packet.reviewer=el('reviewer').value.trim()||null;progress();}
function draw(){const r=packet.records[current];el('position').textContent='Answer '+(current+1)+' of '+packet.records.length;el('previous').disabled=current===0;el('next').disabled=current===packet.records.length-1;el('question').textContent=r.question;el('answer').textContent=r.answer;
el('source').replaceChildren();r.source.forEach((m,i)=>{const p=document.createElement('p');p.textContent=(i+1)+'. '+m.speaker+': '+m.text;el('source').append(p);});el('source').scrollTop=0;
el('rule').textContent=r.rubric.answerRule;el('evidence').replaceChildren();for(const [kind,refs]of [['Required',r.rubric.requiredEvidence],['Superseded',r.rubric.supersededEvidence]])for(const ref of refs){const li=document.createElement('li');li.textContent=kind+' — message '+(ref.message+1)+': '+ref.quote+(ref.meaning?' — '+ref.meaning:'');el('evidence').append(li);}
el('outcome').replaceChildren();for(const value of ['',...(r.rubric.requiredEvidence.length?['correct','partial','incorrect','abstained']:['unknown-handled','incorrect'])]){const option=document.createElement('option');option.value=value;option.textContent=value||'Unscored';el('outcome').append(option);}el('outcome').value=r.outcome||'';el('unsupported').value=r.unsupportedAssertion===null?'':String(r.unsupportedAssertion);el('rationale').value=r.rationale||'';progress();}
for(const id of ['outcome','unsupported','rationale','reviewer'])el(id).addEventListener('input',save);
for(const [id,step]of [['previous',-1],['next',1]])el(id).onclick=()=>{save();current+=step;draw();};
function download(complete){save();if(complete&&(!packet.reviewer||!packet.records.every(valid))){el('message').textContent='Enter a reviewer name and valid outcome, unsupported-assertion choice, and rationale for every answer. An unknown-handled answer cannot contain an unsupported assertion.';return;}const blob=new Blob([JSON.stringify(packet,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=complete?'human-annotations.json':'human-review-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);el('message').textContent=complete?'Annotations downloaded. Use natural-score.mjs with the separately held report and review key; this page does not declare a quality result.':'Draft downloaded. Re-render this JSON to resume; this browser page has no autosave.';}
el('draft').onclick=()=>download(false);el('final').onclick=()=>download(true);draw();
</script></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [input, flag, output, ...extra] = process.argv.slice(2);
    assert(input && flag === '--output' && output && !extra.length, 'Usage: node scripts/natural-review.mjs blind-review.json --output new-review.html');
    await writeFile(output, renderReview(JSON.parse(await readFile(input, 'utf8'))), { flag: 'wx' });
    console.log(JSON.stringify({ output: path.resolve(output), kind: 'Unscored offline human review form' }));
}
