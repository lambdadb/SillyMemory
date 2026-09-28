import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNaturalFixture, hash, naturalCases, naturalSchedule, auditNaturalDialogue } from '../scripts/natural-dialogue.mjs';

test('natural corpus and oracle are frozen with bilingual category coverage and unique dialogue turns', () => {
    const fixture = loadNaturalFixture();
    assert.equal(hash(fixture), '17fa71452939ed093a5e16e67973a17380e806eade85ebe9754ff0a904e0555e');
    assert.equal(fixture.stories.length, 4);
    for (const story of fixture.stories) {
        assert.equal(story.messages.length, 32);
        assert.equal(new Set(story.messages.map(m => m.text)).size, story.messages.length);
    }
    const cases = naturalCases(); assert.equal(cases.length, 16);
    for (const language of ['en', 'ko']) for (const kind of ['return', 'correction', 'reference', 'unknown']) assert.equal(cases.filter(c => c.language === language && c.kind === kind).length, 2);
    for (const item of cases) assert.deepEqual(Object.keys(item.input).sort(), ['question', 'source', 'type']);
    cases[0].rubric.requiredEvidence[0].quote = 'Changed oracle';
    assert.notEqual(naturalCases()[0].rubric.requiredEvidence[0].quote, 'Changed oracle');
});

test('schedule pairs every case and repetition, reverses condition order and never substitutes samples', () => {
    const schedule = naturalSchedule(); assert.equal(schedule.length, 64);
    assert.equal(new Set(schedule.map(s => s.id)).size, 64);
    for (const item of naturalCases()) {
        const first = schedule.filter(s => s.case === item.id && s.repetition === 1).map(s => s.mode);
        const second = schedule.filter(s => s.case === item.id && s.repetition === 2).map(s => s.mode);
        assert.deepEqual([...first].sort(), ['off', 'on']); assert.deepEqual(second, [...first].reverse());
    }
});

test('fixture validation rejects leaked or misidentified evidence and reversed corrections', () => {
    let fixture = loadNaturalFixture();
    fixture.cases[0].question += fixture.cases[0].requiredEvidence[0].quote;
    assert.throws(() => naturalCases(fixture), /leaked/);
    fixture = loadNaturalFixture(); fixture.cases[0].requiredEvidence[0].message = 31;
    assert.throws(() => naturalCases(fixture), /outside recent/);
    fixture = loadNaturalFixture(); fixture.cases[0].requiredEvidence[0].quote = 'not in the conversation';
    assert.throws(() => naturalCases(fixture), /quote must match/);
    fixture = loadNaturalFixture(); const correction = fixture.cases.find(c => c.kind === 'correction');
    const old = correction.supersededEvidence[0], current = correction.requiredEvidence[0];
    correction.requiredEvidence = [{ ...old, meaning: 'Reversed truth' }]; correction.supersededEvidence = [current];
    assert.throws(() => naturalCases(fixture), /must follow/);
});

test('offline audit proves source eligibility without claiming ranking or generation quality', async () => {
    const audit = await auditNaturalDialogue();
    assert.equal(audit.kind, 'offline fixture audit'); assert.equal(audit.serviceCalls, 0);
    assert.equal(audit.cases, 16); assert.equal(audit.scheduledSamples, 64);
    assert.equal(audit.rows.filter(r => r.requiredEvidence.length).length, 12);
    for (const row of audit.rows) {
        assert(row.indexableChunks > 0); assert(row.queries.length >= 1);
        for (const evidence of row.requiredEvidence) assert(evidence.documentIds.every(id => /^[a-f0-9]{64}_[a-f0-9]{64}_\d+$/.test(id)));
    }
    assert.equal(audit.accuracy, undefined);
});

test('offline CLI exports reviewable inputs/oracle identities and refuses to overwrite evidence', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sillymemory-natural-'));
    try {
        const output = path.join(directory, 'plan.json');
        const script = fileURLToPath(new URL('../scripts/natural-dialogue.mjs', import.meta.url));
        const run = () => spawnSync(process.execPath, [script, '--output', output], { cwd: tmpdir(), encoding: 'utf8' });
        const result = run(); assert.equal(result.status, 0, result.stderr);
        const contents = readFileSync(output, 'utf8'), plan = JSON.parse(contents);
        assert.equal(plan.results, null); assert.equal(plan.schedule.length, 64);
        assert.equal(plan.audit.fixtureHash, hash(loadNaturalFixture()));
        assert(plan.sourceSha256['docs/natural-dialogue-evaluation.md']);
        assert(plan.sourceSha256['src/memory.js']);
        assert.notEqual(run().status, 0); assert.equal(readFileSync(output, 'utf8'), contents);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
