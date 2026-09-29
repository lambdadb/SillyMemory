// Local file-only form checks with synthetic annotations, never real human scores.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { renderReview } from './natural-review.mjs';
const source = [{ speaker: 'User', text: 'I moved the chart. </script><script>globalThis.injected=true</script>' }];
const packet = { version: 'natural-human-review-v1', reportHash: 'a'.repeat(64), reviewer: null, reviewerType: 'human', records: [
    { reviewId: 'synthetic-answer', question: 'Who moved it?', source, rubric: { requiredEvidence: [{ message: 0, quote: 'I moved the chart.', meaning: 'The user moved it.' }], supersededEvidence: [], answerRule: 'Identify the actor.' }, answer: 'You moved it.', outcome: null, unsupportedAssertion: null, rationale: null },
    { reviewId: 'synthetic-unknown', question: 'What did it cost?', source, rubric: { requiredEvidence: [], supersededEvidence: [], answerRule: 'Price was not stated.' }, answer: 'The cost was not stated.', outcome: null, unsupportedAssertion: null, rationale: null },
] };
const directory = await mkdtemp(path.join(tmpdir(), 'sillymemory-human-review-'));
const browser = await chromium.launch(); const checks = [], errors = [], network = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
try {
    const filename = path.join(directory, 'review.html'); await writeFile(filename, renderReview(packet));
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(filename).href);
    check('source script markup remains literal and cannot execute', await page.evaluate(() => globalThis.injected === undefined) && (await page.locator('#source').innerText()).includes('</script>'));
    await page.locator('#final').click(); check('incomplete annotation cannot be finalized', (await page.locator('#message').innerText()).startsWith('Enter a reviewer'));
    await page.locator('#outcome').selectOption('correct'); await page.locator('#unsupported').selectOption('false'); await page.locator('#rationale').fill('Synthetic test: correct user actor.');
    const draftDownload = page.waitForEvent('download'); await page.locator('#draft').click();
    const draft = JSON.parse(await readFile(await (await draftDownload).path(), 'utf8'));
    check('draft preserves identities and unscored items', draft.records[0].reviewId === packet.records[0].reviewId && draft.records[1].outcome === null);
    const resumeFile = path.join(directory, 'resume.html'); await writeFile(resumeFile, renderReview(draft)); await page.goto(pathToFileURL(resumeFile).href);
    check('draft can be resumed without browser storage', await page.locator('#outcome').inputValue() === 'correct' && await page.locator('#rationale').inputValue() === draft.records[0].rationale);
    await page.locator('#next').click();
    check('unknown cases offer only compatible semantic outcomes', await page.locator('#outcome option').count() === 3);
    await page.locator('#outcome').selectOption('unknown-handled'); await page.locator('#unsupported').selectOption('true'); await page.locator('#rationale').fill('Synthetic test: unspecified price.'); await page.locator('#reviewer').fill('Synthetic UI test, not an actual human review');
    await page.locator('#final').click(); check('contradictory unknown-handled plus unsupported annotation is blocked', (await page.locator('#message').innerText()).startsWith('Enter a reviewer'));
    await page.locator('#unsupported').selectOption('false');
    const finalDownload = page.waitForEvent('download'); await page.locator('#final').click();
    const result = JSON.parse(await readFile(await (await finalDownload).path(), 'utf8'));
    const strip = value => value.records.map(({ outcome, unsupportedAssertion, rationale, ...record }) => record);
    assert.deepEqual(strip(result), strip(packet));
    check('export changes only reviewer and annotation fields', result.reportHash === packet.reportHash && result.records.every(r => r.rationale && r.unsupportedAssertion === false));
    check('form uses no network and has no uncaught browser errors', network.length === 0 && errors.length === 0);
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/review-ui-smoke.json', JSON.stringify({ passed: true, kind: 'Synthetic local UI check, not real human scoring', browser: browser.version(), checks, errors, networkRequests: network.length }, null, 2));
    console.log(JSON.stringify({ passed: true, checks: checks.length }));
} finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
