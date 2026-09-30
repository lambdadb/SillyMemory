// Real pinned SillyTavern + real Chromium + real CORS proxy; LambdaDB is emulated.
// Never use this harness with personal data or a real API key.
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
const collections = new Map(); const calls = []; let delayedQuery = 0; let staleHits = []; let failQuery = false;
const remote = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    const buffers = []; for await (const b of req) buffers.push(b);
    const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
    calls.push({ method: req.method, path: req.url, body, keyPresent: req.headers['x-api-key'] === 'synthetic-session-key', cookiePresent: Boolean(req.headers.cookie), csrfPresent: Boolean(req.headers['x-csrf-token']) });
    const send = (status, value = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers['x-api-key'] !== 'synthetic-session-key') return send(401, { message: 'synthetic auth failure' });
    const parts = req.url.split('/').filter(Boolean);
    if (parts[0] !== 'projects' || parts[1] !== 'synthetic' || parts[2] !== 'collections') return send(404);
    const name = parts[3];
    if (!name && req.method === 'POST') {
        if (collections.has(body.collectionName)) return send(409);
        assert.equal(body.indexConfigs.embedding.managedEmbedding, true);
        collections.set(body.collectionName, { definition: body, docs: new Map() }); return send(201, { collection: body });
    }
    const c = collections.get(name); if (!c) return send(404);
    if (parts.length === 4 && req.method === 'GET') return send(200, { collection: c.definition });
    if (parts.length === 4 && req.method === 'DELETE') { collections.delete(name); return send(200); }
    if (parts[4] === 'docs' && parts[5] === 'upsert') return faults.respond('upsert', () => { body.docs.forEach(d => c.docs.set(d.id, d)); return [202, {}]; }, send);
    if (parts[4] === 'docs' && parts[5] === 'delete') return faults.respond('delete-docs', () => { body.ids.forEach(id => c.docs.delete(id)); return [202, {}]; }, send);
    if (parts[4] === 'query') {
        if (failQuery) return send(503);
        if (delayedQuery) await new Promise(r => setTimeout(r, delayedQuery));
        const filter = body.query.knn?.filter || body.query;
        const match = /^owner:([a-f0-9]+) AND scope:([a-f0-9]+)$/.exec(filter.queryString?.query || '');
        assert.ok(match, 'owner and scope query filters required');
        if (body.query.knn) assert.equal(typeof body.query.knn.queryText, 'string');
        const docs = [...c.docs.values()].filter(d => d.owner === match[1] && d.scope === match[2]);
        return faults.respond('query', () => [200, { docs: [...docs, ...staleHits].map(doc => ({ collection: name, doc })), isDocsInline: true, total: docs.length, took: 1 }], send);
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
    await stop(); await start(true);
    // The default profile selects the remote Horde service. This interceptor
    // test generates no model responses; do not make its success depend on
    // Horde availability during startup/reloads. Use an unconnected OpenAI UI.
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.main_api = 'openai';
    await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch();
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await browserContext.newPage();
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
    const savedSettings = JSON.parse(await readFile(path.join(work, 'data/default-user/settings.json'), 'utf8'));
    check('owner identity is durable before first remote request', /^[a-f0-9]{32}$/.test(savedSettings.extension_settings?.sillymemory?.owner));
    // Open the real extension panel and drawer, then interact with visible settings.
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#sillymemory .inline-drawer-toggle').click();
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = () => field('status').innerText();
    const waitStatus = async text => { await page.waitForFunction(text => document.querySelector('#sillymemory [data-sm="status"]')?.textContent.includes(text), text, { timeout: 30000 }); };
    await field('endpoint').fill(endpoint); await field('project').fill('synthetic');
    await field('key').fill('wrong-synthetic-key'); await field('connect').click();
    await field('gate').click(); await waitStatus('Authentication failed');
    check('auth failure is visible with reconnect guidance', (await status()).includes('Authentication failed') && (await status()).includes('Use key for this session'));
    await field('key').fill('synthetic-session-key'); await field('connect').click();
    await field('cleanup').click(); await waitStatus('No pending');
    if (faultMode) faults.arm('upsert', 'http', 503);
    await field('gate').click(); await waitStatus('Transport gate passed');
    if (faultMode) check('transport gate retries transient upsert readiness through the proxy', calls.filter(c => c.path.endsWith('/docs/upsert')).length === 2);
    check('synthetic gate traverses the real proxy and cleans up', collections.size === 0);
    check('real proxy forwards x-api-key and strips cookies/CSRF', calls.some(c => c.keyPresent) && calls.every(c => !c.cookiePresent && !c.csrfPresent));
    await field('provision').click(); await waitStatus('Memory collection created');
    check('owned memory collection created', collections.size === 1);
    await page.locator('#sillymemory .inline-drawer-toggle').scrollIntoViewIfNeeded();
    if (!faultMode) await page.screenshot({ path: path.join(artifacts, 'setup.png') });
    await field('recent').fill('2'); await field('recent').dispatchEvent('change');
    await field('budget').fill('250'); await field('budget').dispatchEvent('change');
    // Create a synthetic character through SillyTavern's own API, then load it.
    await page.evaluate(async () => {
        const ctx = SillyTavern.getContext();
        const data = new FormData(); data.set('ch_name', 'SillyMemory Synthetic'); data.set('description', 'Synthetic test character'); data.set('first_mes', 'The blue compass is beneath the cedar tree.');
        const response = await fetch('/api/characters/create', { method: 'POST', headers: ctx.getRequestHeaders({ omitContentType: true }), body: data });
        if (!response.ok) throw new Error('Could not create synthetic character');
    });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    check('reload clears key and disables memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    await page.locator('#rightNavHolder .drawer-toggle').click();
    await page.locator('.character_select').filter({ hasText: 'SillyMemory Synthetic' }).click();
    await page.waitForFunction(() => SillyTavern.getContext().characterId !== undefined);
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await field('key').fill('synthetic-session-key'); await field('connect').click();
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...Array.from({ length: 8 }, (_, i) => ({ mes: `Synthetic passage ${i}: the blue compass is beneath the cedar tree.${i === 0 ? ' {{setvar::sillymemory_test::oops}} {{char}} <USER>' : ''}`, name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: Date.now(), extra: {} })));
        await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, 7);
    });
    await field('enabled').check(); await waitStatus('synchronized');
    const prompt = () => page.evaluate(async () => {
        const c = SillyTavern.getContext(); const before = JSON.stringify(c.chat);
        const chat = c.chat.map((m, index) => ({ ...m, index })); let aborted = false;
        // Exercise the actual host interceptor dispatcher, including manifest order.
        const { runGenerationInterceptors } = await import('/scripts/extensions.js');
        aborted = await runGenerationInterceptors(chat, 4096, 'normal');
        const rendered = chat.filter(m => m.mes.startsWith('[Past conversation excerpt:')).map(m => m.mes).join('\n');
        const result = { before, after: JSON.stringify(c.chat), chat, aborted, rendered, renderedTokens: await c.getTokenCountAsync(rendered), macroValue: c.chatMetadata.variables?.sillymemory_test, injection: rendered, inspection: document.querySelector('[data-sm="inspection"]').textContent };
        // This suite calls only the interceptor dispatcher. Emulate its completion
        // boundary to release prompt ownership; full packing/dispatch is tested
        // by prompt-delivery-smoke.mjs, not by this synthetic final event.
        if (!aborted) await c.eventSource.emit(c.eventTypes.GENERATE_AFTER_DATA, { prompt: chat.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })) }, false);
        return result;
    });
    const result = await prompt();
    check('real host dispatcher injects bounded memory', Boolean(result.injection) && /\d+ \/ 250 tokens/.test(result.inspection));
    check('native recalled excerpts keep macros literal within budget', result.rendered.includes('｛｛char｝｝') && result.rendered.includes('＜USER＞') && result.macroValue === undefined && result.renderedTokens <= 250);
    check('recent messages and persisted source chat are preserved', result.chat.filter(m => !m.mes.startsWith('[Past conversation excerpt:')).length === 2 && result.chat.at(-2).mes.includes('passage 6') && result.before === result.after);
    delayedQuery = 400;
    const olderGeneration = prompt();
    await page.waitForTimeout(100);
    const newerGeneration = prompt();
    const [older, newer] = await Promise.all([olderGeneration, newerGeneration]); delayedQuery = 0;
    check('overlapping generations cannot overwrite the newest injection', older.aborted && !newer.aborted && Boolean(newer.injection));
    const collection = [...collections.values()][0]; const old = [...collection.docs.values()][0];
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'Edited: the compass is in the tower.'; await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); });
    await waitStatus('synchronized'); staleHits = [old];
    const edited = await prompt();
    check('edits delete stale records and reject delayed old hits', !collection.docs.has(old.id) && !edited.injection.includes('Synthetic passage 0'));
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[1].mes = 'Selected swipe: silver compass'; c.chat[1].swipe_id = 1; await c.eventSource.emit(c.eventTypes.MESSAGE_SWIPED, 1); });
    await waitStatus('synchronized');
    check('swipe event updates remote source', [...collection.docs.values()].some(d => d.text.includes('Selected swipe')));
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat.splice(0, 1); await c.eventSource.emit(c.eventTypes.MESSAGE_DELETED, 0); });
    await waitStatus('synchronized');
    check('message deletion reconciles remote documents', collection.docs.size === 5);
    delayedQuery = 700;
    const pending = prompt();
    await page.waitForTimeout(150);
    await page.evaluate(async () => { const c = SillyTavern.getContext(); const { createBranch } = await import('/scripts/bookmarks.js'); const name = await createBranch(c.chat.length - 1); if (!name) throw new Error('Native branch creation failed'); await c.openCharacterChat(name); });
    const raced = await pending; delayedQuery = 0;
    check('chat switch rejects late result and aborts old generation', raced.aborted && !raced.injection);
    await waitStatus('synchronized'); staleHits = [old];
    const branch = await prompt();
    check('native branch scope excludes original chat results', !branch.injection.includes('Edited:') && new Set([...collection.docs.values()].map(d => d.scope)).size === 2);
    failQuery = true;
    const failed = await prompt(); failQuery = false;
    check('query failure preserves unmodified prompt', !failed.injection && failed.chat.length === 7);
    await field('enabled').uncheck(); const off = await prompt();
    check('disable clears injection and preserves full prompt', !off.injection && off.chat.length === 7);
    const secrets = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    check('session key is absent from browser/settings storage', !secrets.includes('synthetic-session-key') && !secrets.includes('wrong-synthetic-key'));
    await field('enabled').check(); await waitStatus('synchronized'); await prompt();
    await page.locator('#sillymemory details').evaluate(e => { e.open = true; });
    await field('inspection').scrollIntoViewIfNeeded();
    if (!faultMode) await page.screenshot({ path: path.join(artifacts, 'settings.png') });
    if (faultMode) { staleHits = []; faultResults = await runFaultScenarios({ page, field, waitStatus, prompt, check, faults, collections, calls, restartHost: recoveryMode ? async () => { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGKILL'); await exited; await start(true); } : undefined, screenshot: name => page.screenshot({ path: path.join(artifacts, `${name}${artifactTag ? `-${artifactTag}` : ''}.png`) }) }); }
    else { page.once('dialog', dialog => dialog.accept()); await field('delete').click(); await waitStatus('no longer accessible'); }
    check('owned remote deletion leaves no collections', collections.size === 0);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    check('final reload again requires key entry', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    if (faultMode) check('fault run has no uncaught browser page errors', errors.length === 0);
    const sourceSha256 = {};
    for (const file of ['index.js', 'manifest.json', 'settings.html', 'style.css', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/context.js', 'src/status.js', 'scripts/browser-smoke.mjs', 'scripts/fault-scenarios.mjs', 'scripts/recovery-scenarios.mjs']) {
        sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    await writeFile(path.join(artifacts, artifactName), JSON.stringify({ passed: true, faultResults, sourceSha256, time: new Date().toISOString(), sillyTavern: revision, node: process.version, browser: browser.version(), upstream: 'Local HTTPS LambdaDB emulator; no live managed embeddings', checks, pageErrors: errors, requestCount: calls.length, remainingCollections: collections.size }, null, 2));
} catch (error) {
    if (faultMode) await writeFile(path.join(artifacts, artifactName), JSON.stringify({ passed: false, checks, faultResults, faultObservations: faults.observations, failure: error.message, pageErrors: errors, pageErrorDetails, hostFailures, remainingCollections: collections.size }, null, 2));
    console.error('Browser failure status:', await debugPage?.locator('[data-sm="status"]').innerText().catch(() => 'unavailable'));
    console.error('Upstream request count:', calls.length);
    await debugPage?.screenshot({ path: path.join(artifacts, faultMode ? 'fault-failure.png' : 'failure.png') }).catch(() => {});
    throw error;
} finally { faults.releaseAll(); await browser?.close(); await stop(); await new Promise(r => remote.close(r)); await rm(work, { recursive: true, force: true }); }
