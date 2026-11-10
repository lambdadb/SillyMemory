import { answerMemoryPopup, memoryControl, expandMemorySettings, openChatMemory } from './settings-panel.mjs';
// Private memory on the real SillyTavern UI path: live LambdaDB, a local
// Ollama embedding endpoint and a deterministic loopback model fixture. Checks
// the switch lock, Ollama pull hints, asymmetric mode switching, create, sync,
// edit, delete, search, mismatch recovery and rebuild, and that no
// request body to LambdaDB carries a text field or raw chat text. Synthetic data only.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.length > 2) throw new Error('Usage: node scripts/private-memory-live.mjs');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
if (!Object.values(credentials).every(Boolean)) throw new Error('LambdaDB configuration is incomplete.');
const ollama = process.env.SM_OLLAMA_URL || 'http://localhost:11434/v1';
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) throw new Error('Unexpected host revision.');
if (await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')) !== root) throw new Error('Host extension symlink must point to this checkout.');
const artifacts = path.resolve(process.env.SM_ARTIFACT_DIR || path.join(root, 'artifacts', 'private-memory-live'));
await mkdir(artifacts, { recursive: true });
const reportPath = path.join(artifacts, 'private-memory-live.json'), pendingPath = path.join(artifacts, 'private-memory-live-pending.json');
const pending = { collections: [], connectionHash: createHash('sha256').update(JSON.stringify([credentials.endpoint, credentials.project])).digest('hex') };
await writeFile(pendingPath, JSON.stringify(pending), { flag: 'wx' });
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-private-memory-'));
const checks = [], generations = [], remote = [], embeddings = [], screenshots = [];
let stage = 'startup', server, browser, page, failure, cleanupComplete = false, audited = false;
const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); console.log(`PASS ${name}`); };

