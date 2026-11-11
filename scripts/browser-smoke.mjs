import { runSetupRecoveryScenarios } from './setup-recovery-scenarios.mjs';
import { answerMemoryPopup, chatMemoryAction, chatMemorySync, memoryControl, expandMemorySettings, openMemoryConnection, openChatMemory } from './settings-panel.mjs';
import { runPerChatMemoryScenarios } from './per-chat-memory-scenarios.mjs';
import { runNativeReplyScenarios } from './native-reply-scenarios.mjs';
import { runNativeChatScenarios } from './native-chat-scenarios.mjs';
import { runGroupChatScenarios } from './group-chat-scenarios.mjs';
import { collectionResponse, branchResponse, documentResponse, rerankedResponse } from '../tests/helpers/lambdadb-responses.js';
// Real pinned SillyTavern + real Chromium + direct browser CORS; LambdaDB is emulated.
// Never use this harness with personal data or a real API key.
import { emulatorCors } from './emulator-cors.mjs';
import { faultController, runFaultScenarios } from './fault-scenarios.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, symlink, lstat, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const recoveryMode = process.argv.includes('--recovery');
const faultMode = process.argv.includes('--faults') || recoveryMode;
const artifactTag = process.env.SM_ARTIFACT_TAG || '';
if (artifactTag && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag)) throw new Error('Invalid SM_ARTIFACT_TAG.');
const artifactName = `${recoveryMode ? 'recovery' : faultMode ? 'fault' : 'browser'}-smoke${artifactTag ? `-${artifactTag}` : ''}.json`;
const faults = faultController();
let faultResults, nativeChatResults, groupChatResults;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-smoke-'));
const artifacts = path.join(root, 'artifacts', artifactTag); await mkdir(artifacts, { recursive: true });
const extension = path.join(source, 'public/scripts/extensions/third-party/sillymemory');
try { await lstat(extension); } catch (error) { if (error.code !== 'ENOENT') throw error; await symlink(root, extension); }
assert.equal(await realpath(extension), root, 'Host extension must point to the checkout under test.');
const cert = path.join(work, 'cert.pem'), key = path.join(work, 'key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
const collections = new Map(); const calls = []; let delayedQuery = 0; let staleHits = []; let failQuery = false; let corsEnabled = true; let proxyRequests = 0; let preflights = 0;
const remote = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    if (emulatorCors(req, res, corsEnabled)) { preflights++; return; }
    const buffers = []; for await (const b of req) buffers.push(b);
    const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
    calls.push({ method: req.method, path: req.url, body, keyPresent: req.headers['x-api-key'] === 'synthetic-session-key', cookiePresent: Boolean(req.headers.cookie), csrfPresent: Boolean(req.headers['x-csrf-token']), origin: req.headers.origin });
    const send = (status, value = { message: 'OK' }) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers['x-api-key'] !== 'synthetic-session-key') return send(401, { message: 'synthetic auth failure' });
    const parts = new URL(req.url, 'https://localhost').pathname.split('/').filter(Boolean);
    if (parts[0] !== 'projects' || parts[1] !== 'synthetic' || parts[2] !== 'collections') return send(404);
    const name = parts[3];
    if (!name && req.method === 'GET') return faults.respond('connection', () => [200, { collections: [...collections.values()].map(c => c.definition) }], send);
    if (!name && req.method === 'POST') {
        if (collections.has(body.collectionName)) return send(409);
        assert.equal(body.indexConfigs.embedding.managedEmbedding, true);
        return faults.respond('create', () => { collections.set(body.collectionName, { definition: collectionResponse(body), branches: new Map([['main', new Map()]]) }); return [201, { collection: collectionResponse(body) }]; }, send);
    }
    const c = collections.get(name); if (!c) return send(404);
    if (parts.length === 4 && req.method === 'GET') return send(200, { collection: c.definition });
    if (parts.length === 4 && req.method === 'DELETE') return faults.respond('delete-collection', () => { collections.delete(name); return [200, { message: 'OK' }]; }, send);
    if (parts[4] === 'branches') {
        if (req.method === 'GET') return send(200, { branches: [...c.branches.keys()].map(name => branchResponse(name)) });
        if (req.method === 'POST') {
            if (c.branches.has(body.branchName)) return send(409);
            const source = c.branches.get(body.source.name); if (!source) return send(404);
            return faults.respond('create-branch', () => {
                c.branches.set(body.branchName, new Map(source)); return [201, { branch: branchResponse(body.branchName, body.source.name) }];
            }, send);
        }
        if (req.method === 'DELETE') return faults.respond('delete-branch', () => { c.branches.delete(parts[5]); return [200, { message: 'OK' }]; }, send);
    }
    const branch = body.branch || body.ref?.name || new URL(req.url, 'https://localhost').searchParams.get('refName') || 'main';
    const docs = c.branches.get(branch); if (!docs) return send(404);
    const inline = docs => documentResponse(docs, name);
    if (parts[4] === 'docs' && req.method === 'GET') return send(200, inline([...docs.values()]));
    if (parts[4] === 'docs' && parts[5] === 'fetch') return send(200, inline(body.ids.map(id => docs.get(id)).filter(Boolean)));
    if (parts[4] === 'docs' && parts[5] === 'upsert') return faults.respond('upsert', () => { body.docs.forEach(d => docs.set(d.id, d)); return [202, { message: 'Accepted' }]; }, send);
    if (parts[4] === 'docs' && parts[5] === 'delete') return faults.respond('delete-docs', () => { body.ids.forEach(id => docs.delete(id)); return [202, { message: 'Accepted' }]; }, send);
    if (parts[4] === 'query') {
        if (failQuery) return send(503);
        if (delayedQuery) await new Promise(r => setTimeout(r, delayedQuery));
        const knn = body.query.bayesian?.[0]?.knn || body.query.knn;
        const filter = knn?.filter || body.query;
        if (body.query.bayesian) {
            assert.deepEqual(body.query.bayesian[1].bool[0], { ...filter, occur: 'filter' });
            assert.equal(knn.k, 200); assert.equal(body.size, 50); assert.equal(body.rerank.candidateSize, 200);
        }
        const match = /^owner:([a-f0-9]+) AND scope:([a-f0-9]+)(?: AND message:\[0 TO (\d+)\])?$/.exec(filter.queryString?.query || '');
        assert.ok(match, 'owner and scope query filters required');
        if (knn) assert.equal(typeof knn.queryText, 'string');
        const found = [...docs.values()].filter(d => d.owner === match[1] && d.scope === match[2] && (match[3] === undefined || d.message <= Number(match[3])));
        return faults.respond('query', () => [200, body.rerank ? rerankedResponse([...found, ...staleHits], name) : documentResponse([...found, ...staleHits], name)], send);
    }
    send(400);
});
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
const endpoint = `https://127.0.0.1:${remote.address().port}`;
const port = Number(process.env.ST_TEST_PORT || 18126); const url = `http://127.0.0.1:${port}`;
let server, browser, debugPage;
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
async function stop() { if (!server || server.exitCode !== null) return; server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
async function start(enabled) {
    const configPath = path.join(work, 'config.yaml');
    await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', String(enabled)], { cwd: source, env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; server.stdout.on('data', b => { log += b; }); server.stderr.on('data', b => { log += b; });
    for (let i = 0; i < 90; i++) {
        if (server.exitCode !== null) throw new Error(`SillyTavern exited: ${log.slice(-1500)}`);
        try { if ((await fetch(url)).ok) return; } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('SillyTavern did not start');
}
const errors = [], pageErrorDetails = [], hostFailures = [];
try {
    await start(false);
    const disabled = await fetch(`${url}/proxy/${encodeURIComponent(`${endpoint}/projects/synthetic/collections`)}`);
    check('real server rejects proxy when disabled', disabled.status === 404 && (await disabled.text()).includes('CORS proxy is disabled'));
    // The default profile selects the remote Horde service. This interceptor
    // test generates no model responses; do not make its success depend on
    // Horde availability during startup/reloads. Use an unconnected OpenAI UI.
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.main_api = 'openai';
    await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch();
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ignoreHTTPSErrors: true });
    const page = await browserContext.newPage();
    await browserContext.addCookies([{ url: endpoint, name: 'synthetic-remote-cookie', value: 'must-not-send', secure: true, sameSite: 'None' }]);
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/proxy/')) proxyRequests++; });
    debugPage = page; page.setDefaultTimeout(15000);
    page.on('pageerror', e => { errors.push(e.message); pageErrorDetails.push(e.stack); });
    page.on('response', response => {
        const pathname = new URL(response.url()).pathname;
        if (response.status() >= 500 && pathname.startsWith('/api/')) hostFailures.push({ path: pathname, status: response.status() });
    });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor();
    await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 30000 });
    check('extension loads through the real manifest loader', await page.locator('#sillymemory').count() === 1);
    const chatStatus = page.locator('#sillymemory-chat');
    const chatField = name => chatStatus.locator(`[data-sm-chat="${name}"]`);
    check('one chat status is mounted above the native composer', await chatStatus.count() === 1 && await chatStatus.evaluate(el => el.nextElementSibling?.id === 'send_form'));
    check('memory details start collapsed with no previous prompt preview', await chatStatus.getAttribute('open') === null && await chatField('memory').getAttribute('hidden') !== null);
    const savedSettings = JSON.parse(await readFile(path.join(work, 'data/default-user/settings.json'), 'utf8'));
    check('owner identity is durable before first remote request', /^[a-f0-9]{32}$/.test(savedSettings.extension_settings?.sillymemory?.owner));
    // Open settings through the chat-facing controls without navigating drawers.
    await chatStatus.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
    check('chat recovery details open with the keyboard', await chatField('settings').isVisible());
    await chatField('settings').click();
    await page.locator('#sillymemory [data-sm="connect"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !jQuery('#sillymemory .inline-drawer-content').is(':animated'));
    check('chat settings action opens the native drawer and SillyMemory controls', await page.locator('#sillymemory [data-sm="connect"]').isVisible());
    const field = name => name === 'enabled' ? memoryControl(page)
        : name === 'sync' ? chatMemorySync(page) : name === 'delete-chat' ? chatMemoryAction(page, 'delete')
        : page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = () => field('status').innerText();
    const waitStatus = async text => { await page.waitForFunction(text => document.querySelector('#sillymemory [data-sm="status"]')?.textContent.includes(text), text, { timeout: 30000 }); };
    check('fresh setup shows connection before preparation or activation', await field('connect').isVisible() && !await field('provision').isVisible() && !await field('enabled').isVisible() && !await field('budget').isVisible());
    check('chat activation is not exposed before connection and preparation', await chatField('toggle').getAttribute('hidden') !== null);
    const advancedSummary = field('advanced').locator(':scope > summary');
    await advancedSummary.focus(); await page.keyboard.press('Enter');
    check('Advanced opens with the keyboard', await field('budget').isVisible());
    await page.keyboard.press('Enter');
    check('closing Advanced leaves status feedback visible', !await field('budget').isVisible() && await field('status').isVisible());
    await page.locator('#sillymemory').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(artifacts, 'settings-basic.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#sillymemory').evaluate(el => el.scrollIntoView({ block: 'start' }));
    check('settings fit a narrow viewport without horizontal overflow', await page.locator('#sillymemory').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    check('chat status and actions fit a narrow viewport', await chatStatus.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: path.join(artifacts, 'settings-narrow.png') });
    await page.setViewportSize({ width: 1440, height: 1100 });
    check('fresh settings use the adopted 4096-token initial budget', await field('budget').inputValue() === '4096');
    await field('endpoint').fill(endpoint); await field('project').fill('synthetic');
    corsEnabled = false;
    await field('key').fill('synthetic-session-key'); await field('connect').click();
    await waitStatus('CORS access');
    check('missing CORS permission fails visibly and cannot confirm cleanup', collections.size === 0 && !(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:')))));
    corsEnabled = true;
    await field('key').fill('wrong-synthetic-key'); await field('connect').click();
    await waitStatus('Authentication failed');
    check('auth failure is visible with reconnect guidance', (await status()).includes('Authentication failed') && (await status()).includes('Connection settings'));
    await field('key').fill('synthetic-session-key'); await field('connect').click(); await waitStatus('Connected.');
    await waitStatus('Chat memory is ready');
    check('one explicit connection prepares and cleans up temporary data without activating a chat', !await field('endpoint').isVisible() && !await field('provision').isVisible() && !await field('enabled').isChecked() && collections.size === 0 && calls.some(c => c.path.endsWith('/docs/upsert')));
    check('setup discloses temporary inference usage and separate chat activation before connecting', (await field('connection').textContent()).includes('LambdaDB usage') && (await field('connection').textContent()).includes('Turn memory on separately'));
    await openMemoryConnection(page);
    check('a connected project shows Disconnect instead of the connect controls', !await field('app-connect').isVisible() && !await field('key').isVisible()
        && await field('disconnect').isVisible() && (await field('connected-summary').textContent()).startsWith('Connected to synthetic ('));
    // The manual form returns while a saved key cannot be confirmed; a failed explicit connect must keep that key.
    faults.arm('connection', 'http', 503);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await waitStatus('HTTP 503');
    await expandMemorySettings(page);
    const storedBeforeFailure = await page.evaluate(() => {
        const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner;
        return [localStorage.getItem(`sillymemory:state:${owner}`), localStorage.getItem(`sillymemory:credential:${owner}`)];
    });
    await page.evaluate(() => {
        const key = `sillymemory:credential:${SillyTavern.getContext().extensionSettings.sillymemory.owner}`;
        const original = Storage.prototype.setItem;
        globalThis.restoreCredentialStorage = () => { Storage.prototype.setItem = original; delete globalThis.restoreCredentialStorage; };
        Storage.prototype.setItem = function (id, value) { if (id === key) throw new DOMException('Synthetic quota', 'QuotaExceededError'); return original.call(this, id, value); };
    });
    try {
        await field('key').fill('synthetic-session-key'); await field('connect').click(); await waitStatus('Previous saved connection preserved');
        check('a failed credential write rolls settings back and preserves the prior key', await page.evaluate(before => {
            const owner = SillyTavern.getContext().extensionSettings.sillymemory.owner;
            return localStorage.getItem(`sillymemory:state:${owner}`) === before[0] && localStorage.getItem(`sillymemory:credential:${owner}`) === before[1];
        }, storedBeforeFailure));
    } finally { await page.evaluate(() => globalThis.restoreCredentialStorage()); }
    await field('project').fill('other-project'); await field('key').fill('wrong-synthetic-key'); await field('connect').click(); await waitStatus('Authentication failed');
    check('a rejected explicit key for another project preserves the prior validated credential', await page.evaluate(() => {
        const name = Object.keys(localStorage).find(k => k.startsWith('sillymemory:credential:'));
        const record = JSON.parse(localStorage.getItem(name)); return record.project === 'synthetic' && record.key === 'synthetic-session-key';
    }) && collections.size === 0);
    await field('project').fill('synthetic'); await field('connect').click(); await waitStatus('Connected.');
    await expandMemorySettings(page);
    await answerMemoryPopup(page, () => field('delete').click()); await waitStatus('memory was deleted');
    await field('advanced').locator(':scope > summary').click();
    await field('connection').locator(':scope > summary').click();
    if (!faultMode) {
        faults.arm('delete-collection', 'http', 400);
        await field('provision').click(); await waitStatus('Invalid request');
        check('failed setup cleanup cannot mark memory ready or enable it', collections.size === 1 && !await field('enabled').isChecked() && await page.evaluate(() => !JSON.parse(localStorage.getItem(`sillymemory:state:${SillyTavern.getContext().extensionSettings.sillymemory.owner}`)).ready));
        check('pending cleanup is actionable without opening Advanced', await field('recover-cleanup').isVisible() && !await field('cleanup').isVisible() && !await field('provision').isVisible() && collections.size === 1);
        check('chat activation cannot bypass pending test cleanup', await chatField('toggle').getAttribute('hidden') !== null);
        await field('recover-cleanup').click(); await waitStatus('Test data deleted');
        check('cleanup restores preparation and removes the recovery action', await field('provision').isVisible() && !await field('recover-cleanup').isVisible());
    }
    const gateUploads = calls.filter(c => c.path.endsWith('/docs/upsert')).length;
    if (faultMode) faults.arm('upsert', 'http', 503);
    await field('provision').click(); await waitStatus('Chat memory is ready');
    if (faultMode) check('transport gate retries transient upsert readiness through direct CORS', calls.filter(c => c.path.endsWith('/docs/upsert')).length - gateUploads === 2);
    check('basic preparation runs the required transport test and cleans up without opening Advanced', collections.size === 0 && calls.filter(c => c.path.endsWith('/docs/upsert')).length > gateUploads && !await field('budget').isVisible() && !await field('enabled').isChecked());
    check('direct requests carry the key and origin but omit cookies and host CSRF', calls.some(c => c.keyPresent) && calls.every(c => !c.cookiePresent && !c.csrfPresent && c.origin === url) && preflights > 0 && proxyRequests === 0);
    check('prepared settings direct activation to each saved chat without a global switch', !await field('provision').isVisible() && await page.locator('#sillymemory [data-sm=enabled]').count() === 0 && !await field('endpoint').isVisible() && (await field('mode-help').innerText()).includes('usual chat history'));
    check('unsupported chats cannot enable memory after setup', await chatField('toggle').getAttribute('hidden') !== null);
    check('preparation creates no collection before a chat is enabled', collections.size === 0);
    await page.locator('#sillymemory .inline-drawer-toggle').scrollIntoViewIfNeeded();
    if (!faultMode) await page.screenshot({ path: path.join(artifacts, 'setup.png') });
    await expandMemorySettings(page);
    const analyzerBox = name => page.locator(`#sillymemory [data-sm="analyzers"] input[value="${name}"]`);
    check('text search languages render as a checkbox group with english checked', await page.locator('#sillymemory [data-sm="analyzers"] input[type="checkbox"]').count() === 49 && await analyzerBox('english').isChecked() && !await analyzerBox('korean').isChecked() && await field('analyzers-summary').textContent() === 'Selected: english');
    await analyzerBox('english').click();
    check('the last text search language stays checked with an inline message', await analyzerBox('english').isChecked() && await field('analyzers-summary').textContent() === 'Choose at least one language. Selected: english');
    await analyzerBox('korean').click();
    check('checking a second text search language updates the summary', await analyzerBox('korean').isChecked() && await field('analyzers-summary').textContent() === 'Selected: english, korean');
    await page.locator('#sillymemory').screenshot({ path: path.join(artifacts, 'settings-expanded.png') });
    await field('budget').fill('250'); await field('budget').dispatchEvent('change');
    // Create a synthetic character through SillyTavern's own API, then load it.
    await page.evaluate(async () => {
        const ctx = SillyTavern.getContext();
        const data = new FormData(); data.set('ch_name', 'SillyMemory Synthetic'); data.set('description', 'Synthetic test character'); data.set('first_mes', 'The blue compass is beneath the cedar tree.');
        const response = await fetch('/api/characters/create', { method: 'POST', headers: ctx.getRequestHeaders({ omitContentType: true }), body: data });
        if (!response.ok) throw new Error('Could not create synthetic character');
    });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await waitStatus('Connected. Memory stays off');
    check('reload reconnects without refilling the visible key input and preserves disabled memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    check('text search languages persist across reload', await analyzerBox('korean').isChecked() && await field('analyzers-summary').textContent() === 'Selected: english, korean');
    // Restore the default before any story memory is created below.
    await page.evaluate(() => document.querySelector('#sillymemory [data-sm="analyzers"] input[value="korean"]').click());
    check('unchecking a text search language restores the default summary', await field('analyzers-summary').textContent() === 'Selected: english');
    await page.locator('#rightNavHolder .drawer-toggle').click();
    await page.locator('.character_select').filter({ hasText: 'SillyMemory Synthetic' }).click();
    await page.waitForFunction(() => SillyTavern.getContext().characterId !== undefined);
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...Array.from({ length: 8 }, (_, i) => ({ mes: `Synthetic passage ${i}: the blue compass is beneath the cedar tree.`, name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: Date.now(), extra: {} })));
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, 7);
    });
    await field('enabled').check(); await waitStatus('synchronized');
    const uploadsBeforeReload = calls.filter(c => c.path.endsWith('/docs/upsert')).length;
    const verification = faults.arm('connection', 'hold');
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await verification.entered;
    check('memory stays disabled while restored authentication is still unconfirmed', !await field('enabled').isChecked()); verification.release();
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.name === 'SillyMemory Synthetic')); });
    await page.waitForFunction(() => document.querySelector('#sillymemory-chat [data-sm-chat=toggle]').getAttribute('aria-pressed') === 'true');
    await waitStatus('synchronized');
    check('enabled memory is restored only after verified automatic connection without duplicate upserts', await field('enabled').isChecked() && await field('key').inputValue() === '' && calls.filter(c => c.path.endsWith('/docs/upsert')).length === uploadsBeforeReload);
    const callsBeforeSecondTab = calls.length;
    const secondTab = await browserContext.newPage(); await secondTab.goto(url);
    await secondTab.waitForFunction(() => document.querySelector('#sillymemory [data-sm=status]')?.textContent.includes('already open'));
    check('a conflicting tab does not restore credentials or send memory requests', calls.length === callsBeforeSecondTab && await secondTab.locator('#sillymemory [data-sm=connect]').isDisabled()); await secondTab.close();
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    faults.arm('connection', 'http', 503);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await waitStatus('HTTP 503');
    check('transient reconnect failure retains the saved key but cannot enable memory', !await field('enabled').isChecked() && await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:'))));
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await field('project').fill('unsaved-other-project');
    await openChatMemory(page);
    check('a saved scoped key exposes reconnect directly in the chat panel', await chatField('reconnect').isVisible());
    await page.screenshot({ path: path.join(artifacts, 'chat-reconnect.png') });
    const beforeReconnect = calls.length, reconnectHold = faults.arm('connection', 'hold');
    await chatField('reconnect').click(); await reconnectHold.entered;
    try {
        await chatField('reconnect').evaluate(button => button.onclick(new MouseEvent('click')));
        check('reconnect disables and revalidates duplicate clicks while checking the saved connection', await chatField('reconnect').isDisabled() && calls.length === beforeReconnect + 1);
    } finally { reconnectHold.release(); }
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm=connect]').disabled);
    check('chat reconnect ignores unsaved form edits and does not create temporary test data', await field('project').inputValue() === 'unsaved-other-project' && calls.slice(beforeReconnect).every(call => call.path.includes('/projects/synthetic/') && call.method === 'GET') && await chatField('reconnect').getAttribute('hidden') !== null);
    await chatField('settings').click();
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.name === 'SillyMemory Synthetic')); });
    await page.waitForFunction(() => document.querySelector('#sillymemory-chat [data-sm-chat=toggle]').getAttribute('aria-pressed') === 'true');
    check('successful reconnect collapses the connection editor again', await field('connection').getAttribute('open') === null);
    check('retry uses the saved key and restores the prior enabled preference without password re-entry', await field('key').inputValue() === '' && await field('enabled').isChecked());
    await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k.startsWith('sillymemory:credential:'));
        localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), key: 'wrong-synthetic-key' }));
    });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await waitStatus('Authentication failed');
    check('failed authentication reopens the connection editor', await field('connection').getAttribute('open') !== null);
    check('rejected restored key removes chat reconnect and keeps memory disabled', await chatField('reconnect').getAttribute('hidden') !== null && !await field('enabled').isChecked() && await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:'))));
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await field('key').fill('synthetic-session-key'); await field('connect').click(); await waitStatus('Connected. Memory stays off');
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.name === 'SillyMemory Synthetic')); });
    await waitStatus('synchronized'); await field('enabled').uncheck();
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.name === 'SillyMemory Synthetic')); });
    await openChatMemory(page);
    await page.evaluate(() => {
        const label = document.querySelector('#sillymemory-chat [data-sm-chat="label"]'), status = document.querySelector('#sillymemory [data-sm="status"]');
        globalThis.__smActivationLabels = [];
        new MutationObserver(() => globalThis.__smActivationLabels.push([label.textContent, status.textContent])).observe(label, { childList: true, characterData: true, subtree: true });
    });
    await chatField('toggle').click(); await waitStatus('synchronized');
    const activationLabels = await page.evaluate(() => globalThis.__smActivationLabels);
    check('activation reports Updating and never Ready before synchronization completes', activationLabels.some(([label]) => label.includes('Updating')) && activationLabels.every(([label, status]) => !label.includes('Ready') || status.includes('synchronized')));
    check('chat activation persists the same enabled preference without reopening settings', await field('enabled').isChecked() && (await chatField('toggle').textContent()) === 'Turn memory off in this chat' && (await chatField('delivery').textContent()) === '' && await chatField('delivery').isHidden() && await page.evaluate(() => SillyTavern.getContext().chatMetadata.sillymemoryEnabled === true && !document.querySelector('#extensions-settings-button .drawer-content').classList.contains('openDrawer')));
    await chatField('settings').click(); await field('next-step').waitFor({ state: 'visible' });
    if (!faultMode) {
        // Fail a read-only ownership check so this UI case does not leave an
        // uncertain-write journal that changes the existing no-write controls.
        await page.route('**/projects/synthetic/collections/*', route => route.fulfill({ status: 400, json: { message: 'Synthetic ownership check failure' } }), { times: 1 });
        await field('sync').click(); await waitStatus('Invalid request');
        check('failed synchronization exposes an explicit retry in the chat Memory panel', await chatField('sync').isVisible());
        check('chat status exposes synchronization failure outside the settings panel', (await chatField('label').innerText()).includes('Needs attention'));
        await openChatMemory(page);
        await chatField('sync').click(); await waitStatus('synchronized');
        check('successful retry removes its action', !await chatField('sync').isVisible());
        await chatField('settings').click(); await field('next-step').waitFor({ state: 'visible' });
    }
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.extensionSettings.vectors.enabled_chats = true;
        await c.eventSource.emit(c.eventTypes.SETTINGS_UPDATED);
    });
    check('enabled memory distinguishes a Vector Storage conflict', (await chatField('label').innerText()).includes('Vector Storage conflict') && await field('enabled').isChecked());
    await openChatMemory(page);
    await chatField('vectors').click();
    await page.locator('#vectors_enabled_chats').waitFor({ state: 'visible' });
    check('conflict recovery opens the native Vector Storage controls without changing them', await page.locator('#vectors_enabled_chats').isVisible() && await page.evaluate(() => SillyTavern.getContext().extensionSettings.vectors.enabled_chats));
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.extensionSettings.vectors.enabled_chats = false;
        await c.eventSource.emit(c.eventTypes.SETTINGS_UPDATED);
    });
    await openChatMemory(page);
    await chatField('settings').click(); await field('next-step').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.extensionSettings.vectors.enabled_chats = true;
        await c.eventSource.emit(c.eventTypes.SETTINGS_UPDATED);
    });
    const unsupportedSource = await page.evaluate(async () => {
        const c = SillyTavern.getContext(), original = structuredClone(c.chat);
        c.chat.push({ is_system: true, mes: 'Synthetic tool result.', extra: { tool_invocations: [{ name: 'synthetic-tool' }] } });
        await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, c.chat.length - 1); return original;
    });
    check('enabled memory does not claim readiness in an unsupported tool conversation', (await chatField('label').innerText()).includes('Unavailable in this chat') && !await chatField('vectors').isVisible());
    await page.evaluate(async original => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...original);
        c.extensionSettings.vectors.enabled_chats = false;
        await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
    }, unsupportedSource);
    await waitStatus('synchronized');
    check('a supported synchronized chat reports readiness without claiming prompt delivery', (await chatField('label').innerText()).includes('Ready') && await chatField('delivery').isHidden());
    await openChatMemory(page);
    await chatStatus.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'chat-memory-ready.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, 'chat-memory-narrow.png') });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await chatField('settings').click(); await field('next-step').waitFor({ state: 'visible' });
    // Native prompt-manager previews may expand the first source message after
    // character selection. Arm the literal-macro fixture after those UI checks;
    // this regression verifies the interceptor, not native preview behavior.
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chat[0].mes += ' {{setvar::sillymemory_test::oops}} {{char}} <USER>';
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
    });
    await waitStatus('synchronized');
    const prompt = () => page.evaluate(async () => {
        const c = SillyTavern.getContext(); const before = JSON.stringify(c.chat);
        const chat = c.chat.map((m, index) => ({ ...m, index })); let aborted = false;
        // Exercise the actual host interceptor dispatcher, including manifest order.
        const { runGenerationInterceptors } = await import('/scripts/extensions.js');
        aborted = await runGenerationInterceptors(chat, 4096, 'normal');
        const rendered = chat.filter(m => m.mes.startsWith('[Recalled conversation excerpts]')).map(m => m.mes).join('\n');
        const result = { before, after: JSON.stringify(c.chat), chat, aborted, rendered, guidance: c.extensionPrompts.sillymemory?.value || '', preparation: document.querySelector('[data-sm="status"]').textContent, renderedTokens: await c.getTokenCountAsync(rendered), macroValue: c.chatMetadata.variables?.sillymemory_test, injection: rendered, inspection: document.querySelector('[data-sm-chat="inspection"]').textContent };
        // This suite calls only the interceptor dispatcher. Emulate its completion
        // boundary to release prompt ownership; full packing/dispatch is tested
        // by prompt-delivery-smoke.mjs, not by this synthetic final event.
        if (!aborted) await c.eventSource.emit(c.eventTypes.GENERATE_AFTER_DATA, { prompt: [{ role: 'system', content: c.extensionPrompts.sillymemory.value }, ...chat.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes }))] }, false);
        return result;
    });
    const result = await prompt();
    const latestSearch = calls.findLast(call => call.body?.query?.bayesian)?.body;
    check('one current-message request shares the active input with both search legs and reranking',
        latestSearch?.query.bayesian[0].knn.queryText === 'User: Synthetic passage 6: the blue compass is beneath the cedar tree.'
        && latestSearch.rerank.queryText === latestSearch.query.bayesian[0].knn.queryText);
    const archive = [...collections.values()][0].branches.get(await page.evaluate(() => `chat_${SillyTavern.getContext().chatMetadata.sillymemory.id}`));
    check('ordinary native synchronization archives one complete pair outside the retained recent exchanges',
        JSON.stringify([...archive.values()].map(doc => doc.message).sort((a, b) => a - b)) === '[0,1]');
    check('a tight allocation succeeds without partially injecting a dated source', !result.aborted && !result.injection && /Found 0 related passages/.test(result.preparation) && /\d+ \/ 250 tokens/.test(result.inspection));
    check('empty selection explains that no older memory was selected', (await chatField('memory-summary').textContent()).includes('No older memory selected') && await chatField('memory-list').locator('li').count() === 0 && await chatField('inspect').getAttribute('hidden') !== null);
    check('small memory stays inside its budget with sent guidance', result.renderedTokens <= 250);
    // The longer macro-bearing source can be skipped at 250 once the shared
    // time explanation is counted. Test literal delivery when that whole source
    // fits, independently of the small-budget admission assertion above.
    await field('budget').fill('400'); await field('budget').dispatchEvent('change');
    const macroResult = await prompt();
    check('native recalled excerpts keep macros literal within budget', macroResult.rendered.includes('｛｛char｝｝') && macroResult.rendered.includes('＜USER＞') && macroResult.macroValue === undefined && macroResult.renderedTokens <= 400);
    check('memory preview shows selected source text and coordinates as plain text', (await chatField('memory-list').textContent()).includes('Synthetic passage 0') && (await chatField('memory-list').textContent()).includes('User · User · message 1, passage 1') && (await chatField('memory-list').textContent()).includes('<USER>') && await chatField('memory-list').locator('user').count() === 0);
    check('memory preview excludes candidates omitted from the prompt', await chatField('memory-list').locator('li').count() === Number(/Found (\d+) related passages/.exec(macroResult.preparation)[1]));
    await field('budget').fill('400'); await field('budget').dispatchEvent('change');
    check('a completed reply retains six messages without splitting a pair and leaves persisted source unchanged', JSON.stringify(result.chat.filter(m => !m.mes.startsWith('[Recalled conversation excerpts]')).map(m => m.index)) === '[2,3,4,5,6,7]' && result.chat.at(-1).mes.includes('passage 7') && result.before === result.after);
    // Archived text follows the host's prompt-only regex scripts, as native history does.
    const archiveText = async () => [...[...collections.values()][0].branches.get(await page.evaluate(() => `chat_${SillyTavern.getContext().chatMetadata.sillymemory.id}`)).values()]
        .filter(doc => doc.message === 1).map(doc => doc.text).join('');
    const sourceReply = await page.evaluate(() => SillyTavern.getContext().chat[1].mes);
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.extensionSettings.regex = [...(c.extensionSettings.regex || []), { id: 'sillymemory-smoke', scriptName: 'Hide tracker blocks', findRegex: '/\\n?<Blocks>[\\s\\S]*?<\\/Blocks>/g', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: false, promptOnly: true, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null }];
        c.chat[1].mes += '\n<Blocks>Synthetic tracker state</Blocks>';
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 1);
    });
    await waitStatus('synchronized');
    const regexedArchive = await archiveText();
    check('archived text applies prompt-only regex scripts like native history', regexedArchive.includes(sourceReply.slice(0, 40)) && !regexedArchive.includes('Synthetic tracker state'));
    await page.evaluate(async source => {
        const c = SillyTavern.getContext();
        c.extensionSettings.regex = c.extensionSettings.regex.filter(script => script.id !== 'sillymemory-smoke');
        c.chat[1].mes = source;
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 1);
    }, sourceReply);
    await waitStatus('synchronized');
    // Ineligible active inputs still preserve recent dialogue. The actual native
    // hook is exercised with attachment/media/tool metadata, without uploading files.
    const originalSource = await page.evaluate(() => structuredClone(SillyTavern.getContext().chat));
    const writesBeforeRecentEdit = calls.filter(call => call.path.endsWith('/docs/upsert')).length;
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.chat[7].mes = 'Edited recent reply.';
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 7);
    });
    await waitStatus('synchronized');
    check('editing retained source makes no embedding write before it leaves the window',
        calls.filter(call => call.path.endsWith('/docs/upsert')).length === writesBeforeRecentEdit);
    for (const index of [8, 9]) {
        await page.evaluate(async index => {
            const c = SillyTavern.getContext(); c.chat.push({ mes: `New message ${index}`, name: index % 2 ? 'Mira' : 'User', is_user: index % 2 === 0, extra: {} });
            await c.saveChat(); await c.eventSource.emit(index % 2 ? c.eventTypes.MESSAGE_RECEIVED : c.eventTypes.MESSAGE_SENT, index);
        }, index);
        await waitStatus('synchronized');
    }
    check('a native user input writes one displaced pair and its reply causes no second upsert',
        JSON.stringify(calls.filter(call => call.path.endsWith('/docs/upsert')).slice(writesBeforeRecentEdit).map(call => call.body.docs.map(doc => doc.message))) === '[[2,3]]');
    for (const extra of [{ file: { name: 'fixture.txt' } }, { media: [{ url: 'fixture-image' }] }, { tool_invocations: [{ name: 'fixture-tool' }] }]) {
        await page.evaluate(async ({ originalSource, extra }) => {
            const c = SillyTavern.getContext();
            c.chat.splice(0, c.chat.length, ...originalSource.slice(0, 8), { mes: 'Special active input.', name: 'User', is_user: true, extra });
            await c.saveChat();
        }, { originalSource, extra });
        const special = await prompt();
        check('an ineligible active input preserves recent source without splitting an eligible pair', !special.aborted
            && JSON.stringify(special.chat.filter(m => !m.mes.startsWith('[Recalled conversation excerpts]')).map(m => m.index)) === '[2,3,4,5,6,7,8]'
            && special.before === special.after);
    }
    await page.evaluate(async originalSource => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...originalSource); await c.saveChat();
    }, originalSource);
    // Exercise assembly through the real extension dispatcher with multiple stored chunks.
    await field('budget').fill('1600'); await field('budget').dispatchEvent('change');
    const assemblySource = await page.evaluate(async () => {
        const c = SillyTavern.getContext(), original = c.chat[0].mes;
        const text = Array.from({ length: 45 }, (_, i) => `Archive shelf ${i}: the cedar maps are here.`).join('\n');
        c.chat[0].mes = text; await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
        return { original, text };
    });
    const assembled = await prompt();
    const passageCount = /Found (\d+) related passages/.exec(assembled.preparation);
    const memoryMessages = assembled.chat.filter(m => m.mes.startsWith('[Recalled conversation excerpts]')).length;
    const preparedCounts = passageCount && [passageCount[0], passageCount[1], String(memoryMessages)];
    const assembledMessage = assembled.chat.find(m => m.mes.startsWith('[Recalled conversation excerpts]') && m.mes.includes('message 1, passages 1-'));
    check('real host dispatcher assembles same-message chunks with their source and one shared header',
        !assembled.aborted && preparedCounts && Number(preparedCounts[1]) > Number(preparedCounts[2]) && assembledMessage?.mes.includes('passages 1-') && assembledMessage.mes.includes(assemblySource.text)
        && assembled.renderedTokens <= 1024 && assembled.before === assembled.after);
    check('long selections show only three short source previews without reducing prepared memory', Number(preparedCounts[1]) > 3 && await chatField('memory-list').locator('li').count() === 3 && (await chatField('memory-list').locator('p').allTextContents()).every(text => Array.from(text).length <= 181) && (await chatField('inspect').textContent()).includes(`${Number(preparedCounts[1]) - 3} more passage`));
    await page.evaluate(async original => {
        const c = SillyTavern.getContext(); c.chat[0].mes = original; await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
    }, assemblySource.original);
    // Keep a complete dated source available for the cancellation/race assertions.
    await field('budget').fill('400'); await field('budget').dispatchEvent('change');
    await waitStatus('synchronized');
    delayedQuery = 400;
    const olderGeneration = prompt();
    await page.waitForTimeout(100);
    const newerGeneration = prompt();
    const [older, newer] = await Promise.all([olderGeneration, newerGeneration]); delayedQuery = 0;
    check('overlapping generations cannot overwrite the newest injection', older.aborted && !newer.aborted && Boolean(newer.injection));
    const parentBranch = await page.evaluate(() => `chat_${SillyTavern.getContext().chatMetadata.sillymemory.id}`);
    const collection = { docs: [...collections.values()][0].branches.get(parentBranch) }; const old = [...collection.docs.values()].find(doc => doc.message === 0);
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'Edited: the compass is in the tower.'; await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); });
    await waitStatus('synchronized'); staleHits = [old];
    const edited = await prompt();
    check('edits delete stale records and reject delayed old hits', !collection.docs.has(old.id) && !edited.injection.includes('Synthetic passage 0'));
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[1].mes = 'Selected swipe: silver compass'; c.chat[1].swipe_id = 1; await c.eventSource.emit(c.eventTypes.MESSAGE_SWIPED, 1); });
    await waitStatus('synchronized');
    check('swipe event updates remote source', [...collection.docs.values()].some(d => d.text.includes('Selected swipe')));
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat.splice(0, 1); await c.eventSource.emit(c.eventTypes.MESSAGE_DELETED, 0); });
    await waitStatus('synchronized');
    check('message deletion reconciles remote documents without splitting the surviving first pair', collection.docs.size === 1);
    delayedQuery = 700;
    const pending = prompt();
    await page.waitForTimeout(150);
    await page.evaluate(async () => { const c = SillyTavern.getContext(); const { createBranch } = await import('/scripts/bookmarks.js'); const name = await createBranch(c.chat.length - 1); if (!name) throw new Error('Native branch creation failed'); await c.openCharacterChat(name); });
    const raced = await pending; delayedQuery = 0;
    check('chat switch rejects late result and aborts old generation', raced.aborted && !raced.injection);
    check('chat switches clear the previous selection even after a late retrieval', await chatField('memory').getAttribute('hidden') !== null && await chatField('memory-list').locator('li').count() === 0);
    await waitStatus('synchronized'); staleHits = [old];
    const branch = await prompt();
    check('native branch shares its story collection and rejects stale source', !branch.injection.includes('Edited:') && collections.size === 1 && [...collections.values()][0].branches.size === 3);
    if (!faultMode) {
        const beforeCopy = await page.evaluate(() => SillyTavern.getContext().chatMetadata.sillymemory.id);
        await field('enabled').uncheck();
        await page.evaluate(async () => { const c = SillyTavern.getContext(), { saveChat } = await import('/script.js'); await saveChat({ chatName: 'Synthetic copied' }); await c.openCharacterChat('Synthetic copied'); });
        await answerMemoryPopup(page, () => field('delete-chat').click()); await waitStatus('memory was deleted');
        check('deleting an unactivated copy cannot delete its parent', collections.size === 1);
        const uncertainCreate = faults.arm('create', 'hold'); await field('enabled').check();
        await uncertainCreate.entered; await waitStatus('timed out'); uncertainCreate.release();
        check('uncertain creation retains one pending owned collection', collections.size === 2);
        await field('sync').click(); await waitStatus('synchronized');
        check('create retry recovers the same collection', collections.size === 2);
        check('copied metadata receives a distinct collection', collections.size === 2 && await page.evaluate(() => SillyTavern.getContext().chatMetadata.sillymemory.id) !== beforeCopy);
        faults.arm('delete-branch', 'http', 503);
        await answerMemoryPopup(page, () => field('delete-chat').click()); await waitStatus('HTTP 503');
        check('failed individual deletion keeps remote collection for retry', collections.size === 2);
        await answerMemoryPopup(page, () => field('delete-chat').click()); await waitStatus('memory was deleted');
        check('individual deletion preserves the story collections and sibling branches', collections.size === 2 && [...collections.values()][1].branches.size === 1);
        await field('enabled').check(); await waitStatus('synchronized');
    }
    const originalAnchor = await page.evaluate(() => {
        const c = SillyTavern.getContext(), index = c.chat.findLastIndex(m => m.is_user && m.mes.trim());
        const original = c.chat[index].mes; c.chat[index].mes = 'x'.repeat(8193);
        return { index, original };
    });
    const searchesBeforeOverflow = calls.filter(c => c.body.query?.bayesian).length;
    const overflow = await prompt(); await waitStatus('8 KiB limit');
    check('oversized complete query aborts generation without pruning or sending a truncated search', overflow.aborted && !overflow.injection && overflow.before === overflow.after && searchesBeforeOverflow === calls.filter(c => c.body.query?.bayesian).length);
    await page.evaluate(({ index, original }) => { SillyTavern.getContext().chat[index].mes = original; }, originalAnchor);
    failQuery = true;
    const failed = await prompt(); failQuery = false;
    check('query failure stops generation and preserves unmodified source', failed.aborted && !failed.injection && failed.before === failed.after && failed.chat.length === 7);
    check('a failed search never leaves a previous memory preview', await chatField('memory').getAttribute('hidden') !== null && await chatField('memory-list').locator('li').count() === 0);
    await field('enabled').uncheck(); const off = await prompt();
    check('disable clears injection and preserves full prompt', !off.injection && off.chat.length === 7);
    check('disabled memory explains native chat behavior without deleting saved memory', (await field('mode-help').innerText()).includes('SillyTavern uses its usual chat history') && collections.size > 0);
    const secrets = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    check('key is saved only in its dedicated credential record, not general or native settings', await page.evaluate(() => {
        const entries = Object.entries(localStorage), credentials = entries.filter(([k]) => k.startsWith('sillymemory:credential:'));
        return credentials.length === 1 && JSON.parse(credentials[0][1]).key === 'synthetic-session-key'
            && !JSON.stringify(entries.filter(([k]) => !k.startsWith('sillymemory:credential:'))).includes('synthetic-session-key')
            && !JSON.stringify(SillyTavern.getContext().extensionSettings).includes('synthetic-session-key')
            && !JSON.stringify({ ...sessionStorage }).includes('synthetic-session-key');
    }) && !secrets.includes('wrong-synthetic-key'));
    // A message sent while memory is still being turned on waits for the
    // activation instead of stopping the reply.
    await openChatMemory(page); await chatField('toggle').click();
    const duringActivation = await prompt();
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm="connect"]').disabled);
    check('a reply requested during activation waits for it and uses memory', !duringActivation.aborted && Boolean(duringActivation.injection) && /Found \d+ related passages/.test(duringActivation.preparation));
    await expandMemorySettings(page);
    await field('advanced').scrollIntoViewIfNeeded();
    if (!faultMode) await page.screenshot({ path: path.join(artifacts, 'settings.png') });
    if (!faultMode) {
        // The host can swallow save errors. No remote access may precede
        // persistence of the complete default story identity.
        await field('enabled').uncheck();
        await page.evaluate(async () => {
            const c = SillyTavern.getContext(), { saveChat } = await import('/script.js');
            delete c.chatMetadata.sillymemory;
            await saveChat({ chatName: 'Fresh default identity' }); await c.openCharacterChat('Fresh default identity');
        });
        const before = calls.length;
        // A reply requested while activation itself fails is stopped explicitly,
        // with the activation error, rather than sent with native history.
        await page.route('**/api/chats/save', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
        await openChatMemory(page); await chatField('toggle').click();
        const duringFailedActivation = await prompt();
        await waitStatus('could not be saved');
        await page.unroute('**/api/chats/save');
        check('a reply requested during a failed activation is stopped with the activation error and leaves memory off', duringFailedActivation.aborted && !duringFailedActivation.injection && duringFailedActivation.preparation.includes('could not be saved') && !await field('enabled').isChecked() && calls.length === before);
        await page.route('**/api/chats/save', route => route.request().postDataJSON().chat?.[0]?.chat_metadata?.sillymemory
            ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.continue());
        await field('enabled').check(); await waitStatus('not saved');
        check('failed first identity save prevents remote access', calls.length === before);
        await page.unroute('**/api/chats/save');
        await field('sync').click(); await waitStatus('synchronized');
        const persisted = await page.evaluate(async () => {
            const c = SillyTavern.getContext();
            const response = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, file_name: c.getCurrentChatId() }) });
            const rows = await response.json(), memory = c.chatMetadata.sillymemory;
            return memory.version === 1 && memory.story === memory.id && JSON.stringify(rows[0].chat_metadata.sillymemory) === JSON.stringify(memory);
        });
        check('retry saves the full default story identity and synchronizes', persisted && await field('versioned').count() === 0);
    }
    if (!faultMode) await runPerChatMemoryScenarios({ page, field, waitStatus, check, calls, prompt,
        screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}.png`) }) });
    if (!faultMode) nativeChatResults = await runNativeChatScenarios({ page, field, waitStatus, check, faults, collections, calls, prompt,
        screenshot: name => page.screenshot({ path: path.join(artifacts, name) }) });
    if (!faultMode) await runSetupRecoveryScenarios({ page, field, waitStatus, check, calls, nativeChats: nativeChatResults,
        screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}.png`) }) });
    // Time provenance is synchronized metadata and budgeted with each excerpt.
    await field('enabled').uncheck();
    await field('budget').fill('2000'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        c.chat.forEach(message => { delete message.send_date; });
        c.chat[0].send_date = '2024-02-29T12:34:56.123Z';
        await c.saveChat();
    });
    await field('enabled').check(); await waitStatus('synchronized');
    const timed = await prompt();
    check('host timestamp reaches interceptor with explicit non-event attribution', timed.chat.some(m => m.mes.includes('sent: 2024-02-29T12:34:56.123Z')) && timed.guidance.includes('not necessarily event time') && !timed.chat.some(m => m.mes.includes('not necessarily event time')));
    const beforeTimestampEdit = calls.filter(call => call.path.endsWith('/upsert')).length;
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].send_date = '2024-03-01T00:00:00.000Z'; await c.saveChat(); });
    const changedTime = await prompt();
    check('timestamp-only edit replaces stale remote provenance', changedTime.chat.some(m => m.mes.includes('2024-03-01T00:00:00.000Z')) && !JSON.stringify(changedTime.chat).includes('2024-02-29T12:34:56.123Z') && calls.filter(call => call.path.endsWith('/upsert')).length > beforeTimestampEdit);
    const timestampSource = await page.evaluate(() => SillyTavern.getContext().chat.map(m => m.mes));
    check('time labels never enter source or embedding text', timestampSource.every(text => !text.includes(', sent:')) && [...collections.values()].every(c => [...c.branches.values()].every(branch => [...branch.values()].every(doc => !doc.text.includes(', sent:')))));
    check('current host timestamp is stored on indexed source chunks', [...collections.values()].some(c => [...c.branches.values()].some(branch => [...branch.values()].some(doc => doc.conversationTimestamp === '2024-03-01T00:00:00.000Z' && doc.timestampSource === 'host_message'))));
    // Restore the ordinary test budget before existing fault/cleanup scenarios.
    await field('budget').fill('400'); await field('budget').dispatchEvent('change');
    let nativeReplyResults;
    if (!faultMode) nativeReplyResults = await runNativeReplyScenarios({ page, field, waitStatus, check, calls,
        screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}.png`) }) });
    if (!faultMode) groupChatResults = await runGroupChatScenarios({ page, field, waitStatus, check, calls, collections,
        screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}.png`) }) });
    if (faultMode) { staleHits = []; faultResults = await runFaultScenarios({ page, field, waitStatus, prompt, check, faults, collections, calls, restartHost: recoveryMode ? async () => { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGKILL'); await exited; await start(false); } : undefined, screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}${artifactTag ? `-${artifactTag}` : ''}.png`) }) }); }
    else { await answerMemoryPopup(page, () => field('delete').click()); await waitStatus('memory was deleted'); }
    check('owned remote deletion leaves no collections', collections.size === 0);
    await field('budget').fill('512'); await field('budget').dispatchEvent('change');
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await waitStatus('Connected.');
    check('remote deletion leaves reconnection available but preserves disabled memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    check('explicit user budget survives reload without default replacement', await field('budget').inputValue() === '512');
    if (!faultMode) {
        // Keep a stale native ON flag: preparing again must not revive uploads.
        await page.evaluate(async () => { const ctx = SillyTavern.getContext(); ctx.chatMetadata.sillymemoryEnabled = true; await ctx.saveChat(); });
        const memoryWrites = () => calls.filter(call => call.path.endsWith('/upsert') && !call.path.includes('/smtest_')).length;
        const writesBeforePreparation = memoryWrites();
        await expandMemorySettings(page);
        await field('provision').click(); await waitStatus('Connected. Chat memory is ready.');
        check('preparation after bulk deletion cannot revive a stale native ON preference',
            !await field('enabled').isChecked() && collections.size === 0
            && memoryWrites() === writesBeforePreparation);
    }
    await page.evaluate(() => localStorage.removeItem(`sillymemory:state:${SillyTavern.getContext().extensionSettings.sillymemory.owner}`));
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm=connect]').disabled);
    check('a credential remains removable when its ordinary connection settings are lost', await field('endpoint').inputValue() === '' && await field('project').inputValue() === '' && await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:'))));
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await field('forget').click(); await waitStatus('Saved key removed');
    const beforeForgottenReload = calls.length;
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm=connect]').disabled);
    check('Forget key removes persistence and reload makes no credential request', calls.length === beforeForgottenReload && await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:'))) && !await field('enabled').isChecked());

    if (!faultMode) {
        const appCalls = []; let appOutcome = 'read-only', offered = false, discoveryGate;
        const connectionId = '44444444-4444-4444-8444-444444444444', projectId = '22222222-2222-4222-8222-222222222222';
        const issuer = 'https://auth.lambdadb.ai/';
        const cors = { 'Access-Control-Allow-Origin': url, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
        // Synthetic LambdaDB account API and issuer. Approval redirects straight to
        // the extension's callback page, which reports the code to the initiating tab.
        await page.context().route(/^https:\/\/(api|auth)\.lambdadb\.ai\//, async route => {
            const req = route.request(), target = new URL(req.url()), key = `${req.method()} ${target.host} ${target.pathname}`;
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            appCalls.push({ key, body: req.postData(), headers: req.headers() });
            const json = (value, status = 200) => route.fulfill({ status, headers: cors, json: value });
            if (key === 'GET api.lambdadb.ai /.well-known/oauth-protected-resource' && !offered) return json({ error: 'not_found' }, 404);
            if (key === 'GET api.lambdadb.ai /.well-known/oauth-protected-resource') await discoveryGate?.promise;
            if (key === 'GET api.lambdadb.ai /.well-known/oauth-protected-resource') return json({ resource: 'https://api.lambdadb.ai', authorization_servers: [issuer], lambdadb_console_url: 'https://app.lambdadb.ai' });
            if (key === 'GET auth.lambdadb.ai /.well-known/openid-configuration') return json({ issuer, authorization_endpoint: `${issuer}oauth2/auth`, token_endpoint: `${issuer}oauth2/token`, registration_endpoint: `${issuer}oauth2/register`, revocation_endpoint: `${issuer}oauth2/revoke` });
            if (key === 'POST auth.lambdadb.ai /oauth2/register') return json({ client_id: 'synthetic-installation' }, 201);
            if (key === 'POST api.lambdadb.ai /project-connections') return json({ connection_id: connectionId, expires_at: new Date(Date.now() + 900000).toISOString() }, 201);
            if (key === 'GET auth.lambdadb.ai /oauth2/auth') {
                const callback = new URL(target.searchParams.get('redirect_uri'));
                callback.searchParams.set('code', 'synthetic-code'); callback.searchParams.set('state', target.searchParams.get('state'));
                return route.fulfill({ status: 302, headers: { Location: callback.href } });
            }
            if (key === 'POST auth.lambdadb.ai /oauth2/token') return json({ access_token: 'synthetic-setup-token', token_type: 'bearer', expires_in: 900, scope: appOutcome === 'ready' ? 'connection:read connection:issue' : 'connection:read' });
            if (key === `GET api.lambdadb.ai /project-connections/${connectionId}`) return json({ connection_id: connectionId, status: 'ready', project_id: projectId });
            if (key === `POST api.lambdadb.ai /project-connections/${connectionId}/key`) return json({ connection_id: connectionId, endpoint, project_id: projectId, project_name: 'synthetic', key_id: 'synthetic-app-key', api_key: 'synthetic-session-key' }, 201);
            if (key === 'POST auth.lambdadb.ai /oauth2/revoke') return route.fulfill({ status: 200, headers: cors, body: '' });
            return json({ error: 'not_found' }, 404);
        });
        await expandMemorySettings(page);
        await field('app-connect').click(); await waitStatus('does not offer Connect yet');
        for (let i = 0; i < 50 && page.context().pages().length > 1; i++) await page.waitForTimeout(100);
        check('a server without Connect reports manual setup and closes the blank approval window',
            page.context().pages().length === 1 && !appCalls.some(c => c.key.endsWith('/oauth2/register')));
        offered = true;
        let release; discoveryGate = { promise: new Promise(resolve => { release = resolve; }) };
        const opened = page.context().waitForEvent('page');
        await field('app-connect').click();
        const approvalWindow = await opened;
        await approvalWindow.waitForFunction(() => document.body?.textContent.includes('Opening LambdaDB sign-in'), undefined, { timeout: 10000 }).catch(() => {});
        check('the approval window explains itself while Connect prepares authorization',
            await approvalWindow.title() === 'Connect to LambdaDB' && await approvalWindow.evaluate(() => document.body.textContent) === 'Opening LambdaDB sign-in…');
        discoveryGate = undefined; release();
        await waitStatus('did not allow a project key');
        const claims = () => appCalls.filter(c => c.key.endsWith('/key')).length;
        check('an approval without key issuance ends waiting without issuing a key or connecting', !await field('app-waiting').isVisible() && claims() === 0 && !await field('enabled').isChecked());
        check('app setup token is revoked after an approval without key issuance', appCalls.at(-1).key === 'POST auth.lambdadb.ai /oauth2/revoke');
        appOutcome = 'ready';
        const canceledVerification = faults.arm('connection', 'hold');
        await field('app-connect').click();
        await canceledVerification.entered;
        await field('app-cancel').click();
        canceledVerification.release();
        await waitStatus('Connection canceled.');
        check('canceling after redemption prevents a delayed connection check from saving or preparing the key',
            !await field('enabled').isChecked() && collections.size === 0
            && await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:'))));
        await field('app-connect').click(); await waitStatus('Connected. Chat memory is ready.');
        check('app approval automatically saves and prepares the exact project without activating chat memory', await field('project').inputValue() === 'synthetic' && await field('key').inputValue() === '' && !await field('enabled').isChecked() && collections.size === 0
            && claims() === 2);
        check('app installation is registered once and reused', appCalls.filter(c => c.key.endsWith('/oauth2/register')).length === 1);
        check('app authorization uses S256 PKCE and the exact extension callback',
            appCalls.filter(c => c.key.endsWith('/oauth2/token')).every(c => new URLSearchParams(c.body).get('redirect_uri') === `${url}/scripts/extensions/third-party/sillymemory/oauth-callback.html` && new URLSearchParams(c.body).get('code_verifier')?.length >= 43));
        check('app requests never forward the host cookies, CSRF or a project key, and only setup calls carry the setup token',
            appCalls.every(c => !c.headers.cookie && !c.headers['x-csrf-token'] && !c.headers['x-api-key']
                && (!c.headers.authorization || (c.headers.authorization === 'Bearer synthetic-setup-token' && c.key.includes('/project-connections/')))));
        await openMemoryConnection(page);
        check('after Connect the section offers Disconnect instead of Connect to LambdaDB', !await field('app-connect').isVisible() && await field('disconnect').isVisible());
        await field('disconnect').click(); await waitStatus('Saved key removed');
        check('Disconnect returns the section to the not-connected form', await field('app-connect').isVisible() && await field('key').isVisible() && !await field('disconnect').isVisible());
        for (const popup of page.context().pages()) if (popup !== page) await popup.close();
    }
    if (faultMode) check('fault run has no uncaught browser page errors', errors.length === 0);
    const sourceSha256 = {};
    for (const file of ['index.js', 'manifest.json', 'settings.html', 'style.css', 'src/chunking.js', 'src/client.js', 'src/credentials.js', 'src/activation.js', 'src/app-connect.js', 'oauth-callback.html', 'oauth-callback.js', 'src/commit.js', 'src/chat-collections.js', 'src/gate.js', 'src/memory.js', 'src/time.js', 'src/context.js', 'scripts/native-chat-scenarios.mjs', 'scripts/per-chat-memory-scenarios.mjs', 'scripts/setup-recovery-scenarios.mjs', 'scripts/native-reply-scenarios.mjs', 'scripts/group-chat-scenarios.mjs', 'src/delivery.js', 'src/token-usage.js', 'src/status.js', 'scripts/browser-smoke.mjs', 'scripts/settings-panel.mjs', 'scripts/emulator-cors.mjs', 'scripts/fault-scenarios.mjs', 'scripts/recovery-scenarios.mjs']) {
        sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    await writeFile(path.join(artifacts, artifactName), JSON.stringify({ passed: true, faultResults, nativeChatResults, nativeReplyResults, groupChatResults, sourceSha256, time: new Date().toISOString(), sillyTavern: revision, node: process.version, browser: browser.version(), upstream: 'Local HTTPS LambdaDB emulator; no live managed embeddings', checks, pageErrors: errors, requestCount: calls.length, preflights, proxyRequests, remainingCollections: collections.size }, null, 2));
} catch (error) {
    await writeFile(path.join(artifacts, artifactName), JSON.stringify({ passed: false, checks, faultResults, nativeChatResults, groupChatResults, faultObservations: faults.observations, failure: error.message, pageErrors: errors, pageErrorDetails, hostFailures, remainingCollections: collections.size }, null, 2));
    console.error('Browser failure status:', await debugPage?.locator('[data-sm="status"]').innerText().catch(() => 'unavailable'));
    console.error('Upstream request count:', calls.length);
    await debugPage?.screenshot({ path: path.join(artifacts, faultMode ? 'fault-failure.png' : 'failure.png') }).catch(() => {});
    throw error;
} finally { faults.releaseAll(); await browser?.close(); await stop(); await new Promise(r => remote.close(r)); await rm(work, { recursive: true, force: true }); }
