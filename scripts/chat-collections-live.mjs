// Bounded real UI + direct browser CORS + managed LambdaDB lifecycle acceptance.
// No generation calls; at most four small collections, or two with --large-history (1,100 submitted documents).
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const large = process.argv.includes('--large-history');
const manager = process.argv.includes('--checkpoint-manager');
const recovery = process.argv.includes('--checkpoint-recovery') || manager;
const checkpoints = process.argv.includes('--checkpoints') || recovery;
const versioned = process.argv.includes('--versioned') || checkpoints;
const root = path.resolve(new URL('..', import.meta.url).pathname);
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
assert.equal(await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), root);
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
assert(Object.values(credentials).every(Boolean), 'Missing LambdaDB credentials');
const work = await mkdtemp(path.join(tmpdir(), 'sm-chat-collections-'));
const artifactTag = process.env.SM_ARTIFACT_TAG || (recovery ? 'checkpoint-recovery' : checkpoints ? 'checkpoint-host' : versioned ? 'versioned-host' : 'collections-host');
assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag));
const artifacts = path.join(root, 'artifacts', artifactTag); await mkdir(artifacts, { recursive: true });
const pendingPath = path.join(artifacts, 'chat-collections-live-pending.json');
const pending = []; await writeFile(pendingPath, '[]', { flag: 'wx' });
const sourceSha256 = {};
for (const file of ['index.js', 'settings.html', 'style.css', 'src/chat-collections.js', 'src/client.js', 'src/commit.js', 'src/memory.js', 'src/status.js', 'src/checkpoints.js', 'scripts/chat-collections-live.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
const report = { large, manager, recovery, checkpoints, versioned, upserts: [], fetches: [], time: new Date().toISOString(), host: revision, sourceSha256, checks: [], responses: [], proxyRequests: 0, pageErrors: [], cleanup: false, passed: false };
const check = (name, ok) => { assert(ok, name); report.checks.push(name); console.log(`PASS ${name}`); };
const url = `http://127.0.0.1:${Number(process.env.ST_LIVE_PORT || 18147)}`;
let server, browser, page, panel, connect, stage = 'startup';
let loseBranch = false, holdDocs, blockReady = false, loseResume = false, blockedResume;
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
    page.on('dialog', dialog => { void dialog.accept(dialog.type() === 'prompt' ? 'Observatory checkpoint' : undefined).catch(error => report.pageErrors.push(error.name)); });
    await page.route(`${new URL(credentials.endpoint).origin}/**`, async route => {
        try {
        const req = route.request(), target = new URL(req.url());
        assert.equal(target.origin, new URL(credentials.endpoint).origin);
        if (req.method() === 'POST' && target.pathname.endsWith('/collections')) {
            const body = req.postDataJSON();
            assert(pending.length < (large ? 2 : 4), 'Bounded collection count');
            pending.push({ collection: body.collectionName, owner: body.tags.owner, scope: body.tags.chat });
            await writeFile(pendingPath, JSON.stringify(pending, null, 2));
        }
        if (req.method() === 'POST' && target.pathname.endsWith('/docs/upsert')) report.upserts.push({ stage, branch: req.postDataJSON().branch, documents: req.postDataJSON().docs.length });
        if (req.method() === 'POST' && target.pathname.endsWith('/docs/fetch')) {
            const body = req.postDataJSON(); report.fetches.push({ stage, ids: body.ids.length, consistentRead: body.consistentRead });
        }
        if (large) assert(report.upserts.reduce((n, x) => n + x.documents, 0) <= 1100, 'Bounded large-history document submissions');
        if (loseBranch && req.method() === 'POST' && target.pathname.endsWith('/branches')) {
            loseBranch = false; const response = await route.fetch(); assert(response.ok()); await route.abort(); return;
        }
        if (holdDocs && req.method() === 'GET' && target.pathname.endsWith('/docs')) {
            const hold = holdDocs; holdDocs = undefined; await hold();
        }
        await route.continue();
        } catch (error) { report.pageErrors.push(error.name); await route.abort().catch(() => {}); }
    });
    if (recovery) {
        await page.route('**/api/chats/save', async route => {
            const body = route.request().postDataJSON();
            if (blockReady && body.chat?.[0]?.chat_metadata?.sillymemory?.checkpoint?.state === 'ready') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
            if (loseResume && body.file_name.startsWith('SillyMemory resume')) {
                loseResume = false; blockedResume = body.file_name;
                const response = await route.fetch(); assert(response.ok()); return route.abort();
            }
            return route.continue();
        });
        await page.route('**/api/chats/get', route => route.request().postDataJSON().file_name === blockedResume
            ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.continue());
    }
    page.on('response', r => { if (new URL(r.url()).origin === new URL(credentials.endpoint).origin) report.responses.push({ stage, status: r.status(), method: r.request().method(), resource: new URL(r.url()).pathname.split('/').slice(5).join('/') || 'collection' }); });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor(); await page.getByText('Save', { exact: true }).last().click();
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = async text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 180000 });
    panel = async () => {
        await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
        if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
        if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    };
    connect = async () => { await panel(); await field('endpoint').fill(credentials.endpoint); await field('project').fill(credentials.project); await field('key').fill(credentials.key); await field('connect').click(); };
    const identity = () => page.evaluate(async () => {
        const c = SillyTavern.getContext(), { capture } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { chatCollection } = await import('/scripts/extensions/third-party/sillymemory/src/chat-collections.js');
        return { ...await chatCollection(capture(c), c.extensionSettings.sillymemory.owner), file: c.getCurrentChatId(), id: c.chatMetadata.sillymemory.id };
    });
    const absent = entry => page.evaluate(async ({ credentials, entry }) => {
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const client = new LambdaClient(credentials, credentials.key);
        try { if (entry.branch) return !(await client.branches(entry.collection)).some(b => b.name === entry.branch); await client.get(entry.collection); return false; } catch (e) { if (e.status !== 404) throw e; return true; } finally { client.forget(); }
    }, { credentials, entry });
    const inspect = entry => page.evaluate(async ({ credentials, entry }) => {
        const { LambdaClient, scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const c = SillyTavern.getContext(), owner = c.extensionSettings.sillymemory.owner;
        const client = new LambdaClient(credentials, credentials.key);
        try { await client.assertOwned(entry.collection, owner, undefined, entry.scope); return await client.query(entry.collection, scopeFilter(owner, entry.scope), { branch: entry.branch || 'main' }); } finally { client.forget(); }
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
    if (large) {
        report.measurements = []; report.largeMessages = 1000;
        const measure = async (name, job) => {
            stage = name; const start = performance.now(), before = report.responses.length, writes = report.upserts.length;
            await job();
            report.measurements.push({ phase: name, milliseconds: Math.round(performance.now() - start), remoteResponses: report.responses.length - before, upsertDocuments: report.upserts.slice(writes).reduce((n, x) => n + x.documents, 0) });
        };
        const idle = () => page.waitForFunction(() => !document.querySelector('[data-sm="checkpoint-refresh"]').disabled);
        await page.evaluate(async () => {
            const c = SillyTavern.getContext();
            const text = 'The expedition recorded the route to the observatory, checked the brass compass, and compared the ledger with the harbor map. Mira marked the supplies, weather, and next meeting location in the journal. ';
            c.chat.splice(0, c.chat.length, ...Array.from({ length: 1000 }, (_, i) => ({ mes: `Synthetic expedition entry ${i}. ${text.repeat(3).slice(0, 450)}`, name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: 0, extra: {} })));
            await c.saveChat();
        });
        await panel(); await field('versioned').click(); await status('Versioned story memory is ready');
        await measure('large initial sync', async () => {
            await field('enabled').check(); await status('synchronized'); await field('enabled').uncheck();
        });
        const parent = await identity();
        check('large history initially submits 998 older messages exactly once', report.upserts.filter(x => x.stage === 'large initial sync').reduce((n, x) => n + x.documents, 0) === 998);
        for (let i = 1; i <= 3; i++) await measure(`large checkpoint ${i}`, async () => {
            await field('checkpoint-name').fill(`Large snapshot ${i}`);
            await field('checkpoint-save').click(); await status('Checkpoint saved:'); await idle();
        });
        await measure('large list', async () => { await field('checkpoint-refresh').click(); await idle(); });
        check('large manager lists three ready checkpoints', await field('checkpoint-list').locator('.sm-checkpoint').count() === 3 && (await field('checkpoint-list').innerText()).match(/Ready/g)?.length === 3);
        await measure('large resume and sync', async () => {
            const row = field('checkpoint-list').locator('.sm-checkpoint').filter({ has: page.locator('strong', { hasText: 'Large snapshot 1' }) });
            await row.getByRole('button', { name: 'Resume', exact: true }).click(); await status('Checkpoint resumed as'); await idle();
            await field('enabled').check(); await status('synchronized'); await field('enabled').uncheck();
        });
        const resumed = await identity();
        await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
        check('large reload clears key and disables memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
        await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'Collection Lifecycle' }).click();
        await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), resumed.file); await connect();
        await measure('large reload sync', async () => { await field('enabled').check(); await status('synchronized'); await field('enabled').uncheck(); });
        check('large unchanged checkpoint resume and reload submit zero inherited documents', report.measurements.filter(x => x.phase !== 'large initial sync').every(x => x.upsertDocuments === 0));
        check('large resumed path shares story but has a separate writable branch', parent.collection === resumed.collection && parent.branch !== resumed.branch);
        check('large direct lifecycle uses no host proxy or automation errors', report.proxyRequests === 0 && report.pageErrors.length === 0);
    } else {
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(); c.chat.splice(0, c.chat.length, ...Array.from({ length: 6 }, (_, i) => ({ mes: i === 0 ? 'The blue compass is beneath the cedar tree.' : `Synthetic turn ${i}: tell me about the blue compass.`, name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: 0, extra: {} })));
        await c.saveChat();
    });
    if (versioned) { await panel(); await field('versioned').click(); await status('Versioned story memory is ready'); }
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
    check('native branch gets isolated memory and complete source', (versioned ? branch.collection === parent.collection && branch.branch !== parent.branch : branch.collection !== parent.collection) && (await inspect(branch)).length === 4);
    if (versioned) check('unchanged native fork performs zero document upserts', !report.upserts.some(r => r.stage === 'branch'));
    stage = 'branch edit';
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
    check('reload reconnects renamed parent without another collection', (await identity()).collection === parent.collection && pending.length === (versioned ? 3 : 4));
    if (versioned) check('reload performs zero unchanged document upserts', !report.upserts.some(r => r.stage === 'reload'));
    if (versioned) {
        stage = 'earlier branch';
        await page.evaluate(async () => { const c = SillyTavern.getContext(), { createBranch } = await import('/scripts/bookmarks.js'); const file = await createBranch(3); await c.openCharacterChat(file); });
        await status('synchronized'); const earlier = await identity(), rows = await inspect(earlier);
        check('earlier native fork removes future and protected-recent remote chunks', earlier.collection === parent.collection && rows.length === 2 && rows.every(d => d.message < 2));
        check('earlier native fork submits no unchanged inherited documents', !report.upserts.some(r => r.stage === 'earlier branch'));
        await panel(); await field('delete-chat').click(); await status('no longer accessible');
        check('current branch deletion preserves sibling and parent', await absent(earlier) && (await inspect(parent)).length === 4 && (await inspect(branch)).length === 4);
    }
    if (checkpoints) {
        stage = 'checkpoint';
        await page.evaluate(async name => {
            await SillyTavern.getContext().openCharacterChat(name); const c = SillyTavern.getContext();
            c.chat[0].swipe_id = 0; c.chat[0].swipes = [c.chat[0].mes, 'Unselected synthetic alternative'];
            c.chat[0].swipe_info = [{ extra: {} }, { extra: { checkpointTest: 'retained' } }];
            c.chatMetadata.variables = { checkpointTest: 'before' }; await c.saveChat();
        }, renamed.file);
        const files = () => page.evaluate(async () => {
            const c = SillyTavern.getContext(); const r = await fetch('/api/characters/chats', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, metadata: true }) });
            return r.json();
        });
        const readChat = name => page.evaluate(async name => {
            const c = SillyTavern.getContext(); const r = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, file_name: name }) }); return r.json();
        }, name);
        const reopen = async name => {
            await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
            check('recovery reload clears key and disables memory', await field('key').inputValue() === '' && !await field('enabled').isChecked());
            await page.locator('#rightNavHolder .drawer-toggle').click();
            await page.locator('.character_select').filter({ hasText: 'Collection Lifecycle' }).click();
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), name); await connect();
        };
        const checkpointRow = name => field('checkpoint-list').locator('.sm-checkpoint').filter({ has: page.locator('strong', { hasText: name }) });
        const refreshList = async () => { await field('checkpoint-refresh').click(); await page.waitForFunction(() => !document.querySelector('[data-sm="checkpoint-refresh"]').disabled); };
        if (manager) await field('checkpoint-name').fill('Before the harbor');
        loseBranch = recovery;
        await panel(); await field('checkpoint-save').click();
        await status(recovery ? 'Memory request failed' : 'Checkpoint saved:');
        const checkpointFile = (await files()).find(x => x.chat_metadata?.sillymemory?.checkpoint)?.file_name.replace(/\.jsonl$/, '');
        check('checkpoint creation leaves source chat active and submits no inherited documents', (await identity()).file === renamed.file && !report.upserts.some(r => r.stage === 'checkpoint'));
        if (recovery) {
            check('accepted branch with lost response leaves durable pending checkpoint', (await readChat(checkpointFile))[0].chat_metadata.sillymemory.checkpoint.state === 'pending');
            await reopen(checkpointFile); blockReady = true;
            await field('checkpoint-save').click(); await status('Checkpoint chat save failed'); blockReady = false;
            check('rejected ready save preserves pending transcript', (await readChat(checkpointFile))[0].chat_metadata.sillymemory.checkpoint.state === 'pending');
            if (manager) {
                await reopen(renamed.file); await refreshList();
                check('manager finds named pending checkpoint after reload without selecting it', (await checkpointRow('Before the harbor').innerText()).includes('Pending'));
                await checkpointRow('Before the harbor').getByRole('button', { name: 'Finish / retry', exact: true }).click();
            } else { await reopen(checkpointFile); await field('checkpoint-save').click(); }
            await status('Checkpoint verified and ready');
            check('reload finishes the same checkpoint without re-embedding', (await readChat(checkpointFile))[0].chat_metadata.sillymemory.checkpoint.state === 'ready' && !report.upserts.some(r => r.stage === 'checkpoint'));
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), renamed.file);
            if (manager) await field('checkpoint-name').fill('Interrupted edit checkpoint');
            loseBranch = true; await field('checkpoint-save').click(); await status('Memory request failed');
            const editFile = (await files()).find(x => x.chat_metadata?.sillymemory?.checkpoint?.state === 'pending').file_name.replace(/\.jsonl$/, '');
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), editFile);
            let reached, release; const reachedPromise = new Promise(r => { reached = r; }), releasePromise = new Promise(r => { release = r; });
            holdDocs = async () => { reached(); await releasePromise; };
            await field('checkpoint-save').click(); await reachedPromise;
            try { await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'Concurrent user edit must survive'; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_EDITED, 0); }); }
            finally { release(); }
            await status('Chat changed during checkpoint preparation');
            const edited = await readChat(editFile);
            check('edit during remote preparation survives without ready overwrite', edited[1].mes === 'Concurrent user edit must survive' && edited[0].chat_metadata.sillymemory.checkpoint.state === 'pending');
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), renamed.file);
        }
        if (manager) {
            await refreshList();
            await checkpointRow('Before the harbor').getByRole('button', { name: 'Rename', exact: true }).click();
            await status('Checkpoint name saved');
            await checkpointRow('Observatory checkpoint').waitFor();
            check('manager rename changes presentation only and leaves the current path selected', (await identity()).file === renamed.file && (await readChat(checkpointFile))[0].chat_metadata.sillymemory.checkpoint.name === 'Observatory checkpoint');
            await field('checkpoint-list').screenshot({ path: path.join(artifacts, 'checkpoint-manager.png') });
        }
        stage = 'parent after checkpoint';
        await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'The compass moved to a future harbor.'; c.chatMetadata.variables.checkpointTest = 'after'; await c.saveChat(); });
        await field('enabled').check(); await status('synchronized');
        await field('enabled').uncheck();
        await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), checkpointFile);
        const checkpoint = await identity();
        await field('enabled').check(); await status('This is a saved checkpoint'); await field('enabled').uncheck();
        check('opening a checkpoint refuses ordinary memory writes', (await inspect(checkpoint)).some(d => d.text.includes('cedar tree')));
        stage = 'checkpoint resume';
        loseResume = recovery;
        await field('checkpoint-resume').click();
        if (recovery) {
            await status('Could not read the saved checkpoint');
            const savedResume = blockedResume; blockedResume = undefined;
            const countBefore = (await files()).filter(x => x.file_name.startsWith('SillyMemory resume')).length;
            await reopen(checkpointFile); await field('checkpoint-resume').click(); await status('Checkpoint resumed as');
            check('resume response loss and reload reuse one saved path', (await identity()).file === savedResume && (await files()).filter(x => x.file_name.startsWith('SillyMemory resume')).length === countBefore);
        } else await status('Checkpoint resumed as');
        const resumed = await identity();
        const restored = await page.evaluate(() => { const c = SillyTavern.getContext(); return c.chat[0].mes.includes('cedar tree') && c.chat[0].swipes[1] === 'Unselected synthetic alternative' && c.chat[0].swipe_info[1].extra.checkpointTest === 'retained' && c.chatMetadata.variables.checkpointTest === 'before'; });
        check('resume restores old text, hidden swipes and chat variables in a new chat', restored && resumed.file !== checkpointFile && resumed.collection === parent.collection && resumed.branch !== checkpoint.branch);
        await field('enabled').check(); await status('synchronized');
        check('resumed memory inherits without unchanged upserts', !report.upserts.some(r => r.stage === 'checkpoint resume'));
        stage = 'resumed edit';
        await page.evaluate(async () => { const c = SillyTavern.getContext(); c.chat[0].mes = 'The compass belongs to the resumed path.'; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_UPDATED, 0); });
        await status('synchronized');
        check('resumed edits preserve checkpoint and later original path', (await inspect(checkpoint)).some(d => d.text.includes('cedar tree')) && (await inspect(parent)).some(d => d.text.includes('future harbor')) && (await inspect(resumed)).some(d => d.text.includes('resumed path')));
        await field('enabled').uncheck();
        if (manager) await refreshList();
        else await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), checkpointFile);
        stage = 'second resume';
        if (manager) await checkpointRow('Observatory checkpoint').getByRole('button', { name: 'Resume', exact: true }).click();
        else await field('checkpoint-resume').click(); await status('Checkpoint resumed as');
        const second = await identity(); await field('enabled').check(); await status('synchronized');
        check('second resume forks the same frozen checkpoint independently', second.branch !== resumed.branch && (await inspect(second)).some(d => d.text.includes('cedar tree')) && !report.upserts.some(r => r.stage === 'second resume'));
        await field('enabled').uncheck();
        await page.evaluate(async name => { await SillyTavern.getContext().openCharacterChat(name); const c = SillyTavern.getContext(); c.chat[0].swipes[1] = 'Changed hidden swipe'; await c.saveChat(); }, checkpointFile);
        await field('checkpoint-resume').click(); await status('Checkpoint transcript or metadata changed');
        check('modified checkpoint transcript is rejected before opening another path', (await identity()).file === checkpointFile);
        if (manager) {
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), renamed.file);
            await refreshList();
            check('manager marks changed transcript and offers no resume', (await checkpointRow('Observatory checkpoint').innerText()).includes('Transcript modified') && await checkpointRow('Observatory checkpoint').getByRole('button', { name: 'Resume', exact: true }).count() === 0);
            await checkpointRow('Observatory checkpoint').getByRole('button', { name: 'Delete checkpoint', exact: true }).click();
            await status('Checkpoint transcript and memory branch deleted');
            check('manager deletes one checkpoint while retaining resumed paths and source', !(await readChat(checkpointFile)).length && await absent(checkpoint) && (await inspect(second)).length > 0 && (await inspect(parent)).length > 0);
            // Create another snapshot of already committed history, then remove only its remote branch.
            await field('checkpoint-name').fill('Missing remote example');
            await field('checkpoint-save').click(); await status('Checkpoint saved:');
            const missingFile = (await files()).find(x => x.chat_metadata?.sillymemory?.checkpoint?.name === 'Missing remote example').file_name.replace(/\.jsonl$/, '');
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), missingFile);
            await field('delete-chat').click(); await status('no longer accessible');
            await page.evaluate(async name => SillyTavern.getContext().openCharacterChat(name), renamed.file);
            await refreshList();
            check('manager reports missing branch without allowing resume', (await checkpointRow('Missing remote example').innerText()).includes('Remote memory missing') && await checkpointRow('Missing remote example').getByRole('button', { name: 'Resume', exact: true }).count() === 0);
            await checkpointRow('Missing remote example').getByRole('button', { name: 'Delete checkpoint', exact: true }).click(); await status('Checkpoint transcript and memory branch deleted');
            check('manager removes local checkpoint after already completed remote deletion', !(await readChat(missingFile)).length);
        }
    }
    stage = 'discovery cleanup';
    // Lose only the local registry: remote ownership discovery must still find both.
    await page.evaluate(() => { const c = SillyTavern.getContext(), key = `sillymemory:state:${c.extensionSettings.sillymemory.owner}`; const s = JSON.parse(localStorage.getItem(key)); s.chatCollections = []; localStorage.setItem(key, JSON.stringify(s)); });
    await page.reload(); await connect(); await panel(); await field('delete').click(); await status('no longer accessible');
    check('all-owned cleanup discovers collections after local registry loss', await absent(parent) && await absent(branch) && await absent(copy));
    check('credentials absent from persistent profile', !(await readFile(profilePath, 'utf8')).includes(credentials.key));
    check('direct lifecycle uses no host proxy or browser automation errors', report.proxyRequests === 0 && report.pageErrors.length === 0);
    }
    report.passed = true;
} catch (error) { report.lastStatus = await page?.locator('[data-sm="status"]').textContent().catch(() => 'unavailable'); report.failure = { stage, type: error.name, message: error.message.replaceAll(credentials.key, '[redacted]').slice(0, 600), ...(error.name === 'AssertionError' ? { check: error.message } : {}) }; console.log(`FAIL ${stage}: ${error.name}`); }
finally {
    stage = 'final cleanup';
    if (page && !page.isClosed()) {
        try {
            if (pending.length) {
                await connect(); await panel();
                await page.locator('[data-sm="delete"]').click();
                await page.waitForFunction(() => document.querySelector('[data-sm="status"]')?.textContent.includes('no longer accessible'), null, { timeout: 180000 });
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
