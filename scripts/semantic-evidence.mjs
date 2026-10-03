// Offline evidence-contract tooling. No retrieval, model or runtime selector calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const evidenceKinds = ['answer', 'correction', 'negation', 'qualification', 'reference', 'attribution'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const loadSemanticFixture = () => JSON.parse(readFileSync(new URL('../tests/fixtures/semantic-evidence-v1.json', import.meta.url)));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const boundary = (text, offset) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
function validSpan(text, start, end) {
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length && boundary(text, start) && boundary(text, end);
}

export function validateSemanticCase(item) {
    assert(item && nonempty(item.id) && ['en', 'ko'].includes(item.language) && nonempty(item.question), 'Invalid case identity/question');
    assert(nonempty(item.shape) && nonempty(item.rationale), 'Missing case rationale');
    assert(Array.isArray(item.messages) && item.messages.length > 0, 'Missing source messages');
    for (const message of item.messages) assert(message && ['user', 'assistant'].includes(message.role) && nonempty(message.speaker) && nonempty(message.text), 'Invalid source message');
    assert(['answer', 'abstain'].includes(item.expected?.type) && nonempty(item.expected.answerRule), 'Missing answer rubric');
    assert.equal(item.shape === 'unknown', item.expected.type === 'abstain', 'Unknown shape/type mismatch');
    assert(Array.isArray(item.expected.forbiddenClaims) && item.expected.forbiddenClaims.length > 0 && item.expected.forbiddenClaims.every(nonempty), 'Missing forbidden claims');
    assert(Array.isArray(item.evidence), 'Missing evidence annotations');
    assert.equal(new Set(item.evidence.map(ref => ref.id)).size, item.evidence.length, 'Duplicate evidence ID');
    for (const ref of item.evidence) {
        assert(nonempty(ref.id) && evidenceKinds.includes(ref.kind) && nonempty(ref.reason) && nonempty(ref.quote), 'Invalid evidence annotation');
        assert(Number.isInteger(ref.message) && ref.message >= 0 && ref.message < item.messages.length, 'Unknown evidence message');
        const message = item.messages[ref.message];
        assert(validSpan(message.text, ref.start, ref.end), 'Invalid evidence offsets');
        assert.equal(message.text.slice(ref.start, ref.end), ref.quote, 'Evidence quote/source mismatch');
    }
    // Each requirement can be removed independently in contract mutation probes.
    for (let i = 0; i < item.evidence.length; i++) for (const other of item.evidence.slice(i + 1)) {
        const ref = item.evidence[i];
        assert(ref.message !== other.message || ref.end <= other.start || other.end <= ref.start, 'Overlapping evidence annotations');
    }
    if (item.expected.type === 'abstain') assert.equal(item.evidence.length, 0, 'Unknown cases must not claim known-answer coverage');
    else assert(item.evidence.some(ref => ref.kind === 'answer'), 'Answer case lacks answer-bearing evidence');
    return item;
}

// Source identity binds the entire conversation, roles/names, question and case.
// It deliberately does not include rubrics: these never travel to a candidate.
export const sourceIdentity = item => sha(JSON.stringify({ id: item.id, question: item.question, messages: item.messages }));
export function candidateInput(item) {
    validateSemanticCase(item);
    return { messages: item.messages.map(({ role, speaker, text }) => ({ role, name: speaker, content: text })), question: item.question };
}
export function sourceExcerpt(item, message, start, end) {
    validateSemanticCase(item);
    assert(Number.isInteger(message) && message >= 0 && message < item.messages.length, 'Unknown excerpt message');
    const source = item.messages[message];
    assert(validSpan(source.text, start, end), 'Invalid excerpt offsets');
    return { caseId: item.id, sourceHash: sourceIdentity(item), message, role: source.role, speaker: source.speaker,
        start, end, text: source.text.slice(start, end) };
}

export function evidenceCoverage(item, excerpts) {
    validateSemanticCase(item);
    assert(Array.isArray(excerpts), 'Missing excerpts');
    const sourceHash = sourceIdentity(item);
    for (const excerpt of excerpts) {
        assert(excerpt && excerpt.caseId === item.id && excerpt.sourceHash === sourceHash, 'Wrong case or stale source');
        assert(Number.isInteger(excerpt.message) && excerpt.message >= 0 && excerpt.message < item.messages.length, 'Unknown excerpt message');
        const source = item.messages[excerpt.message];
        assert.equal(excerpt.role, source.role, 'Source role changed');
        assert.equal(excerpt.speaker, source.speaker, 'Source speaker changed');
        assert(validSpan(source.text, excerpt.start, excerpt.end), 'Invalid excerpt offsets');
        assert.equal(excerpt.text, source.text.slice(excerpt.start, excerpt.end), 'Excerpt/source mismatch');
    }
    const units = item.evidence.map(ref => ({ id: ref.id, kind: ref.kind,
        covered: excerpts.some(excerpt => excerpt.message === ref.message && excerpt.start <= ref.start && excerpt.end >= ref.end) }));
    const answer = units.filter(unit => unit.kind === 'answer'), context = units.filter(unit => unit.kind !== 'answer');
    return { caseId: item.id, sourceHash, answerType: item.expected.type,
        answerSpans: { covered: answer.filter(unit => unit.covered).length, total: answer.length },
        mandatoryContext: { covered: context.filter(unit => unit.covered).length, total: context.length },
        missing: units.filter(unit => !unit.covered).map(unit => unit.id), units,
        // Empty evidence for unknowns must never turn into a vacuous success.
        completeEvidence: item.expected.type === 'abstain' ? null : units.every(unit => unit.covered),
        answerQuality: null };
}

