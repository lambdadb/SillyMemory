import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLongPlan, pinnedCounter, sha } from './semantic-long.mjs';
import { threeModeFiles, threeModeNative } from './three-mode-plan.mjs';
import { NATURAL_RETRY } from './provider-retry.mjs';

export const tuningVersion = 'native-insert-tuning-v1';
export const tuningRetry = { ...NATURAL_RETRY, version: 'native-tuning-transport-v1' };
export const tuningFiles = [...threeModeFiles, 'scripts/native-tuning-plan.mjs', 'docs/native-tuning-evaluation.md'];
export function tuningSchedule(cases) {
    return [1,2].flatMap(repetition => cases.flatMap((item,i) => ((i+repetition)%2 ? [3,10] : [10,3]).map(insert => ({ id: `${item.id}/r${repetition}/insert-${insert}`, case: item.id, repetition, mode: 'vectors', insert }))));
}
export function buildTuningPlan(count) {
    const base = buildLongPlan(count);
    return { ...base, version: tuningVersion, schedule: tuningSchedule(base.cases), nativeSettings: threeModeNative, transportProtocol: tuningRetry,
        sourceSha256: Object.fromEntries(tuningFiles.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))])) };
}
export async function verifyTuningPlan(filename) {
    assert(filename, 'Frozen native tuning plan required');
    const bytes = readFileSync(filename), plan = JSON.parse(bytes), counter = pinnedCounter(process.env.ST_SOURCE);
    try { assert.deepEqual(plan, buildTuningPlan(counter.count), 'Frozen native tuning plan or inputs changed'); } finally { counter.close(); }
    return { plan, sha256: sha(bytes) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [output] = process.argv.slice(2); assert(output && process.argv.length === 3);
    const counter = pinnedCounter(process.env.ST_SOURCE);
    try { const plan = buildTuningPlan(counter.count); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(plan,null,2)+'\n', { flag: 'wx' }); console.log(JSON.stringify({output,samples:plan.schedule.length})); } finally { counter.close(); }
}
