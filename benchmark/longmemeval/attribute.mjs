// Offline evidence-coverage attribution for a completed LongMemEval run.
//
// Maps dataset `has_answer` turns to the indexed chunks of a frozen question and
// classifies each annotated message as missing, partial or complete at two stages:
// the returned reranked list and the final packed prompt. See
// docs/memory-evaluation.md, "Map chunk results to message annotations".
//
// Usage: node benchmark/longmemeval/attribute.mjs <run-root> <output.json> [--all]
// The run root is a completed runner directory containing longmemeval_s_cleaned.json,
// lock.json, recall/, answer/ and scores.json. By default only incorrect answers are
// attributed; --all attributes every question and reports cohort coverage rates.
//
// Boundaries. The runner records only the final reranked list, so a message missing
// from it is a retrieval loss without separating candidate recall from reranking.
// `has_answer` is a turn-level annotation of user evidence: it does not identify the
// exact fact span, and unannotated assistant turns may also matter. The canonical
// message extent is the union of its indexed chunk spans. Treat the result as
// annotation coverage, not verified necessary-fact recall.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCase, sha256 } from './protocol.mjs';

const mergeSpans = spans => spans.slice().sort((a, b) => a[0] - b[0]).reduce((merged, [start, end]) => {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
    return merged;
}, []);

// State of one annotated message given the chunk IDs present at a stage.
export function coverageState(chunks, present) {
    const extent = mergeSpans(chunks.map(c => [c.start, c.end]));
    const covered = mergeSpans(chunks.filter(c => present.has(c.id)).map(c => [c.start, c.end]));
    if (!covered.length) return 'missing';
    const complete = covered.length === extent.length && covered.every(([s, e], i) => s === extent[i][0] && e === extent[i][1]);
    return complete ? 'complete' : 'partial';
}

export function attributeCase({ row, prepared, record, score }) {
    assert.equal(record.id, row.question_id); assert.equal(record.sourceSha256, sha256(JSON.stringify(prepared)));
    const returned = new Map(record.response.docs.map((hit, rank) => [hit.doc.id, rank + 1]));
    const delivered = new Set(record.packed.selectedIds);
    const byMessage = new Map();
    for (const doc of prepared.docs) (byMessage.get(doc.message) ?? byMessage.set(doc.message, []).get(doc.message)).push(doc);
    // Flattened message index matches adaptLongMemEval: sessions in order, turns in order.
    let index = 0, recentEvidence = 0; const evidence = [];
    row.haystack_sessions.forEach((session, s) => session.forEach((turn, t) => {
        const message = index++;
        if (!turn.has_answer) return;
        if (message >= prepared.boundary) { recentEvidence++; return; }
        const chunks = byMessage.get(message) ?? [];
        evidence.push({ message, session: s + 1, turn: t, role: turn.role, date: row.haystack_dates[s], indexed: chunks.length > 0,
            returned: coverageState(chunks, new Set(returned.keys())), prompt: coverageState(chunks, delivered),
            chunks: chunks.map(c => ({ id: c.id, chunk: c.chunk, start: c.start, end: c.end, rank: returned.get(c.id) ?? null, delivered: delivered.has(c.id) })),
            excerpt: turn.content.slice(0, 200) });
    }));
    let stage;
    if (!evidence.length) stage = recentEvidence ? 'recent-dialogue-only' : 'unannotated';
    else if (evidence.some(e => e.returned === 'missing')) stage = 'retrieval-loss';
    else if (evidence.some(e => e.prompt === 'missing')) stage = 'budget-loss';
    else if (evidence.some(e => e.prompt === 'partial')) stage = 'delivered-partial';
    else stage = 'delivered-complete';
    return { id: row.question_id, type: row.question_type, correct: score.correct, probability: score.probability,
        question: row.question, expected: row.answer, questionDate: row.question_date,
        indexedChunks: prepared.docs.length, boundary: prepared.boundary, returnedChunks: record.response.docs.length,
        deliveredChunks: record.packed.selectedIds.length, memoryTokens: record.packed.memoryTokens,
        answerSessionIds: row.answer_session_ids, annotatedMessages: evidence.length, recentAnnotatedMessages: recentEvidence, stage, evidence };
}

