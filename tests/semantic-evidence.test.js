import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadSemanticFixture, validateSemanticCase, sourceIdentity, sourceExcerpt, evidenceCoverage,
    candidateInput, auditSemanticFixture, renderSemanticReview } from '../scripts/semantic-evidence.mjs';

const fixture = loadSemanticFixture();
const item = id => structuredClone(fixture.cases.find(item => item.id === id));
const minimum = source => source.evidence.map(ref => sourceExcerpt(source, ref.message, ref.start, ref.end));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('all fresh fixture annotations are auditable; minimum spans suffice and every omitted requirement fails', () => {
    const audit = auditSemanticFixture(fixture);
    assert.deepEqual(audit.summary, { cases: 16, answerCases: 14, unknownCases: 2, requiredUnits: 30, omissionProbes: 30, contextDependentCases: 10 });
    assert.equal(audit.candidateEvaluated, false); assert.equal(audit.answerQuality, null); assert.equal(audit.humanReview, null);
    for (const row of audit.rows) {
        assert.equal(row.full.completeEvidence, row.minimal.completeEvidence);
        assert.equal(row.minimal.answerQuality, null);
        if (row.minimal.answerType === 'answer') {
            assert(row.minimal.completeEvidence);
            assert(row.omissionProbes.every(probe => !probe.completeEvidence && probe.missing.length === 1));
        } else {
            assert.equal(row.minimal.completeEvidence, null);
            assert.equal(row.omissionProbes.length, 0);
        }
    }
});

test('decorative text is optional but conditions, cancellations and cross-message attribution are mandatory', () => {
    for (const lang of ['en', 'ko']) {
        const simple = item(`${lang}-minimal-fact`), minimal = minimum(simple);
        assert(minimal[0].text.length < simple.messages[0].text.length);
        assert.equal(evidenceCoverage(simple, minimal).completeEvidence, true);
        for (const shape of ['correction', 'negation', 'condition', 'reference', 'quotation']) {
            const source = item(`${lang}-${shape}`);
            const answerOnly = source.evidence.filter(ref => ref.kind === 'answer').map(ref => sourceExcerpt(source, ref.message, ref.start, ref.end));
            const partial = evidenceCoverage(source, answerOnly);
            assert.equal(partial.answerSpans.covered, partial.answerSpans.total);
            assert.equal(partial.mandatoryContext.covered, 0);
            assert(partial.mandatoryContext.total > 0);
            assert.equal(partial.completeEvidence, false);
        }
    }
});

test('wrong role/speaker, stale or foreign source, altered text and invalid offsets reject instead of becoming successes', () => {
    const source = item('en-speaker'), valid = minimum(source), original = structuredClone(valid);
    for (const [field, value, error] of [
        ['role', 'assistant', /Source role changed/], ['speaker', 'Lina', /Source speaker changed/],
        ['caseId', 'ko-speaker', /Wrong case/], ['sourceHash', 'stale', /stale source/],
        ['message', 50, /Unknown excerpt/], ['message', -1, /Unknown excerpt/], ['message', 0.5, /Unknown excerpt/],
        ['text', 'I will collect the silver case.', /Excerpt\/source mismatch/],
        ['start', -1, /Invalid excerpt offsets/], ['end', 10000, /Invalid excerpt offsets/],
    ]) {
        const changed = structuredClone(valid); changed[0][field] = value;
        assert.throws(() => evidenceCoverage(source, changed), error);
    }
    const changedSource = structuredClone(source); changedSource.messages[1].text += ' A new update.';
    assert.notEqual(sourceIdentity(changedSource), sourceIdentity(source));
    assert.throws(() => evidenceCoverage(changedSource, valid), /stale source/);
    const changedQuestion = structuredClone(source); changedQuestion.question += ' Please confirm.';
    assert.throws(() => evidenceCoverage(changedQuestion, valid), /stale source/);
    assert.deepEqual(valid, original);
});

test('duplicated excerpts do not inflate units; fragments cannot manufacture an intact required sentence', () => {
    const source = item('en-minimal-fact'), [excerpt] = minimum(source);
    const full = evidenceCoverage(source, [excerpt]);
    assert.deepEqual(evidenceCoverage(source, [excerpt, excerpt]), full);
    const middle = excerpt.start + 15;
    const halves = [sourceExcerpt(source, excerpt.message, excerpt.start, middle), sourceExcerpt(source, excerpt.message, middle, excerpt.end)];
    assert.equal(evidenceCoverage(source, halves).completeEvidence, false);
    assert.deepEqual(evidenceCoverage(source, halves).missing, ['delivery']);
});

