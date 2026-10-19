// Offline aggregate receipts. Detailed evidence stays ignored; no provider calls.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const [directory] = process.argv.slice(2); assert(directory, 'Usage: segment-summary-report.mjs OUT');
const state = JSON.parse(await readFile(path.join(directory, 'ledger/state.json')));
assert.equal(state.binding.version, 'segment-summary-400chars-v1');
const observations = Object.entries(state.observations);
const rows = observations.filter(([key]) => key.endsWith('/result')).map(([, v]) => v.value);
const group = (values, key) => Map.groupBy ? Map.groupBy(values, key) : values.reduce((m,v) => m.set(key(v), [...(m.get(key(v)) || []),v]), new Map());
const median = values => { if (!values.length) return null; const s = [...values].sort((a,b) => a-b), n=s.length; return (s[Math.floor((n-1)/2)] + s[Math.floor(n/2)]) / 2; };
const stages = {}, pending = [];
for (const [id, entry] of Object.entries(state.calls)) {
    if (!id.startsWith('provider/')) continue;
    if (entry.status !== 'complete') {
        pending.push(id);
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
    if (receipt.kind === 'judge') {
        stage.input += u.input_tokens; stage.output += u.output_tokens ?? 0;
        stage.ms.push(receipt.elapsedMs); continue;
    }
    stage.input += u.prompt_tokens; stage.output += u.completion_tokens;
    stage.cached += u.prompt_tokens_details?.cached_tokens ?? 0;
    stage.cacheWrite += u.prompt_tokens_details?.cache_write_tokens ?? 0;
    stage.ms.push(receipt.elapsedMs);
    const finish = result.choices?.[0]?.finish_reason; stage.finishReasons[finish] = (stage.finishReasons[finish] || 0) + 1;
}
for (const [key, stage] of Object.entries(stages)) {
    stage.medianHttpMs = median(stage.ms); stage.sumHttpMs = stage.ms.reduce((a,b) => a+b,0); delete stage.ms;
    // Frozen list-rate estimates, not invoices; Jev bills input only.
    const rates = key === 'judge' ? { input: 0.042, cached: 0.042, write: 0.042, output: 0 } : { input: 2, cached: 0.1, write: 2.5, output: 10 };
    assert(stage.cached + stage.cacheWrite <= stage.input);
    stage.estimatedUsd = ((stage.input - stage.cached - stage.cacheWrite)*rates.input + stage.cached*rates.cached + stage.cacheWrite*rates.write + stage.output*rates.output)/1e6;
}
const accuracy = {};
for (const [arm, values] of group(rows, r => r.arm)) accuracy[arm] = { n: values.length, correct: values.filter(r => r.correct).length,
    operationalFailures: values.filter(r => r.operationalFailure).map(r => ({ id: r.id, reason: r.operationalFailure })),
    byType: Object.fromEntries([...group(values, r => r.type)].map(([type, rs]) => [type, { n: rs.length, correct: rs.filter(r => r.correct).length }])),
    medianAnswerInput: median(values.filter(r => !r.operationalFailure).map(r => r.usage.prompt_tokens)) };
const paired = {};
for (const comparator of ['words400', 'control']) {
    const pairs = paired[comparator] = { bothCorrect: [], charsOnly: [], comparatorOnly: [], bothWrong: [] };
    for (const [id, rs] of group(rows, r => r.id)) {
        const a = rs.find(r => r.arm === 'chars400'), b = rs.find(r => r.arm === comparator);
        if (!a || !b) continue;
        pairs[a.correct ? (b.correct ? 'bothCorrect' : 'charsOnly') : (b.correct ? 'comparatorOnly' : 'bothWrong')].push(id);
    }
}
const memories = observations.filter(([key]) => key.endsWith('/memory')).map(([, v]) => v.value);
const lengths = memories.flatMap(v => v.lengths);
const storedLengths = memories.flatMap(v => v.memories.map(m => Array.from(m.text).length));
assert(storedLengths.every(n => n <= 400), 'Stored character limit exceeded');
const complete = rows.length === 150 && pending.length === 0;
if (complete) for (const id of state.binding.ids) for (const arm of ['chars400', 'words400', 'control']) {
    assert.equal(rows.filter(r => r.id === id && r.arm === arm).length, 1, 'Incomplete or duplicate case set');
}
const report = { complete, judge: { model: 'jev-1.13.0', type: 'noul', threshold: 0.50 }, accuracy, paired, stages, pending,
    labels: rows.map(({ id, arm, correct, probability, operationalFailure, answerReused }) => ({ id, arm, correct, probability, ...(operationalFailure ? { operationalFailure } : {}), answerReused })),
    summaries: { count: lengths.length, truncated: lengths.filter(x => x.truncated).length,
        maxOriginalCharacters: lengths.length ? Math.max(...lengths.map(x => x.originalCharacters)) : null,
        maxStoredCharacters: storedLengths.length ? Math.max(...storedLengths) : null, medianStoredCharacters: median(storedLengths),
        medianMemoryTokens: median(memories.filter(m => !m.operationalFailure).map(m => m.memoryTokens)), maxMemoryTokens: memories.length ? Math.max(...memories.map(m => m.memoryTokens)) : null },
    reservation: state.used, pricing: 'Frozen October 19 list-rate estimate; not billed cost; no storage/retrieval deployment costs included.' };
await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, labels: `${report.labels.length} labels retained in report.json` }, null, 2));
