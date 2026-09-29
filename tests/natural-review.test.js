import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReview, validateReviewPacket } from '../scripts/natural-review.mjs';
const packet = () => ({ version:'natural-human-review-v1', reportHash:'a'.repeat(64), reviewer:null, reviewerType:'human', records:[{reviewId:'one',question:'Who moved it?',source:[{speaker:'User',text:'I moved the chart. </script><script>globalThis.injected=true</script>'}],rubric:{requiredEvidence:[{message:0,quote:'I moved the chart.',meaning:'The user moved it.'}],supersededEvidence:[],answerRule:'Identify the actor.'},answer:'You moved it.',outcome:null,unsupportedAssertion:null,rationale:null}] });
test('human form accepts only blinded human packet fields and valid source evidence', () => {
    assert.equal(validateReviewPacket(packet()).reviewer, null);
    for (const change of [p=>{p.records[0].mode='on';},p=>{p.reviewKey={};},p=>{p.reviewerType='assistant';},p=>{p.records.push(structuredClone(p.records[0]));},p=>{p.records[0].rubric.requiredEvidence[0].message=9;}]) {const p=packet();change(p);assert.throws(()=>renderReview(p));}
});
test('source markup cannot close the embedded data element or become executable HTML', () => {
    const html=renderReview(packet());
    assert(!html.includes('</script><script>globalThis.injected'));
    const data=/<script id="packet" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1];
    assert.deepEqual(JSON.parse(data),packet());
    const draft=packet();draft.reviewer='Synthetic test';draft.records[0].rationale='작업 중';
    assert(renderReview(draft).includes('작업 중'));
});

test('review CLI preserves an existing output instead of overwriting review work', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sm-review-cli-'));
    try {
        const input = path.join(directory, 'packet.json'), output = path.join(directory, 'review.html');
        writeFileSync(input, JSON.stringify(packet()));
        const script = fileURLToPath(new URL('../scripts/natural-review.mjs', import.meta.url));
        const run = () => spawnSync(process.execPath, [script, input, '--output', output], { encoding: 'utf8', cwd: tmpdir() });
        assert.equal(run().status, 0);
        const html = readFileSync(output, 'utf8');
        assert.notEqual(run().status, 0); assert.equal(readFileSync(output, 'utf8'), html);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('quote-only required evidence renders without inventing an interpretation or accepting extra fields', () => {
    const p = packet(); delete p.records[0].rubric.requiredEvidence[0].meaning;
    assert.equal(validateReviewPacket(p), p);
    const embedded = /<script id="packet" type="application\/json">([\s\S]*?)<\/script>/.exec(renderReview(p))[1];
    assert.deepEqual(JSON.parse(embedded), p);
    p.records[0].rubric.requiredEvidence[0].meaning = null;
    assert.throws(() => renderReview(p));
    delete p.records[0].rubric.requiredEvidence[0].meaning;
    p.records[0].rubric.requiredEvidence[0].mode = 'on';
    assert.throws(() => renderReview(p));
});
