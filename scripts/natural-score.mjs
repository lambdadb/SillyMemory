import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { scoreNaturalAnnotations } from './natural-summary.mjs';
const [reportFile, packetFile, keyFile, flag, output] = process.argv.slice(2);
assert(reportFile && packetFile && keyFile && flag === '--output' && output && process.argv.length === 7, 'Usage: node scripts/natural-score.mjs report.json annotations.json review-key.json --output new-score.json');
const [report, packet, key] = await Promise.all([reportFile, packetFile, keyFile].map(async file => JSON.parse(await readFile(file, 'utf8'))));
const score = scoreNaturalAnnotations(report, packet, key);
await writeFile(output, JSON.stringify(score, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, reviewerType: score.reviewerType, semanticQualityGate: score.semanticQualityGate, provisionalAssistantGate: score.provisionalAssistantGate }));