export function auditSemanticFixture(fixture) {
    assert.equal(fixture.version, 'semantic-evidence-v1');
    assert.equal(fixture.status, 'proposed');
    assert.equal(fixture.humanReview, null, 'This audit cannot certify human review');
    assert.equal(fixture.candidateResults, null, 'Contract audit must not contain candidate results');
    assert(nonempty(fixture.authorship) && Array.isArray(fixture.cases) && fixture.cases.length === 16, 'Incomplete fixture');
    assert.equal(new Set(fixture.cases.map(item => item.id)).size, fixture.cases.length, 'Duplicate case ID');
    const shapes = ['minimal-fact', 'correction', 'negation', 'condition', 'speaker', 'reference', 'quotation', 'unknown'];
    for (const language of ['en', 'ko']) for (const shape of shapes) assert.equal(fixture.cases.filter(item => item.language === language && item.shape === shape).length, 1, `Missing/duplicate ${language}/${shape}`);
    const rows = [];
    for (const item of fixture.cases) {
        validateSemanticCase(item);
        const minimal = item.evidence.map(ref => sourceExcerpt(item, ref.message, ref.start, ref.end));
        const full = item.messages.map((message, i) => sourceExcerpt(item, i, 0, message.text.length));
        const emptyResult = evidenceCoverage(item, []), minimalResult = evidenceCoverage(item, minimal), fullResult = evidenceCoverage(item, full);
        assert.equal(minimalResult.completeEvidence, item.expected.type === 'answer' ? true : null);
        assert.equal(fullResult.completeEvidence, minimalResult.completeEvidence);
        assert.equal(emptyResult.completeEvidence, item.expected.type === 'answer' ? false : null);
        const omissionProbes = item.evidence.map((ref, i) => {
            const result = evidenceCoverage(item, minimal.filter((_, j) => j !== i));
            assert.equal(result.completeEvidence, false); assert.deepEqual(result.missing, [ref.id]);
            return { omitted: ref.id, kind: ref.kind, missing: result.missing, completeEvidence: false };
        });
        const answerOnly = evidenceCoverage(item, minimal.filter((_, i) => item.evidence[i].kind === 'answer'));
        rows.push({ id: item.id, language: item.language, shape: item.shape, sourceHash: sourceIdentity(item),
            full: fullResult, minimal: minimalResult, answerOnly, omissionProbes, answerQuality: null });
    }
    return { version: fixture.version, kind: 'Offline annotation and evaluator contract audit; oracle-constructed excerpts, not retrieval results',
        integrityPassed: true, serviceCalls: 0, candidateEvaluated: false, answerQuality: null, humanReview: null,
        summary: { cases: rows.length, answerCases: rows.filter(row => row.full.answerType === 'answer').length,
            unknownCases: rows.filter(row => row.full.answerType === 'abstain').length,
            requiredUnits: rows.reduce((sum, row) => sum + row.minimal.units.length, 0),
            omissionProbes: rows.reduce((sum, row) => sum + row.omissionProbes.length, 0),
            contextDependentCases: rows.filter(row => row.answerOnly.mandatoryContext.total > 0).length }, rows };
}

export function renderSemanticReview(fixture) {
    auditSemanticFixture(fixture);
    const lines = ['# Semantic evidence fixture review', '', '**Status: proposed; human semantic review pending.**', '',
        'These are fresh short synthetic annotation cases, not live or long-context results.',
        'Confirm minimum answer spans, mandatory context, speaker/quotation attribution and forbidden claims.',
        'The source-only candidate input excludes this rubric. No candidate has been evaluated here.', '',
        `Fixture SHA-256: \`${sha(JSON.stringify(fixture))}\` (parsed JSON serialization).`, '',
        'Reviewer: _unfilled_', '', 'Review date: _unfilled_', ''];
    for (const item of fixture.cases) {
        lines.push(`## ${item.id}`, '', `**Question:** ${item.question}`, '', '**Source:**', '');
        for (const [i, message] of item.messages.entries()) lines.push(`- Message ${i} · ${message.role} · ${message.speaker}: ${message.text}`);
        lines.push('', `**Expected answer rule:** ${item.expected.answerRule}`, '', '**Required spans:**', '');
        if (!item.evidence.length) lines.push('No known-answer spans. Evidence completeness is null; abstention needs later answer review.');
        for (const ref of item.evidence) lines.push(`- ${ref.id} (${ref.kind}), message ${ref.message}, UTF-16 [${ref.start}, ${ref.end}): ${ref.quote}`, `  Reason: ${ref.reason}`);
        lines.push('', '**Forbidden claims:**', '', ...item.expected.forbiddenClaims.map(text => `- ${text}`), '', `**Rationale:** ${item.rationale}`, '',
            '- [ ] A human reviewed this case and recorded any corrections.', '', 'Reviewer notes: _unfilled_', '');
    }
    return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [directory] = process.argv.slice(2);
    assert(directory && process.argv.length === 3, 'Usage: node scripts/semantic-evidence.mjs new-output-directory');
    const fixture = loadSemanticFixture(), report = auditSemanticFixture(fixture), review = renderSemanticReview(fixture);
    const files = ['scripts/semantic-evidence.mjs', 'tests/fixtures/semantic-evidence-v1.json', 'docs/semantic-evidence-contract.md'];
    report.sourceSha256 = Object.fromEntries(files.map(file => [file, sha(readFileSync(new URL(`../${file}`, import.meta.url)))]));
    // A new directory avoids overwriting either results or human annotations.
    mkdirSync(directory);
    writeFileSync(path.join(directory, 'audit.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(path.join(directory, 'review.md'), review, { flag: 'wx' });
    console.log(JSON.stringify({ directory, ...report.summary, serviceCalls: 0, candidateEvaluated: false, humanReview: null }));
}
