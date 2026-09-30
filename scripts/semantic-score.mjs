// Review annotations are separate from delivery checks and never become human grades implicitly.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadLong, longSchedule, sha } from './semantic-long.mjs';
import { summarizeSemantic } from './semantic-results.mjs';

export function scoreAnnotations(packet, key, annotations, fixture = loadLong()) {
    assert.equal(packet.version, fixture.version);
    assert.match(packet.reportSha256, /^[a-f0-9]{64}$/);
    assert.equal(packet.reviewer, null); assert.equal(packet.reviewerType, null);
    assert(packet.rows.every(row => row.grade === null && row.rationale === null), 'Keep original packet unfilled');
    assert(['assistant', 'human'].includes(annotations.reviewerType));
    assert(typeof annotations.reviewer === 'string' && annotations.reviewer.trim());
    assert.equal(annotations.version, packet.version); assert.equal(annotations.reportSha256, packet.reportSha256);
    const schedule = longSchedule(fixture), cases = new Map(fixture.cases.map(item => [item.id, item]));
    assert.equal(packet.rows.length, schedule.length); assert.equal(key.length, schedule.length); assert.equal(annotations.rows.length, schedule.length);
    const unique = (rows, field) => { assert.equal(new Set(rows.map(row => row[field])).size, rows.length); return new Map(rows.map(row => [row[field], row])); };
    const packets = unique(packet.rows, 'id'), graded = unique(annotations.rows, 'id'), keys = unique(key, 'sample'); unique(key, 'id');
    assert.deepEqual([...packets.keys()].sort(), [...graded.keys()].sort());
    assert.deepEqual([...packets.keys()].sort(), key.map(row => row.id).sort());
    assert.deepEqual([...keys.keys()].sort(), schedule.map(sample => sample.id).sort());
    const rows = schedule.map(sample => {
        const original = packets.get(keys.get(sample.id).id), annotation = graded.get(original.id), item = cases.get(sample.case);
        const { grade, rationale, ...content } = annotation;
        const { grade: unfilledGrade, rationale: unfilledRationale, ...originalContent } = original;
        assert.deepEqual(content, originalContent, 'Review content changed');
        assert.deepEqual(original.source, item.messages.slice(0, 2)); assert.deepEqual(original.expected, item.expected);
        assert.deepEqual(original.evidence, item.evidence); assert.equal(original.question, item.question);
        assert(['correct', 'partial', 'incorrect', 'abstained'].includes(grade));
        assert(typeof rationale === 'string' && rationale.trim(), 'Every grade needs a rationale');
        const unknown = item.expected.type === 'abstain';
        assert(!unknown || ['abstained', 'incorrect'].includes(grade), 'Unknown answers require justified abstention or an incorrect grade');
        return { ...sample, reviewId: original.id, language: item.language, shape: item.shape, unknown, grade, rationale, strictPass: unknown ? grade === 'abstained' : grade === 'correct' };
    });
    const groups = ['off', 'on'].map(mode => {
        const selected = rows.filter(row => row.mode === mode), known = selected.filter(row => !row.unknown), unknown = selected.filter(row => row.unknown);
        return { mode, samples: selected.length, strictPasses: selected.filter(row => row.strictPass).length, known: Object.fromEntries(['correct', 'partial', 'incorrect', 'abstained'].map(grade => [grade, known.filter(row => row.grade === grade).length])), unknownHandled: unknown.filter(row => row.strictPass).length, unknownSamples: unknown.length };
    });
    const paired = fixture.cases.flatMap(item => Array.from({ length: fixture.settings.repetitions }, (_, index) => {
        const pair = rows.filter(row => row.case === item.id && row.repetition === index + 1), off = pair.find(row => row.mode === 'off'), on = pair.find(row => row.mode === 'on');
        return { case: item.id, repetition: index + 1, off: off.grade, on: on.grade, change: Number(on.strictPass) - Number(off.strictPass) };
    }));
    return { version: fixture.version, reportSha256: packet.reportSha256, reviewer: annotations.reviewer, reviewerType: annotations.reviewerType, independentHumanReview: null, provisional: annotations.reviewerType === 'assistant', groups, pairs: { improved: paired.filter(p => p.change > 0).length, tied: paired.filter(p => p.change === 0).length, regressed: paired.filter(p => p.change < 0).length }, paired, rows };
}

export function scoreSemantic(report, packet, key, annotations) {
    summarizeSemantic(report);
    assert.equal(packet.reportSha256, sha(JSON.stringify(report)));
    const indexed = new Map(report.evaluation.rows.map(row => [row.id, row]));
    const packets = new Map(packet.rows.map(row => [row.id, row]));
    for (const entry of key) assert.equal(packets.get(entry.id)?.answer, indexed.get(entry.sample)?.answer, 'Answer/key mismatch');
    return scoreAnnotations(packet, key, annotations);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [report, packet, key, annotations, output] = process.argv.slice(2);
    assert(output && process.argv.length === 7, 'Usage: node scripts/semantic-score.mjs report.json packet.json key.json annotations.json new-score.json');
    const score = scoreSemantic(...[report, packet, key, annotations].map(file => JSON.parse(readFileSync(file))));
    writeFileSync(output, JSON.stringify(score, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, groups: score.groups, pairs: score.pairs, provisional: score.provisional }));
}
