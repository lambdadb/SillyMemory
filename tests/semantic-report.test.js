import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLong, longSchedule, semanticPromptEvidence, sourceFiles, sha } from '../scripts/semantic-long.mjs';
import { summarizeSemantic, semanticReviewPacket, verifySourcePresence } from '../scripts/semantic-results.mjs';
import { summarizeProviderSpacing } from '../scripts/provider-spacing.mjs';
const reports = [1, 2, 3].map(n => JSON.parse(readFileSync(new URL(`../docs/results/semantic-long-incomplete-v${n}.json`, import.meta.url))));
test('incomplete live runs cannot produce a successful delivery summary or answer-review packet', () => {
    for (const report of reports) {
        assert.equal(report.passed, false); assert(report.failure); assert(report.cleanupComplete && report.nativeCleanupComplete);
        assert.throws(() => summarizeSemantic(report), /Complete successful integrity/);
        assert.throws(() => semanticReviewPacket(report), /Complete successful integrity/);
        const forged = structuredClone(report); forged.passed = true; delete forged.failure;
        assert.throws(() => summarizeSemantic(forged));
    }
});
test('recorded partial run retains exact outgoing evidence, every provider answer and verified owned cleanup', () => {
    const fixture = loadLong(), schedule = longSchedule(fixture), [first, second] = reports;
    assert.equal(first.evaluation.rows.length, 10); assert.equal(first.evaluation.complete, false);
    assert.equal(first.generations.length, 11); assert.equal(first.providerCalls, 11);
    assert.equal(second.generations.length, 0); assert.equal(second.providerCalls, 0);
    for (const [index, row] of first.evaluation.rows.entries()) {
        const generation = first.generations[index], item = fixture.cases.find(c => c.id === row.case);
        assert.equal(row.id, schedule[index].id);
        assert.deepEqual(row.coverage, semanticPromptEvidence(item, row.passages, generation.messages));
        assert.equal(row.answer, generation.answer); assert.equal(generation.providerAnswer.trim(), row.answer.trim());
    }
    for (const generation of first.generations) {
        assert.equal(generation.upstreamStatus, 200); assert.equal(generation.attempts.length, 1);
        assert.equal(generation.finishReason, 'stop'); assert.equal(generation.providerAnswer.trim(), generation.answer.trim());
    }
    assert(summarizeProviderSpacing(first.generations, first.providerSpacing).verified);
    for (const report of reports) {
        for (const file of sourceFiles) {
            assert.equal(report.initialSourceSha256[file], report.sourceSha256[file]);
            const recordedSource = file === 'scripts/semantic-results.mjs' ? 'tests/fixtures/semantic-results-v1.txt' : file;
            assert.equal(report.sourceSha256[file], sha(readFileSync(new URL(`../${recordedSource}`, import.meta.url))));
        }
        const failures = report.lambdaRequests.filter(r => r.failed);
        assert.equal(failures.length, 1);
        assert(failures[0].path.endsWith(report === reports[2] ? '/docs/upsert' : '/query'));
        assert(failures[0].elapsedMs >= 15000);
        const deletes = report.lambdaRequests.filter(r => r.method === 'DELETE'); assert(deletes.length);
        for (const deleted of deletes) assert(report.lambdaRequests.some(r => r.method === 'GET' && r.path === deleted.path && r.status === 404));
    }
});

test('source-presence verification rejects forged truncation and changed counts against captured prompts', () => {
    const source = [{ mes: 'An old fact.' }, { mes: 'Recent filler.' }, { mes: 'Recent filler.' }];
    assert.equal(verifySourcePresence({ mode: 'off', sourceMessagesPresent: 2 }, source, 'Recent filler.'), 2);
    assert.throws(() => verifySourcePresence({ mode: 'off', sourceMessagesPresent: 2 }, source, 'An old fact. Recent filler.'), /metadata differs/);
    assert.throws(() => verifySourcePresence({ mode: 'off', sourceMessagesPresent: 3 }, source, 'An old fact. Recent filler.'), /entire source/);
    assert.throws(() => verifySourcePresence({ mode: 'on', sourceMessagesPresent: 0 }, source, 'Recent filler.'), /metadata differs/);
});
