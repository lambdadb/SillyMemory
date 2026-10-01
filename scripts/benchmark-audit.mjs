// Offline dataset inspection. No generation, embedding, credentials or host writes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const auditSeed = 'sillymemory-external-audit-v1';
export const hostRevision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
const text = value => { assert.equal(typeof value, 'string'); assert(value.trim()); return value; };
const sourceText = value => { assert.equal(typeof value, 'string'); return value; };
const role = value => { assert(['user', 'assistant'].includes(value), 'Unsupported speaker role'); return value; };
const dateKey = value => {
    text(value);
    const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2}) \([A-Za-z]+\) (\d{2}):(\d{2})$/);
    assert(match, 'Unrecognized dataset date');
    return match.slice(1).join(''); // Compare wall-clock order without inventing a timezone.
};

export function adaptLongMemEval(row) {
    const sessions = row.haystack_sessions;
    assert(Array.isArray(sessions) && sessions.length);
    assert.equal(sessions.length, row.haystack_dates.length);
    assert.equal(sessions.length, row.haystack_session_ids.length);
    const messages = sessions.flatMap((session, index) => {
        assert(Array.isArray(session) && session.length);
        dateKey(row.haystack_dates[index]);
        return session.map((turn, i) => ({ role: role(turn.role), content:
            (i === 0 ? `[Session ${index + 1}; date: ${row.haystack_dates[index]}]\n` : '') + sourceText(turn.content) }));
    });
    dateKey(row.question_date);
    // Whitelist model-visible fields: no answer, has_answer, evidence IDs or rubric.
    return { messages, question: `[Question date: ${row.question_date}]\n${text(row.question)}` };
}

export function adaptConvoMem(row, questionIndex = 0) {
    assert(Array.isArray(row.conversations) && row.conversations.length);
    assert(Array.isArray(row.evidenceItems) && row.evidenceItems[questionIndex]);
    const messages = row.conversations.flatMap((conversation, index) => {
        assert(Array.isArray(conversation.messages) && conversation.messages.length);
        return conversation.messages.map((turn, i) => ({
            role: role(text(turn.speaker).toLowerCase()),
            content: (i === 0 ? `[Conversation ${index + 1}]\n` : '') + sourceText(turn.text),
        }));
    });
    // Preserve serialized order. No dates exist here; do not manufacture them.
    return { messages, question: text(row.evidenceItems[questionIndex].question) };
}

export function distribution(values) {
    assert(values.length);
    const sorted = [...values].sort((a, b) => a - b);
    const at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    return { count: sorted.length, min: sorted[0], p50: at(0.5), p90: at(0.9), max: sorted.at(-1),
        atMost32768: values.filter(n => n <= 32768).length,
        atMost131072: values.filter(n => n <= 131072).length };
}

function measure(input, count) {
    return { messages: input.messages.length,
        adaptedHistoryTokenEstimate: input.messages.reduce((n, m) => n + count(m.content) + 6, 0),
        questionTokenEstimate: count(input.question) + 6,
        inputSha256: sha(JSON.stringify(input)) };
}

function componentGroups(rows, field) {
    const parent = rows.map((_, i) => i), owners = new Map();
    const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    rows.forEach((row, index) => {
        for (const id of row[field]) {
            if (owners.has(id)) parent[root(index)] = root(owners.get(id));
            else owners.set(id, index);
        }
    });
    const groups = new Map();
    rows.forEach((row, i) => { const key = root(i); groups.set(key, [...(groups.get(key) || []), row.id]); });
    return { count: groups.size, byId: new Map([...groups.values()].flatMap(ids => {
        const key = sha(ids.sort().join('\n')); return ids.map(id => [id, key]);
    })) };
}

