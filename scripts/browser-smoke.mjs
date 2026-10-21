import { expandMemorySettings, openMemoryConnection, openChatMemory } from './settings-panel.mjs';
import { runNativeReplyScenarios } from './native-reply-scenarios.mjs';
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
let faultResults;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-smoke-'));
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
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
            c.branches.set(body.branchName, new Map(source)); return send(201, { branch: branchResponse(body.branchName, body.source.name) });
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
    const savedSettings = JSON.parse(await readFile(path.join(work, 'data/default-user/settings.json'), 'utf8'));
    check('owner identity is durable before first remote request', /^[a-f0-9]{32}$/.test(savedSettings.extension_settings?.sillymemory?.owner));
    // Open settings through the chat-facing controls without navigating drawers.
    await chatStatus.locator('summary').focus(); await page.keyboard.press('Enter');
    check('chat recovery details open with the keyboard', await chatField('settings').isVisible());
    await chatField('settings').click();
    await page.locator('#sillymemory [data-sm="connect"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !jQuery('#sillymemory .inline-drawer-content').is(':animated'));
    check('chat settings action opens the native drawer and SillyMemory controls', await page.locator('#sillymemory [data-sm="connect"]').isVisible());
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = () => field('status').innerText();
    const waitStatus = async text => { await page.waitForFunction(text => document.querySelector('#sillymemory [data-sm="status"]')?.textContent.includes(text), text, { timeout: 30000 }); };
    check('fresh setup shows connection before preparation or activation', await field('connect').isVisible() && !await field('provision').isVisible() && !await field('enabled').isVisible() && !await field('budget').isVisible() && !await field('checkpoint-save').isVisible());
    const advancedSummary = field('advanced').locator(':scope > summary');
    await advancedSummary.focus(); await page.keyboard.press('Enter');
    check('Advanced opens with the keyboard', await field('budget').isVisible());
    await page.keyboard.press('Enter');
    check('closing Advanced leaves status and delivery feedback visible', !await field('budget').isVisible() && await field('status').isVisible() && await field('delivery').isVisible());
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
    check('auth failure is visible with reconnect guidance', (await status()).includes('Authentication failed') && (await status()).includes('Save and connect'));
    await field('key').fill('synthetic-session-key'); await field('connect').click(); await waitStatus('Connected.');
    check('verified connection collapses credentials and exposes preparation only', !await field('endpoint').isVisible() && await field('provision').isVisible() && !await field('enabled').isVisible());
    await openMemoryConnection(page);
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
    await field('connect').click(); await waitStatus('Connected.');
    await openMemoryConnection(page);
    await field('project').fill('other-project'); await field('key').fill('wrong-synthetic-key'); await field('connect').click(); await waitStatus('Authentication failed');
    check('a rejected explicit key for another project preserves the prior validated credential', await page.evaluate(() => {
        const name = Object.keys(localStorage).find(k => k.startsWith('sillymemory:credential:'));
        const record = JSON.parse(localStorage.getItem(name)); return record.project === 'synthetic' && record.key === 'synthetic-session-key';
    }) && collections.size === 0);
    await field('project').fill('synthetic'); await field('connect').click(); await waitStatus('Connected.');
    if (!faultMode) {
        faults.arm('delete-collection', 'http', 400);
        await field('provision').click(); await waitStatus('Invalid request');
        check('failed setup cleanup cannot mark memory ready or enable it', collections.size === 1 && !await field('enabled').isChecked() && await page.evaluate(() => !JSON.parse(localStorage.getItem(`sillymemory:state:${SillyTavern.getContext().extensionSettings.sillymemory.owner}`)).ready));
        check('pending cleanup is actionable without opening Advanced', await field('recover-cleanup').isVisible() && !await field('cleanup').isVisible() && !await field('provision').isVisible() && collections.size === 1);
        await field('recover-cleanup').click(); await waitStatus('No pending');
        check('cleanup restores preparation and removes the recovery action', await field('provision').isVisible() && !await field('recover-cleanup').isVisible());
    }
    const gateUploads = calls.filter(c => c.path.endsWith('/docs/upsert')).length;
    if (faultMode) faults.arm('upsert', 'http', 503);
    await field('provision').click(); await waitStatus('Chat memory is ready');
    if (faultMode) check('transport gate retries transient upsert readiness through direct CORS', calls.filter(c => c.path.endsWith('/docs/upsert')).length - gateUploads === 2);
    check('basic preparation runs the required transport test and cleans up without opening Advanced', collections.size === 0 && calls.filter(c => c.path.endsWith('/docs/upsert')).length > gateUploads && !await field('budget').isVisible() && !await field('enabled').isChecked());
    check('direct requests carry the key and origin but omit cookies and host CSRF', calls.some(c => c.keyPresent) && calls.every(c => !c.cookiePresent && !c.csrfPresent && c.origin === url) && preflights > 0 && proxyRequests === 0);
    check('prepared setup shows the memory switch instead of setup controls', !await field('provision').isVisible() && await field('enabled').isVisible() && !await field('endpoint').isVisible() && (await field('mode-help').innerText()).includes('usual chat history'));
    check('preparation creates no collection before a chat is enabled', collections.size === 0);
    await page.locator('#sillymemory .inline-drawer-toggle').scrollIntoViewIfNeeded();
    if (!faultMode) await page.screenshot({ path: path.join(artifacts, 'setup.png') });
    await expandMemorySettings(page);
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
    await waitStatus('Connected. Memory remains disabled.');
    check('reload reconnects without refilling the visible key input and preserves disabled memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
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
    await page.waitForFunction(() => document.querySelector('#sillymemory [data-sm=enabled]').checked);
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.name === 'SillyMemory Synthetic')); });
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
    await field('connect').click();
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm=connect]').disabled && document.querySelector('#sillymemory [data-sm=enabled]').checked);
    check('successful reconnect collapses the connection editor again', await field('connection').getAttribute('open') === null);
    check('retry uses the saved key and restores the prior enabled preference without password re-entry', await field('key').inputValue() === '' && await field('enabled').isChecked());
    await page.evaluate(() => {
        const key = Object.keys(localStorage).find(k => k.startsWith('sillymemory:credential:'));
        localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), key: 'wrong-synthetic-key' }));
    });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await waitStatus('Authentication failed');
    check('failed authentication reopens the connection editor', await field('connection').getAttribute('open') !== null);
    check('rejected restored key is removed and memory stays disabled', !await field('enabled').isChecked() && await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('sillymemory:credential:'))));
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await field('key').fill('synthetic-session-key'); await field('connect').click(); await waitStatus('Connected. Memory remains disabled.');
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.selectCharacterById(c.characters.findIndex(x => x.name === 'SillyMemory Synthetic')); });
    await field('enabled').check(); await waitStatus('synchronized');
    if (!faultMode) {
        // Fail a read-only ownership check so this UI case does not leave an
        // uncertain-write journal that changes the existing no-write controls.
        await page.route('**/projects/synthetic/collections/*', route => route.fulfill({ status: 400, json: { message: 'Synthetic ownership check failure' } }), { times: 1 });
        await field('sync').click(); await waitStatus('Invalid request');
        check('failed synchronization exposes an explicit retry beside status', await field('retry-sync').isVisible());
        check('chat status exposes synchronization failure outside the settings panel', (await chatField('label').innerText()).includes('Needs attention'));
        await openChatMemory(page);
        await chatField('sync').click(); await waitStatus('synchronized');
        check('successful retry removes its action', !await chatField('sync').isVisible());
        await chatField('settings').click(); await field('enabled').waitFor({ state: 'visible' });
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
    await chatField('settings').click(); await field('enabled').waitFor({ state: 'visible' });
    const unsupportedSource = await page.evaluate(async () => {
        const c = SillyTavern.getContext(), original = structuredClone(c.chat);
        c.chat.push({ is_system: true, mes: 'Synthetic tool result.', extra: { tool_invocations: [{ name: 'synthetic-tool' }] } });
        await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, c.chat.length - 1); return original;
    });
    check('enabled memory does not claim readiness in an unsupported tool conversation', (await chatField('label').innerText()).includes('Unavailable in this chat'));
    await page.evaluate(async original => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...original);
        await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0);
    }, unsupportedSource);
    await waitStatus('synchronized');
    check('a supported synchronized chat reports readiness without claiming prompt delivery', (await chatField('label').innerText()).includes('Ready') && (await chatField('delivery').innerText()).includes('No prompt checked'));
    await openChatMemory(page);
    await chatStatus.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'chat-memory-ready.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, 'chat-memory-narrow.png') });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await chatField('settings').click(); await field('enabled').waitFor({ state: 'visible' });
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
        const result = { before, after: JSON.stringify(c.chat), chat, aborted, rendered, guidance: c.extensionPrompts.sillymemory?.value || '', preparation: document.querySelector('[data-sm="status"]').textContent, renderedTokens: await c.getTokenCountAsync(rendered), macroValue: c.chatMetadata.variables?.sillymemory_test, injection: rendered, inspection: document.querySelector('[data-sm="inspection"]').textContent };
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
    check('a tight allocation succeeds without partially injecting a dated source', !result.aborted && !result.injection && /Prepared 0 source passages/.test(result.preparation) && /\d+ \/ 250 tokens/.test(result.inspection));
    check('small memory stays inside its budget with sent guidance', result.renderedTokens <= 250);
    // The longer macro-bearing source can be skipped at 250 once the shared
    // time explanation is counted. Test literal delivery when that whole source
    // fits, independently of the small-budget admission assertion above.
    await field('budget').fill('400'); await field('budget').dispatchEvent('change');
    const macroResult = await prompt();
    check('native recalled excerpts keep macros literal within budget', macroResult.rendered.includes('｛｛char｝｝') && macroResult.rendered.includes('＜USER＞') && macroResult.macroValue === undefined && macroResult.renderedTokens <= 400);
    await field('budget').fill('400'); await field('budget').dispatchEvent('change');
    check('a completed reply retains six messages without splitting a pair and leaves persisted source unchanged', JSON.stringify(result.chat.filter(m => !m.mes.startsWith('[Recalled conversation excerpts]')).map(m => m.index)) === '[2,3,4,5,6,7]' && result.chat.at(-1).mes.includes('passage 7') && result.before === result.after);
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
    const preparedCounts = /Prepared (\d+) source passages in (\d+) memory excerpts/.exec(assembled.preparation);
    const assembledMessage = assembled.chat.find(m => m.mes.startsWith('[Recalled conversation excerpts]') && m.mes.includes('message 1, passages 1-'));
    check('real host dispatcher assembles same-message chunks with their source and one shared header',
        !assembled.aborted && preparedCounts && Number(preparedCounts[1]) > Number(preparedCounts[2]) && assembledMessage?.mes.includes('passages 1-') && assembledMessage.mes.includes(assemblySource.text)
        && assembled.renderedTokens <= 1024 && assembled.before === assembled.after);
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
    await waitStatus('synchronized'); staleHits = [old];
    const branch = await prompt();
    check('native branch shares its story collection and rejects stale source', !branch.injection.includes('Edited:') && collections.size === 1 && [...collections.values()][0].branches.size === 3);
    if (!faultMode) {
        const beforeCopy = await page.evaluate(() => SillyTavern.getContext().chatMetadata.sillymemory.id);
        await field('enabled').uncheck();
        await page.evaluate(async () => { const c = SillyTavern.getContext(), { saveChat } = await import('/script.js'); await saveChat({ chatName: 'Synthetic copied' }); await c.openCharacterChat('Synthetic copied'); });
        page.once('dialog', d => d.accept()); await field('delete-chat').click(); await waitStatus('no longer accessible');
        check('deleting an unactivated copy cannot delete its parent', collections.size === 1);
        const uncertainCreate = faults.arm('create', 'hold'); await field('enabled').check();
        await uncertainCreate.entered; await waitStatus('timed out'); uncertainCreate.release();
        check('uncertain creation retains one pending owned collection', collections.size === 2);
        await field('sync').click(); await waitStatus('synchronized');
        check('create retry recovers the same collection', collections.size === 2);
        check('copied metadata receives a distinct collection', collections.size === 2 && await page.evaluate(() => SillyTavern.getContext().chatMetadata.sillymemory.id) !== beforeCopy);
        faults.arm('delete-branch', 'http', 503);
        page.once('dialog', d => d.accept()); await field('delete-chat').click(); await waitStatus('HTTP 503');
        check('failed individual deletion keeps remote collection for retry', collections.size === 2);
        page.once('dialog', d => d.accept()); await field('delete-chat').click(); await waitStatus('no longer accessible');
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
    await field('enabled').check(); await waitStatus('synchronized'); await prompt();
    await page.locator('#sillymemory details:has(> [data-sm=inspection]) > summary').click();
    await field('inspection').scrollIntoViewIfNeeded();
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
        await page.route('**/api/chats/save', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
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
    if (!faultMode) {
        // Native chat-list entry must enforce the same identity checks as manager rows.
        const originalFile = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
        for (const state of ['ready', 'pending']) {
            await page.evaluate(async state => {
                const c = SillyTavern.getContext();
                const { checkpointDigest } = await import('/scripts/extensions/third-party/sillymemory/src/checkpoints.js');
                const rows = [{ chat_metadata: { integrity: 'duplicate-native', sillymemory: {
                    id: 'd'.repeat(32), story: 'e'.repeat(32), version: 1, integrity: 'duplicate-native',
                    checkpoint: { state, snapshot: null, createdAt: '2026-01-01T00:00:00Z' },
                } } }, { mes: 'Synthetic duplicate checkpoint.', name: 'Mira', is_user: false }];
                rows[0].chat_metadata.sillymemory.checkpoint.hash = await checkpointDigest(rows);
                for (const name of ['Duplicate checkpoint A', 'Duplicate checkpoint B']) {
                    const response = await fetch('/api/chats/save', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, file_name: name, force: false, chat: rows }) });
                    if (!response.ok) throw new Error('Duplicate checkpoint fixture save failed');
                }
                await c.openCharacterChat('Duplicate checkpoint A');
            }, state);
            const before = calls.length;
            await field('checkpoint-refresh').click();
            await page.waitForFunction(() => !document.querySelector('[data-sm="checkpoint-refresh"]').disabled);
            check(`${state} duplicate checkpoints are blocked in the manager`, (await field('checkpoint-list').innerText()).match(/Duplicate identity/g)?.length === 2 && await field('checkpoint-list').locator('button').count() === 0);
            for (const button of ['checkpoint-save', 'checkpoint-resume']) {
                await field(button).click();
                await page.waitForFunction(button => !document.querySelector(`[data-sm="${button}"]`).disabled, button);
                check(`${state} duplicate native checkpoint ${button} is rejected before remote access`, (await status()).includes('duplicated') && calls.length === before);
            }
        }
        await page.evaluate(async originalFile => {
            const c = SillyTavern.getContext(); await c.openCharacterChat(originalFile);
            for (const name of ['Duplicate checkpoint A', 'Duplicate checkpoint B']) {
                const response = await fetch('/api/chats/delete', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, chatfile: `${name}.jsonl` }) });
                if (!response.ok) throw new Error('Duplicate fixture cleanup failed');
            }
        }, originalFile);
    }
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
    if (faultMode) { staleHits = []; faultResults = await runFaultScenarios({ page, field, waitStatus, prompt, check, faults, collections, calls, restartHost: recoveryMode ? async () => { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGKILL'); await exited; await start(false); } : undefined, screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}${artifactTag ? `-${artifactTag}` : ''}.png`) }) }); }
    else { page.once('dialog', dialog => dialog.accept()); await field('delete').click(); await waitStatus('no longer accessible'); }
    check('owned remote deletion leaves no collections', collections.size === 0);
    await field('budget').fill('512'); await field('budget').dispatchEvent('change');
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await waitStatus('Connected.');
    check('remote deletion leaves reconnection available but preserves disabled memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    check('explicit user budget survives reload without default replacement', await field('budget').inputValue() === '512');
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

    if (faultMode) check('fault run has no uncaught browser page errors', errors.length === 0);
    const sourceSha256 = {};
    for (const file of ['index.js', 'manifest.json', 'settings.html', 'style.css', 'src/chunking.js', 'src/client.js', 'src/credentials.js', 'src/commit.js', 'src/chat-collections.js', 'src/checkpoints.js', 'src/gate.js', 'src/memory.js', 'src/time.js', 'src/context.js', 'scripts/native-reply-scenarios.mjs', 'src/delivery.js', 'src/status.js', 'scripts/browser-smoke.mjs', 'scripts/settings-panel.mjs', 'scripts/emulator-cors.mjs', 'scripts/fault-scenarios.mjs', 'scripts/recovery-scenarios.mjs']) {
        sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    await writeFile(path.join(artifacts, artifactName), JSON.stringify({ passed: true, faultResults, nativeReplyResults, sourceSha256, time: new Date().toISOString(), sillyTavern: revision, node: process.version, browser: browser.version(), upstream: 'Local HTTPS LambdaDB emulator; no live managed embeddings', checks, pageErrors: errors, requestCount: calls.length, preflights, proxyRequests, remainingCollections: collections.size }, null, 2));
} catch (error) {
    if (faultMode) await writeFile(path.join(artifacts, artifactName), JSON.stringify({ passed: false, checks, faultResults, faultObservations: faults.observations, failure: error.message, pageErrors: errors, pageErrorDetails, hostFailures, remainingCollections: collections.size }, null, 2));
    console.error('Browser failure status:', await debugPage?.locator('[data-sm="status"]').innerText().catch(() => 'unavailable'));
    console.error('Upstream request count:', calls.length);
    await debugPage?.screenshot({ path: path.join(artifacts, faultMode ? 'fault-failure.png' : 'failure.png') }).catch(() => {});
    throw error;
} finally { faults.releaseAll(); await browser?.close(); await stop(); await new Promise(r => remote.close(r)); await rm(work, { recursive: true, force: true }); }
