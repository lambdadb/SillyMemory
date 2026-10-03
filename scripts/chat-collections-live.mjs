// Bounded real UI + direct browser CORS + managed LambdaDB lifecycle acceptance.
// No generation provider calls; fresh synthetic profile and at most four small collections.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
assert.equal(await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), root);
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
assert(Object.values(credentials).every(Boolean), 'Missing LambdaDB credentials');
const work = await mkdtemp(path.join(tmpdir(), 'sm-chat-collections-'));
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
const pendingPath = path.join(artifacts, 'chat-collections-live-pending.json');
const pending = []; await writeFile(pendingPath, '[]', { flag: 'wx' });
const sourceSha256 = {};
for (const file of ['index.js', 'settings.html', 'src/chat-collections.js', 'src/client.js', 'src/memory.js', 'scripts/chat-collections-live.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
const report = { time: new Date().toISOString(), host: revision, sourceSha256, checks: [], responses: [], proxyRequests: 0, pageErrors: [], cleanup: false, passed: false };
const check = (name, ok) => { assert(ok, name); report.checks.push(name); console.log(`PASS ${name}`); };
const url = `http://127.0.0.1:${Number(process.env.ST_LIVE_PORT || 18147)}`;
let server, browser, page, panel, stage = 'startup';
try {
    const config = path.join(work, 'config.yaml'); await writeFile(config, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', config, '--dataRoot', path.join(work, 'data'), '--port', new URL(url).port, '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'false'], { cwd: source, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 90; i++) { try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
    assert(ready, 'Host startup');
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8')); profile.main_api = 'openai'; await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(20000);
    page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/proxy/')) report.proxyRequests++; });
    page.on('dialog', dialog => { void dialog.accept().catch(error => report.pageErrors.push(error.name)); });
    await page.route(`${new URL(credentials.endpoint).origin}/**`, async route => {
        try {
        const req = route.request(), target = new URL(req.url());
        assert.equal(target.origin, new URL(credentials.endpoint).origin);
        if (req.method() === 'POST' && target.pathname.endsWith('/collections')) {
            const body = req.postDataJSON();
            assert(pending.length < 4, 'Bounded collection count');
            pending.push({ collection: body.collectionName, owner: body.tags.owner, scope: body.tags.chat });
            await writeFile(pendingPath, JSON.stringify(pending, null, 2));
        }
        await route.continue();
        } catch (error) { report.pageErrors.push(error.name); await route.abort().catch(() => {}); }
    });
    page.on('response', r => { if (new URL(r.url()).origin === new URL(credentials.endpoint).origin) report.responses.push({ stage, status: r.status() }); });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor(); await page.getByText('Save', { exact: true }).last().click();
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = async text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 60000 });
    panel = async () => {
        await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
        if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
        if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    };
    const connect = async () => { await panel(); await field('endpoint').fill(credentials.endpoint); await field('project').fill(credentials.project); await field('key').fill(credentials.key); await field('connect').click(); };
    const identity = () => page.evaluate(async () => {
        const c = SillyTavern.getContext(), { capture } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { chatCollection } = await import('/scripts/extensions/third-party/sillymemory/src/chat-collections.js');
        return { ...await chatCollection(capture(c), c.extensionSettings.sillymemory.owner), file: c.getCurrentChatId(), id: c.chatMetadata.sillymemory.id };
    });
    const absent = entry => page.evaluate(async ({ credentials, entry }) => {
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const client = new LambdaClient(credentials, credentials.key);
        try { await client.get(entry.collection); return false; } catch (e) { if (e.status !== 404) throw e; return true; } finally { client.forget(); }
    }, { credentials, entry });
    const inspect = entry => page.evaluate(async ({ credentials, entry }) => {
        const { LambdaClient, scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const c = SillyTavern.getContext(), owner = c.extensionSettings.sillymemory.owner;
        const client = new LambdaClient(credentials, credentials.key);
        try { await client.assertOwned(entry.collection, owner, undefined, entry.scope); return await client.query(entry.collection, scopeFilter(owner, entry.scope)); } finally { client.forget(); }
    }, { credentials, entry });
    stage = 'transport'; await connect(); await field('gate').click(); await status('Transport gate passed');
    await field('provision').click(); await status('Chat memory is ready');
    await field('recent').fill('2'); await field('recent').dispatchEvent('change');
    await field('budget').fill('800'); await field('budget').dispatchEvent('change');
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), body = new FormData(); body.set('ch_name', 'Collection Lifecycle'); body.set('first_mes', 'Synthetic collection lifecycle.');
        const r = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body }); if (!r.ok) throw new Error('Character creation');
    });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'Collection Lifecycle' }).click();
    await page.waitForFunction(() => SillyTavern.getContext().characterId !== undefined);
    await connect();
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...Array.from({ length: 6 }, (_, i) => ({ mes: i === 0 ? 'The blue compass is beneath the cedar tree.' : `Synthetic turn ${i}: tell me about the blue compass.`, name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: 0, extra: {} })));
        await c.saveChat();
    });
    stage = 'parent'; await field('enabled').check(); await status('synchronized');
    const parent = await identity(), parentRows = await inspect(parent);
    check('parent managed collection contains four current documents', parentRows.length === 4);
    const writes = () => report.responses.filter(r => r.stage === 'unchanged').length;
    stage = 'unchanged'; await field('sync').click(); await status('synchronized');
    check('unchanged sync retains exact document IDs', JSON.stringify((await inspect(parent)).map(d => d.id).sort()) === JSON.stringify(parentRows.map(d => d.id).sort()));
    report.unchangedRequests = writes();
    stage = 'rename';
    await page.evaluate(async () => { const { renameChat } = await import('/script.js'); await renameChat(SillyTavern.getContext().getCurrentChatId(), 'Lifecycle renamed'); });
    await status('synchronized'); const renamed = await identity();
    check('native rename preserves collection and chat identity', renamed.collection === parent.collection && renamed.id === parent.id && renamed.file !== parent.file);
    stage = 'branch';
    await page.evaluate(async () => { const c = SillyTavern.getContext(), { createBranch } = await import('/scripts/bookmarks.js'); const branch = await createBranch(c.chat.length - 1); await c.openCharacterChat(branch); });
    await status('synchronized'); const branch = await identity();
    check('native branch gets separate collection and complete source', branch.collection !== parent.collection && (await inspect(branch)).length === 4);
    await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'The silver compass is in the stone tower.'; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); });
    await status('synchronized');
    check('branch edits leave parent facts unchanged', (await inspect(parent)).some(d => d.text.includes('cedar tree')) && (await inspect(branch)).some(d => d.text.includes('stone tower')) && !(await inspect(branch)).some(d => d.text.includes('cedar tree')));
    stage = 'copy';
    await page.evaluate(async () => { const c = SillyTavern.getContext(); const { saveChat } = await import('/script.js'); await saveChat({ chatName: 'Lifecycle copied' }); await c.openCharacterChat('Lifecycle copied'); });
    await status('synchronized'); const copy = await identity();
    check('copied metadata cannot reuse source branch collection', copy.collection !== branch.collection && copy.collection !== parent.collection && (await inspect(copy)).length === 4);
    stage = 'recall';
    const recall = await page.evaluate(async () => {
        const c = SillyTavern.getContext(), chat = c.chat.map((m, index) => ({ ...m, index })); let aborted = false;
        await globalThis.sillymemory_intercept(chat, 4096, () => { aborted = true; }, 'normal');
        const recalled = chat.filter(m => m.mes.startsWith('[Past conversation excerpt:'));
        if (!aborted) await c.eventSource.emit(c.eventTypes.GENERATE_AFTER_DATA, { prompt: chat.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })) }, false);
        return { aborted, passages: recalled.length, last: chat.at(-1).mes, text: recalled.map(m => m.mes).join('\n') };
    });
    check('managed queryText through UI interceptor retrieves synthetic source', !recall.aborted && recall.passages > 0 && recall.text.includes('stone tower') && recall.last.includes('turn 5'));
    stage = 'single deletion'; await panel(); await field('delete-chat').click(); await status('no longer accessible');
    check('individual deletion confirmed absent before fallback cleanup', await absent(copy));
    check('deleting current copy preserves parent and branch', (await inspect(parent)).length === 4 && (await inspect(branch)).length === 4);
    stage = 'reload'; await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    check('reload requires key entry and leaves memory disabled', await field('key').inputValue() === '' && !await field('enabled').isChecked());
    await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'Collection Lifecycle' }).click();
    await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), renamed.file);
    await connect(); await field('enabled').check(); await status('synchronized');
    check('reload reconnects renamed parent without another collection', (await identity()).collection === parent.collection && pending.length === 4);
    stage = 'discovery cleanup';
    // Lose only the local registry: remote ownership discovery must still find both.
    await page.evaluate(() => { const c = SillyTavern.getContext(), key = `sillymemory:state:${c.extensionSettings.sillymemory.owner}`; const s = JSON.parse(localStorage.getItem(key)); s.chatCollections = []; localStorage.setItem(key, JSON.stringify(s)); });
    await page.reload(); await connect(); await panel(); await field('delete').click(); await status('no longer accessible');
    check('all-owned cleanup discovers collections after local registry loss', await absent(parent) && await absent(branch) && await absent(copy));
    check('credentials absent from persistent profile', !(await readFile(profilePath, 'utf8')).includes(credentials.key));
    check('direct lifecycle uses no host proxy or browser automation errors', report.proxyRequests === 0 && report.pageErrors.length === 0);
    report.passed = true;
} catch (error) { report.failure = { stage, type: error.name, message: error.message.replaceAll(credentials.key, '[redacted]').slice(0, 600), ...(error.name === 'AssertionError' ? { check: error.message } : {}) }; console.log(`FAIL ${stage}: ${error.name}`); }
finally {
    if (page && !page.isClosed()) {
        try {
            if (pending.length) {
                await panel();
                await page.locator('[data-sm="delete"]').click();
                await page.waitForFunction(() => document.querySelector('[data-sm="status"]')?.textContent.includes('no longer accessible'), null, { timeout: 60000 });
            }
            await page.evaluate(async ({ credentials, entries }) => {
                const c = SillyTavern.getContext();
                const enabled = document.querySelector('[data-sm="enabled"]'); if (enabled?.checked) { enabled.checked = false; enabled.dispatchEvent(new Event('change')); }
                const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
                const client = new LambdaClient(credentials, credentials.key);
                try { for (const e of entries) await client.deleteOwnedCollection(e.collection, e.owner, e.scope); } finally { client.forget(); }
            }, { credentials, entries: pending });
            report.cleanup = true; await rm(pendingPath);
        } catch { report.cleanup = false; }
    }
    report.passed &&= report.cleanup;
    report.sourceUnchanged = true;
    for (const [file, hash] of Object.entries(sourceSha256)) if (createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') !== hash) report.sourceUnchanged = false;
    report.passed &&= report.sourceUnchanged;
    const output = JSON.stringify(report, null, 2); assert(!output.includes(credentials.key));
    await writeFile(path.join(artifacts, 'chat-collections-live.json'), output);
    await browser?.close(); if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    await rm(work, { recursive: true, force: true });
}
process.exitCode = report.passed ? 0 : 1;