export function selectLongMemEval(rows) {
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    const evidenceGroups = componentGroups(rows, 'evidenceSessionIds');
    const sourceGroups = componentGroups(rows, 'historySessionIds');
    const ordered = [...rows].sort((a, b) => sha(`${auditSeed}:${a.id}`).localeCompare(sha(`${auditSeed}:${b.id}`)));
    const selected = [];
    for (const stratum of [...new Set(rows.map(row => row.stratum))].sort()) {
        for (const [split, limit] of [['development', 2], ['evaluation', 6]]) {
            const candidates = ordered.filter(row => row.stratum === stratum &&
                (parseInt(evidenceGroups.byId.get(row.id).slice(0, 8), 16) % 5 === 0 ? 'development' : 'evaluation') === split);
            assert(candidates.length >= limit, `Insufficient ${split} candidates for ${stratum}`);
            selected.push(...candidates.slice(0, limit).map(row => ({
                id: row.id, stratum, split, sourceIndex: row.sourceIndex,
                evidenceGroup: evidenceGroups.byId.get(row.id), inputSha256: row.inputSha256,
                adaptedHistoryTokenEstimate: row.adaptedHistoryTokenEstimate,
                auditFlags: [row.chronological === false ? 'within-day order' : null,
                    row.sourceAfterQuestion ? 'same-day source after question time' : null,
                    row.emptyMessages ? 'empty message' : null].filter(Boolean),
            })));
        }
    }
    const dev = selected.filter(r => r.split === 'development');
    const evaluation = selected.filter(r => r.split === 'evaluation');
    assert(!dev.some(a => evaluation.some(b => a.evidenceGroup === b.evidenceGroup)));
    const devRows = rows.filter(row => dev.some(r => r.id === row.id));
    const evalRows = rows.filter(row => evaluation.some(r => r.id === row.id));
    const devHistory = new Set(devRows.flatMap(row => row.historySessionIds));
    const evalHistory = new Set(evalRows.flatMap(row => row.historySessionIds));
    return { seed: auditSeed, status: 'frozen local question split; not an unseen-history benchmark',
        evidenceComponents: evidenceGroups.count, allHistoryComponents: sourceGroups.count,
        sharedHistorySessions: [...devHistory].filter(id => evalHistory.has(id)).length,
        evalEvidenceSessionsInDevHistory: [...new Set(evalRows.flatMap(row => row.evidenceSessionIds))].filter(id => devHistory.has(id)).length,
        samples: selected };
}

function auditLongMemEval(data, count) {
    assert(Array.isArray(data));
    const rows = data.map((row, index) => {
        if (index % 100 === 0) console.error(`LongMemEval schema/token audit ${index}/${data.length}`);
        const input = adaptLongMemEval(row), dates = row.haystack_dates.map(dateKey);
        assert(Array.isArray(row.answer_session_ids));
        assert(row.answer_session_ids.every(id => row.haystack_session_ids.includes(id)));
        return { id: text(row.question_id), sourceIndex: index, type: text(row.question_type),
            stratum: row.question_id.endsWith('_abs') ? 'abstention' : row.question_type,
            sessions: row.haystack_sessions.length, ...measure(input, count),
            evidenceSessionIds: row.answer_session_ids, historySessionIds: row.haystack_session_ids,
            labeledTurns: row.haystack_sessions.flat().filter(turn => turn.has_answer === true).length,
            emptyMessages: row.haystack_sessions.flat().filter(turn => !turn.content.trim()).length,
            chronological: dates.every((d, i) => i === 0 || dates[i - 1] <= d),
            sourceAfterQuestion: dates.some(d => d > dateKey(row.question_date)),
            chronologicalByDay: dates.every((d,i) => i === 0 || dates[i-1].slice(0,8) <= d.slice(0,8)),
            sourceAfterQuestionDay: dates.some(d => d.slice(0,8) > dateKey(row.question_date).slice(0,8)),
            evidenceAfterQuestion: dates.some((d,i) => row.answer_session_ids.includes(row.haystack_session_ids[i]) && d > dateKey(row.question_date)),
        };
    });
    const byType = Object.fromEntries([...new Set(rows.map(row => row.stratum))].sort().map(type =>
        [type, distribution(rows.filter(row => row.stratum === type).map(row => row.adaptedHistoryTokenEstimate))]));
    return { rows, summary: { questions: rows.length, byType,
        historyTokens: distribution(rows.map(row => row.adaptedHistoryTokenEstimate)),
        sessions: distribution(rows.map(row => row.sessions)), messages: distribution(rows.map(row => row.messages)),
        nonChronological: rows.filter(row => !row.chronological).map(row => row.id),
        sourceAfterQuestion: rows.filter(row => row.sourceAfterQuestion).map(row => row.id),
        nonChronologicalByDay: rows.filter(row => !row.chronologicalByDay).map(row => row.id),
        sourceAfterQuestionDay: rows.filter(row => row.sourceAfterQuestionDay).map(row => row.id),
        evidenceAfterQuestion: rows.filter(row => row.evidenceAfterQuestion).map(row => row.id),
        emptyMessages: rows.reduce((n,row) => n+row.emptyMessages,0),
        casesWithEmptyMessages: rows.filter(row => row.emptyMessages).map(row => row.id) } };
}

