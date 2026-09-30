// Fixed equal-context comparison; native Vector Storage retains its own prompt policy.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLongPlan, pinnedCounter, sha, sourceFiles } from './semantic-long.mjs';
import { nativeSettings } from './comparison-fixture.mjs';
import { NATURAL_RETRY } from './provider-retry.mjs';

export const threeModeVersion = 'semantic-three-modes-v1';
export const threeModeNative = { ...nativeSettings, protect: 8, query: 2 };
export const threeModeRetry = { ...NATURAL_RETRY, version: 'three-mode-transport-v1', maxCalls: 104 };
export const threeModeFiles = [...new Set([...sourceFiles, 'src/delivery.js', 'scripts/three-mode-plan.mjs', 'scripts/three-mode-native.mjs', 'scripts/three-mode-results.mjs', 'scripts/comparison-fixture.mjs', 'docs/three-mode-evaluation.md'])];
export function threeModeSchedule(cases, repetitions = 2) {
    const orders = [['off','on','vectors'],['on','vectors','off'],['vectors','off','on'],['off','vectors','on'],['vectors','on','off'],['on','off','vectors']];
    return Array.from({ length: repetitions }, (_, r) => cases.flatMap((item, i) => orders[(i + r * 3) % orders.length].map(mode => ({ id: `${item.id}/r${r + 1}/${mode}`, case: item.id, repetition: r + 1, mode })))).flat();
}
export function buildThreeModePlan(count) {
    const base = buildLongPlan(count);
    return { ...base, version: threeModeVersion, schedule: threeModeSchedule(base.cases), nativeSettings: threeModeNative, transportProtocol: threeModeRetry,
        sourceSha256: Object.fromEntries(threeModeFiles.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))])) };
}
export async function verifyThreeModePlan(filename) {
    assert(filename, 'Frozen three-mode plan required');
    const bytes = readFileSync(filename), plan = JSON.parse(bytes), counter = pinnedCounter(process.env.ST_SOURCE);
    try { assert.deepEqual(plan, buildThreeModePlan(counter.count), 'Frozen comparison plan or inputs changed'); } finally { counter.close(); }
    return { plan, sha256: sha(bytes) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [output] = process.argv.slice(2); assert(output && process.argv.length === 3);
    const counter = pinnedCounter(process.env.ST_SOURCE);
    try { const plan = buildThreeModePlan(counter.count); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, samples: plan.schedule.length })); } finally { counter.close(); }
}