export const stageDefinitions = {
    'delivered-complete': 'Every annotated message is complete in the final prompt. An incorrect answer here fails downstream of retrieval and packing.',
    'delivered-partial': 'Every annotated message is present in the final prompt, at least one only partially.',
    'budget-loss': 'Every annotated message is present in the returned list, but at least one is missing from the final prompt.',
    'retrieval-loss': 'At least one annotated message is missing from the returned list. Candidate recall and reranking are not separable offline.',
    'recent-dialogue-only': 'Every annotated message lies inside the retained recent dialogue, outside the retrieval partition.',
    'unannotated': 'The dataset marks no has_answer turn, for example abstention questions.',
};

export function tally(results) {
    const annotated = results.filter(r => r.annotatedMessages > 0), messages = annotated.flatMap(r => r.evidence);
    const count = (stage, state) => messages.filter(m => m[stage] === state).length;
    const stages = {};
    for (const r of results) stages[r.stage] = (stages[r.stage] ?? 0) + 1;
    return { questions: results.length, annotatedQuestions: annotated.length, zeroAnnotationQuestions: results.length - annotated.length,
        stages, annotatedMessages: messages.length, indexed: messages.filter(m => m.indexed).length,
        returned: { complete: count('returned', 'complete'), partial: count('returned', 'partial'), missing: count('returned', 'missing') },
        prompt: { complete: count('prompt', 'complete'), partial: count('prompt', 'partial'), missing: count('prompt', 'missing') },
        allAnnotatedMessagesCompleteQuestions: {
            returned: annotated.filter(r => r.evidence.every(e => e.returned === 'complete')).length,
            prompt: annotated.filter(r => r.evidence.every(e => e.prompt === 'complete')).length,
        } };
}

async function main() {
    const [root, output, flag] = process.argv.slice(2);
    assert(root && output && [undefined, '--all'].includes(flag), 'Usage: attribute.mjs <run-root> <output.json> [--all]');
    const readJSON = async file => JSON.parse(await readFile(file));
    const config = await readJSON(new URL('./config.json', import.meta.url));
    const lock = await readJSON(path.join(root, 'lock.json'));
    const dataset = await readFile(path.join(root, config.dataset.localName));
    assert.equal(sha256(dataset), config.dataset.sha256); assert.equal(lock.datasetSha256, config.dataset.sha256);
    const rows = new Map(JSON.parse(dataset).map(row => [row.question_id, row]));
    const scores = await readJSON(path.join(root, 'scores.json'));
    const selected = flag === '--all' ? scores : scores.filter(s => !s.correct);
    const results = [];
    for (const score of selected) {
        const row = rows.get(score.id), prepared = await prepareCase(row, config, lock.owner);
        assert.equal(sha256(JSON.stringify(prepared)), lock.inputs[score.id]);
        const record = await readJSON(path.join(root, 'recall', `${score.id}.json`));
        const answer = await readJSON(path.join(root, 'answer', `${score.id}.json`));
        assert.equal(answer.requestSha256, record.packed.requestSha256);
        results.push({ ...attributeCase({ row, prepared, record, score }), answer: answer.response.choices[0].message.content });
    }
    const byType = {};
    for (const r of results) (byType[r.type] ??= []).push(r);
    const report = { root: path.resolve(root), scope: flag === '--all' ? 'all' : 'incorrect', configSha256: lock.configSha256,
        datasetSha256: lock.datasetSha256, aggregate: tally(results), correct: tally(results.filter(r => r.correct)),
        incorrect: tally(results.filter(r => !r.correct)), byType: Object.fromEntries(Object.entries(byType).map(([t, list]) => [t, tally(list)])),
        stageDefinitions, results };
    await writeFile(output, JSON.stringify(report, null, 1));
    console.error(`Attributed ${results.length} answers`, JSON.stringify(report.aggregate));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