// Distinctive synthetic phrases; none of them may reach LambdaDB in private mode.
const FACT = 'Remember this fact: Mira hid the silver key under the red bridge.';
const EDITED = 'Remember this fact: Mira hid the silver key inside the clock tower.';
const QUESTION = 'Where is the silver key? Answer with the location, or UNKNOWN if no fact is available.';
const PHRASES = ['silver key', 'red bridge', 'clock tower', 'FILLER_', 'folded paper cranes', 'RECENT_KEEP', 'Where is the silver key'];
const bridge = createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'fixture', object: 'model' }] })); return; }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString()), text = JSON.stringify(body.messages);
    generations.push({ stage, messages: body.messages });
    // Deterministic; this checks memory delivery, not model quality.
    const answer = text.includes('inside the clock tower') ? 'The silver key is inside the clock tower.' : text.includes('under the red bridge') ? 'The silver key is under the red bridge.' : 'UNKNOWN';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }] }));
});
await new Promise(r => bridge.listen(0, '127.0.0.1', r));
const port = Number(process.env.ST_PRIVATE_MEMORY_PORT || 18129), url = `http://127.0.0.1:${port}`;
const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
const chatButton = name => page.locator(`#sillymemory-chat [data-sm-chat="${name}"]`);
const waitStatus = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 180000 });
async function openSettings() {
    await expandMemorySettings(page);
    await page.evaluate(() => { document.querySelector('#sillymemory details[data-sm="private-memory"]').open = true; });
}
async function shot(name) {
    const file = `${String(screenshots.length + 1).padStart(2, '0')}-${name}.png`;
    // The connected summary names the project and endpoint host; mask it.
    await page.screenshot({ path: path.join(artifacts, file), fullPage: false, mask: [page.locator('[data-sm="connected-summary"]')] });
    screenshots.push(file);
}
async function seed(fact = FACT) {
    await page.evaluate(async fact => {
        const c = SillyTavern.getContext();
        const messages = Array.from({ length: 14 }, (_, i) => ({ name: i % 2 ? 'User' : 'Mira', is_user: Boolean(i % 2), is_system: false, send_date: Date.now(), extra: {},
            mes: i === 0 ? fact : i === 13 ? 'RECENT_KEEP_B: We are ready for the next question.' : i === 12 ? 'RECENT_KEEP_A: We walked back to the square.' : `FILLER_${i}: ${'We folded paper cranes and stacked them in rows. '.repeat(6)}` }));
        c.chat.splice(0, c.chat.length, ...messages); await c.saveChat(); await c.reloadCurrentChat();
    }, fact);
}
async function generate(name, type = 'normal') {
    stage = name; const start = generations.length;
    await page.evaluate(async ({ type, question }) => {
        if (type === 'normal') document.querySelector('#send_textarea').value = question;
        await SillyTavern.getContext().generate(type);
    }, { type, question: QUESTION });
    if (generations.length !== start + 1) throw new Error('Expected exactly one model request');
    const prompt = JSON.stringify(generations.at(-1).messages);
    const last = await page.evaluate(() => SillyTavern.getContext().chat.at(-1)?.mes);
    return { prompt, last };
}
const remoteSince = start => remote.slice(start);
const storyCollections = () => [...new Set(remote.filter(r => r.collection?.startsWith('smstory_')).map(r => r.collection))];
try {
    const configPath = path.join(work, 'config.yaml'); await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'false'], { cwd: source, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw new Error('Host exited'); try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
    if (!ready) throw new Error('Host startup timeout');
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(30000);
    const lambdaOrigin = new URL(credentials.endpoint).origin, embeddingOrigin = new URL(ollama).origin;
    await page.route(`${lambdaOrigin}/**`, async route => {
        const req = route.request(), target = new URL(req.url());
        if (req.method() === 'POST' && target.pathname.endsWith('/collections')) {
            const body = req.postDataJSON(); pending.collections.push({ name: body.collectionName, owner: body.tags.owner });
            await writeFile(pendingPath, JSON.stringify(pending, null, 2));
        }
        await route.continue();
    });
    page.on('request', request => {
        const target = new URL(request.url());
        if (request.method() === 'OPTIONS') return;
        let entry;
        if (target.origin === lambdaOrigin) {
            const parts = target.pathname.split('/');
            entry = { stage, method: request.method(), collection: parts[4], resource: parts.slice(5).join('/') || (parts[4] ? 'collection' : 'collections'), body: request.postData() || '' };
            remote.push(entry);
        } else if (target.origin === embeddingOrigin) {
            const body = request.postDataJSON();
            entry = { stage, method: request.method(), path: target.pathname, model: body?.model, inputs: body?.input?.length };
            embeddings.push(entry);
        } else return;
        // allHeaders() includes cookies, unlike headers().
        entry.headersRead = request.allHeaders().then(h => { entry.headers = Object.keys(h).map(x => x.toLowerCase()); }, () => { entry.headers = ['unreadable']; });
    });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor(); await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    stage = 'configure model connection';
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.evaluate(async bridgeUrl => {
        const { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { custom_url: bridgeUrl, custom_model: 'fixture', openai_max_context: 8192, openai_max_tokens: 100, temp_openai: 0, stream_openai: false });
        const { saveSettings } = await import('/script.js'); await saveSettings();
        const c = SillyTavern.getContext(), data = new FormData();
        data.set('ch_name', 'SillyMemory Private Mira'); data.set('description', 'A synthetic recall test character.'); data.set('first_mes', 'Ready for a synthetic test.');
        const r = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data }); if (!r.ok) throw new Error('Character creation failed');
    }, `http://127.0.0.1:${bridge.address().port}/v1`);
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'SillyMemory Private Mira' }).click();
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection', { timeout: 30000 });

    stage = 'LambdaDB setup'; await openSettings();
    await page.evaluate(({ endpoint, project, key }) => { for (const [name, value] of Object.entries({ endpoint, project, key })) document.querySelector(`[data-sm="${name}"]`).value = value; }, credentials);
    await field('connect').click(); await waitStatus('Chat memory is ready');
    assert(true, 'real settings completed the live LambdaDB connection and setup test');

    // C1: the switch is locked until Test endpoint succeeds. A standard story first,
    // to check that turning Private memory on pauses it.
    stage = 'standard story';
    assert(await field('privateMemory').isDisabled() && (await field('private-memory-lock').textContent()).includes('Test endpoint first') && await field('private-memory-lock').isVisible(),
        'Private memory is disabled with a reason before Test endpoint succeeds');
    await seed(); await memoryControl(page).check(); await waitStatus('synchronized');
    const standard = remote.filter(r => r.method === 'POST' && r.resource === 'collections' && r.stage === stage).map(r => JSON.parse(r.body)).find(b => b.collectionName.startsWith('smstory_'));
    assert(standard && standard.indexConfigs.text && standard.tags.memory_mode === undefined && !(await chatButton('label').textContent()).includes('Private'), 'a standard story is created and synchronized while Private memory is off');

    stage = 'private setup';
    await openSettings();
    const pull = async preset => { await field('embedding-preset').selectOption(preset); return await field('embedding-pull-line').isVisible() ? await field('embedding-pull').textContent() : ''; };
    assert(await pull('ollama-qwen3') === 'ollama pull qwen3-embedding:0.6b' && await pull('openai-small') === '' && await pull('ollama-gemma') === 'ollama pull embeddinggemma'
        && (await field('embedding-pull').evaluate(el => getComputedStyle(el).whiteSpace)) === 'nowrap', 'an Ollama preset shows its pull command on one line; other presets do not');
    assert(await field('embedding-url').inputValue() === 'http://localhost:11434/v1' && (await field('embedding-quality').textContent()).includes('Validated on English LongMemEval-S')
        && await field('embedding-local').isVisible() && await field('embedding-ollama').isVisible(), 'the gemma preset fills the local endpoint with its validation label and setup hints');
    if (ollama !== 'http://localhost:11434/v1') await field('embedding-url').fill(ollama);
    assert(await field('privateMemory').isDisabled(), 'choosing a preset without testing it keeps Private memory locked');
    await field('embedding-test').click();
    // The status can move on to the standard story's synchronization; the saved summary is stable.
    await page.waitForFunction(() => document.querySelector('[data-sm="embedding-summary"]')?.textContent.includes('768 dimensions'), null, { timeout: 180000 });
    assert(embeddings.length === 1 && embeddings[0].model === 'embeddinggemma' && embeddings[0].inputs === 2, 'Test endpoint sends one short request and records 768 dimensions');
    assert(await field('privateMemory').isEnabled() && await field('private-memory-lock').isHidden(), 'a successful Test endpoint unlocks Private memory');
    await field('embedding-preset').selectOption('custom');
    assert(await field('privateMemory').isEnabled(), 'a draft edit after a test keeps the saved, tested settings and the switch unlocked');
    await field('embedding-preset').selectOption('ollama-gemma');
    if (ollama !== 'http://localhost:11434/v1') await field('embedding-url').fill(ollama);
    await shot('endpoint-tested');

    // B: turning Private memory on pauses the standard story; C3: only Rebuild and Turn memory off.
    stage = 'turn on pauses standard'; const auditStart = remote.length;
    await field('privateMemory').check();
    await waitStatus('created without Private memory');
    const onlyRebuild = async () => await chatButton('rebuild').isVisible() && await chatButton('toggle').isVisible() && await chatButton('sync').isHidden() && await chatButton('retry').isHidden();
    await openChatMemory(page);
    assert(await onlyRebuild(), 'turning Private memory on pauses the standard story and shows only Rebuild story memory and Turn memory off');
    let failedPrompt = generations.length;
    await page.evaluate(async question => { document.querySelector('#send_textarea').value = question; await SillyTavern.getContext().generate('normal'); }, QUESTION);
    assert(generations.length === failedPrompt && await onlyRebuild(), 'generation stops on the paused standard story, and Retry reply stays hidden');
    await shot('standard-paused');
    await page.evaluate(async () => { const c = SillyTavern.getContext(); if (c.chat.at(-1)?.is_user) await c.deleteMessage(c.chat.length - 1); });

    stage = 'create and sync';
    await openChatMemory(page);
    await answerMemoryPopup(page, () => chatButton('rebuild').click());
    await waitStatus('synchronized');
    const created = remote.filter(r => r.method === 'POST' && r.resource === 'collections' && r.stage === stage).map(r => JSON.parse(r.body)).find(b => b.collectionName.startsWith('smstory_'));
    assert(created && remote.some(r => r.stage === stage && r.method === 'DELETE' && r.resource === 'collection') && !created.indexConfigs.text
        && JSON.stringify(created.indexConfigs.embedding) === JSON.stringify({ type: 'vector', dimensions: 768, similarity: 'cosine' })
        && created.tags.memory_mode === 'private' && /^[a-f0-9]{16}$/.test(created.tags.embedding) && Object.keys(created.tags).length === 5, 'Rebuild recreates the standard story as private: no text field, a 768-d cosine vector field and identity tags');
    const upserts = r => r.resource === 'docs/upsert';
    const firstUpload = remote.filter(r => r.stage === stage && upserts(r)).flatMap(r => JSON.parse(r.body).docs);
    assert(firstUpload.length > 0 && firstUpload.every(d => !('text' in d) && d.embedding?.length === 768 && d.embedding.every(x => Math.round(x * 1e4) / 1e4 === x)), 'uploads carry 4-decimal 768-d vectors and no text field');
    assert(embeddings.filter(e => e.stage === stage).length > 0, 'chunks were embedded by the local endpoint before upload');
    await openChatMemory(page);
    assert((await chatButton('label').textContent()) === 'Memory · Ready · Private', 'the Memory panel shows Memory · Ready · Private');
    await shot('synchronized');

    stage = 'search';
    const on = await generate('search');
    assert(on.prompt.includes('Past conversation excerpt') && on.prompt.includes('under the red bridge') && on.prompt.includes('RECENT_KEEP_A'), 'generation restores the recalled passage from local text and keeps recent messages');
    const queries = remote.filter(r => r.stage === 'search' && r.resource === 'query').map(r => JSON.parse(r.body));
    assert(queries.length === 1 && queries[0].query.knn?.queryVector?.length === 768 && queries[0].query.knn.k === 200 && queries[0].size === 50 && !queries[0].rerank && !queries[0].query.bayesian
        && /^owner:[a-f0-9]+ AND scope:[a-f0-9]+ AND message:\[0 TO \d+\]$/.test(queries[0].query.knn.filter.queryString.query), 'search is one dense knn queryVector request with the scope and boundary filter, without rerank');
    assert(on.last.includes('under the red bridge'), 'the fixture answer uses the restored memory');
    await openChatMemory(page); await shot('search');

    stage = 'edit';
    const editStart = remote.length;
    await page.evaluate(async text => { const c = SillyTavern.getContext(); c.chat[0].mes = text; await c.saveChat(); await c.eventSource.emit(c.eventTypes.MESSAGE_EDITED, 0); }, EDITED);
    await waitStatus('synchronized');
    const editRequests = remoteSince(editStart);
    assert(editRequests.some(r => r.resource === 'docs/delete') && editRequests.filter(upserts).flatMap(r => JSON.parse(r.body).docs).some(d => d.message === 0 && !('text' in d)), 'an edit deletes the stale document and uploads the new revision without text');
    await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(c.chat.length - 1); });
    await waitStatus('synchronized');
    const edited = await generate('after-edit', 'regenerate');
    assert(edited.prompt.includes('inside the clock tower') && !edited.prompt.includes('under the red bridge'), 'after an edit, search restores only the new local text');

    // A clean fixture: earlier fixture answers would otherwise repeat the fact in recent messages.
    stage = 'delete'; await seed(EDITED); await waitStatus('synchronized');
    const deleteStart = remote.length;
    await page.evaluate(async () => { await SillyTavern.getContext().deleteMessage(0); }); await waitStatus('synchronized');
    assert(remoteSince(deleteStart).some(r => r.resource === 'docs/delete'), 'deleting the source message deletes its remote document');
    const deleted = await generate('after-delete');
    assert(!deleted.prompt.includes('inside the clock tower') && !deleted.prompt.includes('under the red bridge'), 'a deleted source fact is no longer recalled');

    // B: turning Private memory off keeps the private story working in its own mode.
    stage = 'turn off keeps private';
    await seed(); await waitStatus('synchronized');
    await openSettings(); await field('privateMemory').uncheck();
    const kept = await generate('turn off keeps private');
    const keptQueries = remote.filter(r => r.stage === 'turn off keeps private' && r.resource === 'query').map(r => JSON.parse(r.body));
    assert(kept.prompt.includes('under the red bridge') && keptQueries.length === 1 && keptQueries[0].query.knn?.queryVector?.length === 768 && !keptQueries[0].rerank
        && !remote.some(r => r.stage === 'turn off keeps private' && r.method === 'POST' && r.resource === 'collections'), 'with Private memory off, the private story keeps syncing and searching by vector');
    await openChatMemory(page);
    assert((await chatButton('label').textContent()).endsWith(' · Private') && await chatButton('rebuild').isHidden(), 'the private story is not blocked and still shows Private');
    await shot('private-kept-off');

    // B: with Private memory off, a changed embedding identity still blocks the private story.
    stage = 'model change';
    await openSettings();
    await field('embedding-preset').selectOption('ollama-qwen3');
    if (ollama !== 'http://localhost:11434/v1') await field('embedding-url').fill(ollama);
    await field('embedding-test').click(); await waitStatus('different embedding model, prefixes or vector dimension');
    assert((await page.evaluate(() => JSON.parse(localStorage.getItem(`sillymemory:state:${SillyTavern.getContext().extensionSettings.sillymemory.owner}`)).embedding.dimensions)) === 1024, 'the qwen3 endpoint test records 1024 dimensions');
    await openChatMemory(page);
    assert(await onlyRebuild(), 'an embedding change blocks the private story with Private memory off and shows only Rebuild story memory and Turn memory off');
    failedPrompt = generations.length;
    await page.evaluate(async question => { document.querySelector('#send_textarea').value = question; await SillyTavern.getContext().generate('normal'); }, QUESTION);
    assert(generations.length === failedPrompt && await onlyRebuild(), 'generation stops explicitly while the story does not match, and Retry reply stays hidden');
    await shot('embedding-mismatch');
    await page.evaluate(async () => { const c = SillyTavern.getContext(); if (c.chat.at(-1)?.is_user) await c.deleteMessage(c.chat.length - 1); });
    // Rebuild follows the global mode; turn Private memory on so the rebuilt story stays private.
    await openSettings(); await field('privateMemory').check(); await waitStatus('different embedding model, prefixes or vector dimension');

    stage = 'rebuild';
    await openChatMemory(page);
    await answerMemoryPopup(page, () => chatButton('rebuild').click());
    await waitStatus('synchronized');
    const rebuilt = remote.filter(r => r.stage === stage && r.method === 'POST' && r.resource === 'collections').map(r => JSON.parse(r.body));
    assert(rebuilt.length === 1 && rebuilt[0].indexConfigs.embedding.dimensions === 1024 && !rebuilt[0].indexConfigs.text && rebuilt[0].tags.embedding !== created.tags.embedding
        && remote.some(r => r.stage === stage && r.method === 'DELETE' && r.resource === 'collection'), 'Rebuild deletes the story and recreates it with the qwen3 identity');
    const recalled = await generate('after-rebuild');
    assert(recalled.prompt.includes('under the red bridge'), 'search works on the rebuilt story');
    assert((await chatButton('label').textContent()).endsWith(' · Private'), 'the rebuilt story shows Private');
    await openChatMemory(page); await shot('rebuilt');

    stage = 'audit';
    const audit = remote.slice(auditStart);
    assert(audit.length > 0 && audit.every(r => !r.collection?.startsWith('smtest_')), 'the audited window has only story requests');
    const leaks = audit.filter(r => PHRASES.some(p => r.body.includes(p)));
    const textFields = audit.filter(r => { try { const b = r.body ? JSON.parse(r.body) : {}; return (b.docs || []).some(d => 'text' in d) || 'queryText' in (b.query?.knn || {}) || b.rerank || b.indexConfigs?.text; } catch { return true; } });
    assert(leaks.length === 0 && textFields.length === 0, `no LambdaDB request body after enabling Private memory carries raw chat text or a text field (${audit.length} requests)`);
    await Promise.all([...remote, ...embeddings].map(r => r.headersRead));
    assert([...remote, ...embeddings].every(r => r.headers && !r.headers.some(h => ['cookie', 'x-csrf-token', 'unreadable'].includes(h))), 'no LambdaDB or embedding request carries host cookies or CSRF headers');
    assert(embeddings.every(e => !e.headers.includes('authorization')), 'the keyless local endpoint receives no Authorization header');
    audited = true;
} catch (e) {
    failure = { stage, reason: e instanceof Error && !e.name.includes('Timeout') && !String(e.message).includes('\n') ? e.message : 'Host/browser step did not complete' };
    console.log(`FAIL ${stage}: ${failure.reason}`);
    try { if (page) await shot('failure'); } catch {}
} finally {
    stage = 'cleanup';
    const deletion = [];
    if (pending.collections.length === 0) { cleanupComplete = true; await rm(pendingPath, { force: true }); }
    else if (page && !page.isClosed()) {
        try {
            await openSettings();
            if (await field('delete').isVisible()) { await answerMemoryPopup(page, () => field('delete').click()); await waitStatus('memory was deleted'); }
            // Confirm every created collection, including the setup test, answers 404.
            const statuses = await page.evaluate(async ({ credentials, collections }) => {
                const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
                const client = new LambdaClient(credentials, credentials.key), result = [];
                try {
                    for (const item of collections) {
                        await client.deleteOwnedCollection(item.name, item.owner);
                        try { await client.get(item.name); result.push(200); } catch (e) { result.push(e.status); }
                    }
                } finally { client.forget(); }
                return result;
            }, { credentials, collections: pending.collections });
            deletion.push(...pending.collections.map((c, i) => ({ collection: c.name.slice(0, 8), status: statuses[i] })));
            cleanupComplete = statuses.length === pending.collections.length && statuses.every(s => s === 404);
            if (cleanupComplete) { await rm(pendingPath, { force: true }); console.log(`PASS every created collection (${statuses.length}) answers HTTP 404 after cleanup`); }
            else console.log('Cleanup incomplete; keep pending resource record.');
        } catch { console.log('Cleanup incomplete; keep pending resource record.'); }
    }
    const sourceSha256 = {};
    for (const file of ['index.js', 'settings.html', 'src/embedding.js', 'src/credentials.js', 'src/client.js', 'src/chat-collections.js', 'src/memory.js', 'src/status.js', 'vendor/lambdadb.js', 'scripts/private-memory-live.mjs']) sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    // Request bodies are summarized, never stored: they hold vectors and synthetic names.
    const report = { time: new Date().toISOString(), sillyTavern: revision, lambdaDB: 'live', embedding: 'local Ollama', generator: 'deterministic test fixture, not a real LLM', checks, failure, audited,
        remoteRequests: remote.map(({ stage, method, resource, body }) => ({ stage, method, resource, bytes: body.length })),
        embeddingRequests: embeddings.map(({ stage, model, inputs }) => ({ stage, model, inputs })), deletion, cleanupComplete, screenshots, sourceSha256, passed: !failure && cleanupComplete };
    let output = JSON.stringify(report, null, 2);
    for (const value of [credentials.key, credentials.endpoint, credentials.project, new URL(credentials.endpoint).host].filter(Boolean)) output = output.replaceAll(value, '[REDACTED]');
    await writeFile(reportPath, output);
    await browser?.close(); if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    await new Promise(r => bridge.close(r)); await rm(work, { recursive: true, force: true });
}
process.exitCode = failure || !cleanupComplete ? 1 : 0;