function auditConvoMem(data, file, count) {
    assert(Array.isArray(data) && data.length);
    const rows = data.map((row, index) => {
        const input = adaptConvoMem(row);
        const questions = row.evidenceItems.map(item => text(item.question));
        return { id: `${file.path}#${index}`, ...measure(input, count),
            contextSize: row.contextSize, conversations: row.conversations.length,
            questions: questions.length,
            questionGroup: sha(JSON.stringify(row.evidenceItems.map(item => [item.personId, item.question]))),
            evidenceConversations: row.conversations.filter(c => c.containsEvidence === true).length,
            evidenceMessages: row.evidenceItems.reduce((n, item) => n + item.message_evidences.length, 0) };
    });
    const sizes = [...new Set(rows.map(row => row.contextSize))].sort((a,b) => a-b);
    return { file: file.path, category: file.category, evidenceCount: file.evidenceCount,
        cases: rows.length, questions: rows.reduce((n,r) => n+r.questions,0),
        contextSizes: sizes, contextSizeMismatches: rows.filter(row => row.contextSize !== row.conversations).length,
        byContextSize: Object.fromEntries(sizes.map(size => [size,
            distribution(rows.filter(row => row.contextSize === size).map(row => row.adaptedHistoryTokenEstimate))])),
        conversationMessageCounts: distribution(data.flatMap(row => row.conversations.map(c => c.messages.length))),
        uniqueQuestionGroups: new Set(rows.map(row => row.questionGroup)).size,
        rows };
}

export function readVerifiedFile(directory, file) {
    assert.equal(path.basename(file.localName), file.localName, 'Unsafe cache name');
    const bytes = readFileSync(path.join(directory, file.localName));
    assert.equal(bytes.length, file.bytes, `Size mismatch: ${file.localName}`);
    assert.equal(sha(bytes), file.sha256, `Checksum mismatch: ${file.localName}`);
    return JSON.parse(bytes);
}

function tokenCounter(host) {
    assert(host, 'ST_SOURCE required for the pinned local tokenizer');
    assert.equal(execFileSync('git', ['-C', host, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hostRevision);
    const require = createRequire(path.resolve(host, 'package.json'));
    assert.equal(JSON.parse(readFileSync(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
    const encoder = require('tiktoken').get_encoding('o200k_base'), cache = new Map();
    return { count(value) {
        const key = sha(value);
        if (!cache.has(key)) cache.set(key, encoder.encode(value, [], []).length);
        return cache.get(key);
    }, close: () => encoder.free() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [directory, prefix] = process.argv.slice(2);
    assert(directory && prefix && process.argv.length === 4, 'Usage: benchmark-audit.mjs <cache> <output-prefix>');
    const lockBytes = readFileSync(new URL('../docs/benchmarks/sources-v1.json', import.meta.url));
    const lock = JSON.parse(lockBytes), counter = tokenCounter(process.env.ST_SOURCE);
    const report = { version: 'external-benchmark-audit-v1', sourcesSha256: sha(lockBytes),
        tokenizer: { package: 'tiktoken', version: '1.0.22', encoding: 'o200k_base', hostRevision,
            method: 'sum encoded adapted content plus six tokens per message; question separate',
            limitation: 'not a final SillyTavern prompt or provider usage; excludes character/system/output reservation' },
        producerSha256: sha(readFileSync(new URL(import.meta.url))), longmemeval: null, convomem: [] };
    let selection;
    const convoGroups = new Set(); let convoCases = 0, convoQuestions = 0;
    try {
        for (const file of lock.files) {
            const data = readVerifiedFile(directory, file);
            if (file.dataset === 'longmemeval') {
                const audit = auditLongMemEval(data, counter.count);
                report.longmemeval = audit.summary;
                selection = selectLongMemEval(audit.rows);
            } else {
                const audit = auditConvoMem(data, file, counter.count);
                const { rows, ...summary } = audit;
                for (const row of rows) convoGroups.add(row.questionGroup);
                convoCases += rows.length;
                convoQuestions += audit.questions;
                report.convomem.push(summary);
            }
            console.error(`Audited ${file.localName}`);
        }
    } finally { counter.close(); }
    report.convomemCoverage = { files: report.convomem.length, cases: convoCases,
        questions: convoQuestions, uniqueQuestionGroups: convoGroups.size,
        limitation: 'bounded first/middle/last eligible files, not a representative full-corpus distribution' };
    mkdirSync(path.dirname(prefix), { recursive: true });
    for (const [suffix, data] of [['audit', report], ['selection', { version: report.version,
        sourcesSha256: report.sourcesSha256, tokenizer: report.tokenizer, ...selection }]]) {
        writeFileSync(`${prefix}-${suffix}.json`, JSON.stringify(data, null, 2)+'\n', { flag: 'wx' });
    }
}
