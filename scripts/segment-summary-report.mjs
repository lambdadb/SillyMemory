// Offline aggregate receipts. Detailed evidence stays ignored; no provider calls.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const [directory] = process.argv.slice(2); assert(directory, 'Usage: segment-summary-report.mjs OUT');
const state = JSON.parse(await readFile(path.join(directory, 'ledger/state.json')));
const observations = Object.entries(state.observations);
const rows = observations.filter(([key]) => key.endsWith('/result')).map(([, v]) => v.value);
const group = (values, key) => Map.groupBy ? Map.groupBy(values, key) : values.reduce((m,v) => m.set(key(v), [...(m.get(key(v)) || []),v]), new Map());
const median = values => { if (!values.length) return null; const s = [...values].sort((a,b) => a-b), n=s.length; return (s[Math.floor((n-1)/2)] + s[Math.floor(n/2)]) / 2; };
const stages = {}, pending = [], undispatched = [];
for (const [id, entry] of Object.entries(state.calls)) {
    if (!id.startsWith('provider/')) continue;
    if (entry.status !== 'complete') {
        (state.observations[`recovery/${id}`]?.value.status === 'verified-not-dispatched' ? undispatched : pending).push(id);
        continue;
    }
    const receiptBytes = await readFile(path.join(directory, 'ledger', entry.receipt));
    assert.equal(createHash('sha256').update(receiptBytes).digest('hex'), entry.receiptSha256, 'Receipt checksum mismatch');
    const receipt = JSON.parse(receiptBytes);
    const key = receipt.kind === 'answer' ? `${receipt.id.split('/')[1]}Answer` : receipt.kind;
    const stage = stages[key] ||= { attempts: 0, successful: 0, input: 0, cached: 0, cacheWrite: 0, output: 0, ms: [], finishReasons: {} };
    stage.attempts++;
    if (receipt.status !== 200) continue;
    const result = JSON.parse(receipt.text), u = result.usage;
    stage.successful++;
    stage.input += u.prompt_tokens; stage.output += u.completion_tokens;
    stage.cached += u.prompt_tokens_details?.cached_tokens ?? 0;
    stage.cacheWrite += u.prompt_tokens_details?.cache_write_tokens ?? 0;
    stage.ms.push(receipt.elapsedMs);
    const finish = result.choices?.[0]?.finish_reason; stage.finishReasons[finish] = (stage.finishReasons[finish] || 0) + 1;
}
for (const [key, stage] of Object.entries(stages)) {
    stage.medianHttpMs = median(stage.ms); stage.sumHttpMs = stage.ms.reduce((a,b) => a+b,0); delete stage.ms;
    // Frozen list-rate model, not an invoice. Judge cache uses the GPT-4o rate.
    const rates = key === 'judge' ? { input: 2.5, cached: 1.25, write: 2.5, output: 10 } : { input: 2, cached: 0.1, write: 2.5, output: 10 };
    assert(stage.cached + stage.cacheWrite <= stage.input);
    stage.estimatedUsd = ((stage.input - stage.cached - stage.cacheWrite)*rates.input + stage.cached*rates.cached + stage.cacheWrite*rates.write + stage.output*rates.output)/1e6;
}
const accuracy = {};
for (const [arm, values] of group(rows, r => r.arm)) accuracy[arm] = { n: values.length, correct: values.filter(r => r.correct).length,
    operationalFailures: values.filter(r => r.operationalFailure).map(r => ({ id: r.id, reason: r.operationalFailure })),
    byType: Object.fromEntries([...group(values, r => r.type)].map(([type, rs]) => [type, { n: rs.length, correct: rs.filter(r => r.correct).length }])),
    medianAnswerInput: median(values.filter(r => !r.operationalFailure).map(r => r.usage.prompt_tokens)) };
const paired = { bothCorrect: [], summaryOnly: [], controlOnly: [], bothWrong: [] };
for (const [id, rs] of group(rows, r => r.id)) {
    const a = rs.find(r => r.arm === 'summary'), b = rs.find(r => r.arm === 'control');
    if (!a || !b) continue;
    paired[a.correct ? (b.correct ? 'bothCorrect' : 'summaryOnly') : (b.correct ? 'controlOnly' : 'bothWrong')].push(id);
}
const memories = observations.filter(([key]) => key.endsWith('/memory')).map(([, v]) => v.value);
const words = memories.flatMap(v => v.memories.map(m => m.text.trim().split(/\s+/).length));
const complete = rows.length === 100 && pending.length === 0;
if (complete) for (const id of state.binding.ids) for (const arm of ['summary', 'control']) {
    assert.equal(rows.filter(r => r.id === id && r.arm === arm).length, 1, 'Incomplete or duplicate case set');
}
const report = { complete, accuracy, paired, stages, pending, undispatched,
    summaries: { count: words.length, over400Words: words.filter(n => n > 400).length, maxWords: words.length ? Math.max(...words) : null,
        medianMemoryTokens: median(memories.filter(m => !m.operationalFailure).map(m => m.memoryTokens)), maxMemoryTokens: memories.length ? Math.max(...memories.map(m => m.memoryTokens)) : null },
    reservation: state.used, pricing: 'Frozen October 19 list-rate estimate; not billed cost; no storage/retrieval deployment costs included.' };
await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