test('UTF-16 source offsets preserve non-BMP characters and reject half-surrogate boundaries', () => {
    const source = item('en-minimal-fact');
    source.messages[0].text = '🧭 ' + source.messages[0].text;
    source.evidence[0].start += 3; source.evidence[0].end += 3;
    validateSemanticCase(source);
    assert.equal(evidenceCoverage(source, minimum(source)).completeEvidence, true);
    assert.equal(sourceExcerpt(source, 0, 0, 2).text, '🧭');
    assert.throws(() => sourceExcerpt(source, 0, 0, 1), /Invalid excerpt offsets/);
    assert.throws(() => sourceExcerpt(source, 0, 1, 3), /Invalid excerpt offsets/);
});

test('unknowns never earn a positive evidence score or an automatic answer-quality grade', () => {
    for (const lang of ['en', 'ko']) {
        const source = item(`${lang}-unknown`);
        const result = evidenceCoverage(source, []);
        assert.equal(result.completeEvidence, null); assert.equal(result.answerQuality, null);
        assert.deepEqual(result.answerSpans, { covered: 0, total: 0 });
        const full = source.messages.map((message, i) => sourceExcerpt(source, i, 0, message.text.length));
        assert.equal(evidenceCoverage(source, full).completeEvidence, null);
    }
});

test('candidate inputs exclude all oracle metadata and cannot mutate the original fixture', () => {
    const source = item('en-quotation'), original = structuredClone(source), input = candidateInput(source);
    assert.deepEqual(Object.keys(input).sort(), ['messages', 'question']);
    assert(input.messages.every(message => Object.keys(message).sort().join(',') === 'content,name,role'));
    input.messages[0].content = 'changed'; input.messages.push({ role: 'user', name: 'User', content: 'extra' });
    assert.deepEqual(source, original);
});

test('malformed or incomplete rubrics and unsupported review claims fail the fixture audit', () => {
    const mutations = [
        f => { f.cases.pop(); },
        f => { f.cases[1].id = f.cases[0].id; },
        f => { f.cases[1].language = 'en'; f.cases[1].shape = 'minimal-fact'; },
        f => { f.cases[0].evidence[0].quote = 'Invented'; },
        f => { f.cases[0].evidence[0].end++; },
        f => { f.cases[0].evidence[0].reason = ''; },
        f => { f.cases[0].evidence[0].kind = 'optional'; },
        f => { f.cases[0].evidence.push({ ...f.cases[0].evidence[0], id: 'overlap' }); },
        f => { f.cases[0].expected.forbiddenClaims = []; },
        f => { f.cases[0].expected.type = 'abstain'; f.cases[0].evidence = []; },
        f => { f.humanReview = { approved: true }; },
        f => { f.candidateResults = { passed: true }; },
    ];
    for (const mutate of mutations) { const changed = structuredClone(fixture); mutate(changed); assert.throws(() => auditSemanticFixture(changed)); }
});

test('review packet stays unscored and matches the checked-in generated artifacts and input hashes', () => {
    const review = renderSemanticReview(fixture);
    assert.equal((review.match(/- \[ \] A human reviewed/g) || []).length, 16);
    assert(!review.includes('- [x]'));
    assert(review.includes('Reviewer: _unfilled_') && review.includes('Review date: _unfilled_'));
    assert.equal(readFileSync(new URL('../docs/semantic-evidence-review.md', import.meta.url), 'utf8'), review);
    const { sourceSha256, ...report } = JSON.parse(readFileSync(new URL('../docs/results/semantic-evidence-audit-v1.json', import.meta.url)));
    assert.deepEqual(report, auditSemanticFixture(fixture));
    assert.deepEqual(Object.keys(sourceSha256).sort(), ['docs/semantic-evidence-contract.md','scripts/semantic-evidence.mjs','tests/fixtures/semantic-evidence-v1.json']);
    for (const [file, hash] of Object.entries(sourceSha256)) assert.equal(sha(readFileSync(new URL(`../${file}`, import.meta.url))), hash, `Audit input changed: ${file}`);
});

test('CLI writes reviewable offline artifacts and refuses to overwrite existing human notes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sillymemory-semantic-'));
    const output = path.join(directory, 'review');
    const script = fileURLToPath(new URL('../scripts/semantic-evidence.mjs', import.meta.url));
    try {
        const response = execFileSync(process.execPath, [script, output], { encoding: 'utf8' });
        assert.equal(JSON.parse(response).candidateEvaluated, false);
        const before = readFileSync(path.join(output, 'review.md'), 'utf8');
        const retry = spawnSync(process.execPath, [script, output], { encoding: 'utf8' });
        assert.notEqual(retry.status, 0);
        assert.equal(readFileSync(path.join(output, 'review.md'), 'utf8'), before);
        // Refuse any existing directory even before writing either artifact.
        const existing = path.join(directory, 'existing'); mkdirSync(existing);
        assert.notEqual(spawnSync(process.execPath, [script, existing], { encoding: 'utf8' }).status, 0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
