import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { adaptLongMemEval, adaptConvoMem, selectLongMemEval, sha } from '../scripts/benchmark-audit.mjs';
import { fetchVerifiedFile } from '../scripts/fetch-benchmark-data.mjs';

test('benchmark adapters preserve dates, roles and order without leaking labels', () => {
    const row = { question_id: 'id', question: 'Which item?', answer: 'SECRET_REFERENCE',
        question_date: '2023/05/30 (Tue) 23:40', haystack_dates: ['2023/05/20 (Sat) 02:21'],
        haystack_session_ids: ['SECRET_EVIDENCE_ID'], answer_session_ids: ['SECRET_EVIDENCE_ID'],
        haystack_sessions: [[{ role: 'assistant', content: 'I suggested a blue notebook.', has_answer: true },
            { role: 'user', content: 'I picked the green one.' }]] };
    const input = adaptLongMemEval(row);
    assert.deepEqual(input.messages.map(m => m.role), ['assistant', 'user']);
    assert(input.messages[0].content.includes('2023/05/20 (Sat) 02:21'));
    assert.equal(input.messages[1].content, 'I picked the green one.');
    assert(input.question.includes('2023/05/30 (Tue) 23:40'));
    assert(!JSON.stringify(input).includes('SECRET'));
    assert(!JSON.stringify(input).includes('has_answer'));
    const empty = structuredClone(row);
    empty.haystack_sessions[0][1].content = '';
    assert.equal(adaptLongMemEval(empty).messages[1].content, '');
    const convo = { contextSize: 1, evidenceItems: [{ question: 'Which item?', answer: 'SECRET_REFERENCE',
        scenario_description: 'SECRET_RUBRIC', conversations: ['DO_NOT_IMPORT_EVIDENCE_ONLY'] }],
        conversations: [{ id: 'SECRET_EVIDENCE_ID', containsEvidence: true,
            messages: [{ speaker: 'User', text: 'I chose the green notebook.' }] }] };
    const result = adaptConvoMem(convo);
    assert.equal(result.messages[0].content, '[Conversation 1]\nI chose the green notebook.');
    convo.conversations[0].messages[0].speaker = 'user';
    assert.deepEqual(adaptConvoMem(convo), result);
    assert(!JSON.stringify(result).includes('SECRET'));
    assert(!JSON.stringify(result).includes('DO_NOT_IMPORT'));
    assert.throws(() => adaptConvoMem({ ...convo, conversations: [{ messages: [{ speaker: 'System', text: 'x' }] }] }));
    assert.throws(() => adaptLongMemEval({ ...row, haystack_dates: [] }));
});

test('question selection is order-independent and keeps shared evidence within one split', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: `question-${i}`, stratum: 'fact',
        sourceIndex: i, evidenceSessionIds: [`evidence-${Math.floor(i/2)}`],
        historySessionIds: ['shared-background', `evidence-${Math.floor(i/2)}`], inputSha256: 'digest',
        adaptedHistoryTokenEstimate: 100 }));
    const selected = selectLongMemEval(rows);
    assert.deepEqual(selectLongMemEval([...rows].reverse()), selected);
    assert.equal(selected.samples.length, 8);
    assert.equal(selected.evidenceComponents, 50);
    assert.equal(selected.allHistoryComponents, 1);
    assert(selected.sharedHistorySessions >= 1);
    const dev = selected.samples.filter(s => s.split === 'development');
    const evaluation = selected.samples.filter(s => s.split === 'evaluation');
    assert(!dev.some(a => evaluation.some(b => a.evidenceGroup === b.evidenceGroup)));
    assert.throws(() => selectLongMemEval(rows.slice(0, 1)), /Insufficient/);
    assert.throws(() => selectLongMemEval([rows[0], rows[0]]));
});

test('downloads reject changed or oversized data without publishing partial files', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sillymemory-audit-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const bytes = '{"synthetic":true}';
    const file = { localName: 'data.json', bytes: Buffer.byteLength(bytes), sha256: sha(bytes),
        url: `https://huggingface.co/datasets/test/data/resolve/${'a'.repeat(40)}/data.json` };
    await assert.rejects(fetchVerifiedFile(file, directory, async () => new Response(bytes+'x')), /exceeds/);
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(fetchVerifiedFile({ ...file, sha256: '0'.repeat(64) }, directory,
        async () => new Response(bytes)), /checksum/);
    assert.deepEqual(await readdir(directory), []);
    assert.equal(await fetchVerifiedFile(file, directory, async () => new Response(bytes)), 'downloaded');
    assert.equal(await readFile(path.join(directory, file.localName), 'utf8'), bytes);
    assert.equal(await fetchVerifiedFile(file, directory, () => assert.fail('Unexpected network')), 'verified-cache');
    await assert.rejects(fetchVerifiedFile({ ...file, localName: '../escape.json' }, directory));
});

test('committed audit, selection and pilot remain bound to their sources and producer', async () => {
    const read = file => readFile(new URL(`../${file}`, import.meta.url));
    const source = await read('docs/benchmarks/sources-v1.json');
    const audit = JSON.parse(await read('docs/benchmarks/audit-v1.json'));
    const selectionBytes = await read('docs/benchmarks/selection-v1.json');
    const selection = JSON.parse(selectionBytes);
    const pilot = JSON.parse(await read('docs/benchmarks/pilot-design-v1.json'));
    assert.equal(audit.sourcesSha256, sha(source));
    assert.equal(selection.sourcesSha256, sha(source));
    assert.equal(audit.producerSha256, sha(await read('scripts/benchmark-audit.mjs')));
    assert.equal(pilot.selectionSha256, sha(selectionBytes));
    assert.equal(pilot.sourceSha256, sha(source));
    for (const sample of pilot.cases) {
        const original = selection.samples.find(row => row.id === sample.id);
        assert.equal(original.split, 'development');
        assert.equal(sample.inputSha256, original.inputSha256);
        assert.deepEqual(sample.auditFlags, []);
    }
    assert.equal(pilot.answerCalls, pilot.cases.length * Object.keys(pilot.arms).length);
    assert.equal(pilot.maxSummaryCalls, pilot.cases.reduce((n,s) => n+s.automaticSummaryCallCap,0));
});
