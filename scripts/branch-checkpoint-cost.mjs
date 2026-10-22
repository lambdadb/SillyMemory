import { memoryControl } from './settings-panel.mjs';
// Real pinned host, native local embeddings, and live managed LambdaDB.
// No generation calls. Run only with a disposable host checkout and data directory.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir, cpus, platform, arch } from 'node:os';
import path from 'node:path';
import { assertPinnedHost, assertPortAvailable, waitForOwnedHost, cleanupOwnedCollections, instrumentEmbedding, replaceHostEmbedding } from './branch-checkpoint-cost-support.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const source = process.env.ST_SOURCE;
const output = process.argv[2];
assert(source && output && process.argv.length === 3, 'ST_SOURCE=<disposable host> SM_ENV_FILE=<env> node scripts/branch-checkpoint-cost.mjs <new artifact directory>');
const planBytes = await readFile(path.join(root, 'docs/benchmarks/branch-checkpoint-v2.json'));
const plan = JSON.parse(planBytes);
assertPinnedHost(source, plan.hostRevision);
assert.equal(await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), root);
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
assert(Object.values(credentials).every(Boolean), 'Missing LambdaDB credentials');
const port = Number(process.env.ST_TEST_PORT || 18188);
await assertPortAvailable(port); // Fail before instrumenting a host or creating native data.
const artifacts = path.resolve(output);
await mkdir(artifacts, { recursive: true });
await writeFile(path.join(artifacts, 'plan.json'), planBytes, { flag: 'wx' });
let work, hostInstrumented = false;
const metricPath = path.join(artifacts, 'local-embedding.ndjson');
await writeFile(metricPath, '', { flag: 'wx' });
const pendingPath = path.join(artifacts, 'pending.json'), pending = [];
await writeFile(pendingPath, '[]', { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
    startedAt: new Date().toISOString(), productCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    hostRevision: plan.hostRevision, planSha256: hash(planBytes), node: process.version,
    machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
    rows: [], traffic: [], checks: [], pageErrors: [], sourceSha256: {}, inputs: [],
    managedDocuments: 0, managedCharacters: 0, ownedCollections: pending, passed: false, cleanup: false,
};
for (const file of ['index.js', 'settings.html', 'src/client.js', 'src/memory.js', 'src/chunking.js', 'src/chat-collections.js', 'src/checkpoints.js', 'src/commit.js', 'src/gate.js', 'vendor/lambdadb.js', 'scripts/branch-checkpoint-cost.mjs', 'scripts/branch-checkpoint-cost-support.mjs']) {
    report.sourceSha256[file] = hash(await readFile(path.join(root, file)));
}
const save = async () => {
    const bytes = JSON.stringify(report, null, 2) + '\n';
    assert(!bytes.includes(credentials.key));
    await writeFile(path.join(artifacts, 'report.json'), bytes);
};
const check = (name, ok) => { assert(ok, name); report.checks.push(name); };
const embeddingPath = path.join(source, 'src/vectors/embedding.js');
const originalEmbedding = await readFile(embeddingPath, 'utf8');
const instrumented = instrumentEmbedding(originalEmbedding, plan.limits.nativeEmbeddingInputs);
await writeFile(path.join(artifacts, 'host-embedding-original.js'), originalEmbedding);
await writeFile(path.join(artifacts, 'host-embedding-instrumented.js'), instrumented);
report.hostInstrumentation = 'Time/CPU counters around actual local model execution, one NDJSON append per input. Model loading excluded from this counter and timed separately. No model outputs or input text logged.';
const url = `http://127.0.0.1:${port}`;
let server, browser, page, stage = 'setup', timeout, timedOut = false;
const metrics = async () => (await readFile(metricPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const field = name => name === 'enabled' ? memoryControl(page) : page.locator(`#sillymemory [data-sm="${name}"]`);
const idle = () => page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm=connect]')?.disabled);
const status = text => page.waitForFunction(text => {
    const value = document.querySelector('#sillymemory [data-sm=status]')?.textContent || '';
    if (/failed|Invalid request|HTTP 4|HTTP 5|Timed out/i.test(value)) throw new Error(value);
    return value.includes(text);
}, text, { timeout: 180000 });
async function panel() {
    if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    // Optional sections are collapsed by the settings UX; older revisions have none.
    for (const name of ['advanced', 'checkpoints']) {
        const section = page.locator(`#sillymemory details[data-sm="${name}"]`);
        if (await section.count() && await section.getAttribute('open') === null) {
            await section.locator(':scope > summary').click();
        }
    }
}
async function nativeEnabled(value) {
    await page.evaluate(value => jQuery('#vectors_enabled_chats').prop('checked', value).trigger('input'), value);
}
async function memoryOff() { if (await field('enabled').isChecked()) { await field('enabled').uncheck(); await idle(); } }
const open = name => page.evaluate(name => SillyTavern.getContext().openCharacterChat(name), name);
async function indexNative() {
    // Use the actual existing handler; it repeatedly synchronizes until complete.
    await page.evaluate(async () => { await jQuery('#vectors_vectorize_all').triggerHandler('click'); });
    const stats = await page.evaluate(async () => {
        const c = SillyTavern.getContext(), { getStringHash } = await import('/scripts/utils.js');
        const r = await fetch('/api/vector/list', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ source: 'transformers', collectionId: c.getCurrentChatId() }) });
        if (!r.ok) throw new Error('Native index read failed');
        return { actual: await r.json(), expected: c.chat.map(m => getStringHash(m.mes)) };
    });
    assert.deepEqual([...new Set(stats.actual)].sort(), [...new Set(stats.expected)].sort(), 'Complete native transcript index');
    return stats.expected.length;
}
async function indexMemory() {
    const start = performance.now();
    await panel(); await field('enabled').check(); await status('synchronized'); await memoryOff();
    const uiSynchronizationMilliseconds = performance.now() - start;
    return { uiSynchronizationMilliseconds, ...await verifyMemory() };
}
async function verifyMemory(full = false) {
    return page.evaluate(async ({ credentials, full }) => {
        const c = SillyTavern.getContext();
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { capture, documents, options, archiveBoundary } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { chatCollection } = await import('/scripts/extensions/third-party/sillymemory/src/chat-collections.js');
        const snapshot = capture(c), owner = c.extensionSettings.sillymemory.owner;
        const entry = await chatCollection(snapshot, owner), client = new LambdaClient(credentials, credentials.key);
        try {
            const expected = (await documents(snapshot, owner, { ...options({}), ...(!full ? { archiveBefore: archiveBoundary(snapshot) } : {}) })).docs;
            const expectedIds = new Set(expected.map(d => d.id));
            const start = performance.now(); let polls = 0, first;
            // List every committed document, including unwanted inherited suffixes.
            // Fetching only expected IDs cannot prove deletion or exact isolation.
            while (true) {
                const found = await client.listDocs(entry.collection, entry.branch);
                const byId = new Map(found.map(d => [d.id, d]));
                const unexpected = found.filter(d => !expectedIds.has(d.id)).length;
                const mismatch = expected.filter(d => !byId.has(d.id) || !Object.keys(d).every(k => d[k] === byId.get(d.id)[k])).length;
                polls++;
                first ??= { documents: found.length, unexpected, missingOrChanged: mismatch };
                if (found.length === expected.length && byId.size === found.length && !unexpected && !mismatch) {
                    return { indexedDocuments: expected.length, transcriptMessages: snapshot.messages.length,
                        committedVerification: { milliseconds: performance.now() - start, polls, first, exact: true } };
                }
                if (performance.now() - start >= 180000) throw new Error('Exact committed memory set did not become ready within 180 seconds');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } finally { client.forget(); }
    }, { credentials, full });
}
async function measure(arm, messages, repetition, operation, job) {
    stage = `${arm}/${messages}/${repetition}/${operation}`;
    const beforeTraffic = report.traffic.length, beforeMetric = (await metrics()).length, start = performance.now();
    const value = await job();
    const elapsed = performance.now() - start, calls = report.traffic.slice(beforeTraffic), embeds = (await metrics()).slice(beforeMetric);
    report.rows.push({
        arm, messages, repetition, operation, milliseconds: elapsed,
        requests: calls.length, managedUpsertDocuments: calls.reduce((n, x) => n + (x.managedDocuments || 0), 0),
        managedUpsertCharacters: calls.reduce((n, x) => n + (x.managedCharacters || 0), 0),
        nativeInsertItems: calls.reduce((n, x) => n + (x.nativeItems || 0), 0),
        localEmbeddingInputs: embeds.length, localEmbeddingMilliseconds: embeds.reduce((n, x) => n + x.milliseconds, 0),
        localEmbeddingCpuMilliseconds: embeds.reduce((n, x) => n + (x.cpu.user + x.cpu.system) / 1000, 0),
        ...value,
    });
    assert((await metrics()).length <= plan.limits.nativeEmbeddingInputs, 'Local embedding bound');
    await save(); console.log(`DONE ${stage}: ${(elapsed / 1000).toFixed(3)}s`);
    stage = 'verification';
}
function messagesFor(count) {
    return Array.from({ length: count }, (_, i) => ({
        mes: `Expedition entry ${String(i).padStart(4, '0')}: Mira stored parcel ${i} in locker ${i + 1000} at the cedar observatory. The brass compass points north. This record belongs to route ${i % 17} and must remain separate from later route changes.`,
        name: i % 2 ? 'Mira' : 'User', is_user: !(i % 2), is_system: false, send_date: 0, extra: {},
    }));
}
async function seed(rows, name) {
    await memoryOff(); await nativeEnabled(false);
    await page.evaluate(async ({ rows, name }) => {
        const c = SillyTavern.getContext();
        const response = await fetch('/api/chats/save', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({
            avatar_url: c.characters[c.characterId].avatar, ch_name: c.characters[c.characterId].name, file_name: name, force: false,
            chat: [{ user_name: 'User', character_name: 'Mira', chat_metadata: { integrity: crypto.randomUUID() } }, ...rows],
        }) });
        if (!response.ok) throw new Error('Synthetic transcript save failed');
        await c.openCharacterChat(name);
    }, { rows, name });
}
async function branch(index) {
    return page.evaluate(async index => {
        const { branchChat } = await import('/scripts/bookmarks.js');
        return branchChat(index);
    }, index);
}
async function runArm(arm, count, rep) {
    const rows = messagesFor(count), parent = `${arm}-${count}-${rep}`;
    await seed(rows, parent);
    const sync = arm === 'native' ? indexNative : indexMemory;
    await nativeEnabled(arm === 'native');
    await measure(arm, count, rep, 'initial', sync);
    for (const [operation, index] of [['branch-end', count - 1], ['branch-middle', Math.floor(count / 2) - 1]]) {
        await nativeEnabled(false); await open(parent);
        await measure(arm, count, rep, operation, async () => {
            const start = performance.now(); await branch(index);
            const chatMilliseconds = performance.now() - start;
            await nativeEnabled(arm === 'native');
            const synchronization = await sync();
            return { chatMilliseconds, ...(arm === 'sillymemory' ? synchronization : {}) };
        });
        check(`${arm}/${count}/${rep}/${operation} preserves source prefix`, await page.evaluate(rows => JSON.stringify(SillyTavern.getContext().chat.map(m => m.mes)) === JSON.stringify(rows.map(m => m.mes)), rows.slice(0, index + 1)));
    }
    await nativeEnabled(false); await open(parent);
    let checkpoint;
    await measure(arm, count, rep, 'checkpoint-save', async () => {
        if (arm === 'native') {
            checkpoint = await page.evaluate(async () => {
                const { createNewBookmark } = await import('/scripts/bookmarks.js');
                return createNewBookmark(SillyTavern.getContext().chat.length - 1, { forceName: `native-checkpoint-${crypto.randomUUID()}` });
            });
        } else {
            await panel(); await field('checkpoint-name').fill(`${count}-${rep}`);
            await field('checkpoint-save').click(); await status('Checkpoint saved:'); await idle();
            checkpoint = await page.evaluate(async () => {
                const c = SillyTavern.getContext();
                const r = await fetch('/api/characters/chats', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: c.characters[c.characterId].avatar, metadata: true }) });
                return (await r.json()).find(x => x.chat_metadata?.sillymemory?.checkpoint?.name === document.querySelector('[data-sm=checkpoint-name]').value)?.file_name.replace(/\.jsonl$/, '');
            });
        }
        assert(checkpoint, 'Checkpoint file confirmed');
    });
    await measure(arm, count, rep, 'checkpoint-open', async () => {
        await open(checkpoint);
        if (arm === 'native') { await nativeEnabled(true); await sync(); }
        else return verifyMemory(true);
    });
    for (let resume = 1; resume <= 2; resume++) {
        await nativeEnabled(false); await open(checkpoint);
        await measure(arm, count, rep, `resume-${resume}`, async () => {
            const start = performance.now();
            if (arm === 'native') await branch(count - 1);
            else { await panel(); await field('checkpoint-resume').click(); await status('Checkpoint resumed as'); await idle(); }
            const chatMilliseconds = performance.now() - start;
            await nativeEnabled(arm === 'native');
            const synchronization = await sync();
            return { chatMilliseconds, ...(arm === 'sillymemory' ? synchronization : {}) };
        });
        check(`${arm}/${count}/${rep}/resume-${resume} preserves transcript`, await page.evaluate(rows => JSON.stringify(SillyTavern.getContext().chat.map(m => m.mes)) === JSON.stringify(rows.map(m => m.mes)), rows));
    }
    await nativeEnabled(false); await memoryOff();
}
try {
    work = await mkdtemp(path.join(tmpdir(), 'sm-branch-cost-'));
    await replaceHostEmbedding(embeddingPath, instrumented);
    hostInstrumented = true;
    const config = path.join(work, 'config.yaml');
    const configBytes = await readFile(path.join(source, 'default/config.yaml'));
    await writeFile(config, configBytes);
    report.hostConfigSha256 = hash(configBytes);
    report.localModel = configBytes.toString().match(/^\s+embedding:\s*(.+)$/m)?.[1];
    const log = await import('node:fs').then(fs => fs.openSync(path.join(artifacts, 'host.log'), 'wx'));
    server = spawn(process.execPath, ['server.js', '--configPath', config, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'false'],
        { cwd: source, env: { ...process.env, SM_EMBED_METRICS: metricPath }, stdio: ['ignore', log, log] });
    const ready = waitForOwnedHost(server, path.join(artifacts, 'host.log'), url);
    await import('node:fs').then(fs => fs.closeSync(log));
    await ready;
    browser = await chromium.launch(); page = await browser.newPage(); page.setDefaultTimeout(20000);
    timeout = setTimeout(() => { timedOut = true; void page.close(); }, plan.limits.wallMinutes * 60000);
    page.on('pageerror', e => report.pageErrors.push(e.name));
    page.on('request', req => {
        const u = new URL(req.url());
        if (u.origin !== url || !u.pathname.startsWith('/api/vector/')) return;
        const body = req.postDataJSON() || {};
        report.traffic.push({ stage, kind: 'native', operation: u.pathname, nativeItems: body.items?.length || 0 });
    });
    await page.route(`${new URL(credentials.endpoint).origin}/**`, async route => {
        try {
            const req = route.request(), u = new URL(req.url()), body = req.postData() ? req.postDataJSON() : {};
            if (req.method() === 'POST' && u.pathname.endsWith('/collections')) {
                assert(pending.length < plan.limits.collections, 'Collection bound');
                pending.push({ collection: body.collectionName, owner: body.tags.owner, scope: body.tags.chat });
                await writeFile(pendingPath, JSON.stringify(pending, null, 2));
            }
            const docs = u.pathname.endsWith('/docs/upsert') ? body.docs || [] : [];
            const chars = docs.reduce((n, d) => n + d.text.length, 0);
            report.managedDocuments += docs.length; report.managedCharacters += chars;
            assert(report.managedDocuments <= plan.limits.managedUpsertDocuments && report.managedCharacters <= plan.limits.managedUpsertCharacters, 'Managed input bound');
            report.traffic.push({ stage, kind: 'lambda', method: req.method(), operation: u.pathname.split('/').slice(5).join('/') || 'collection', managedDocuments: docs.length, managedCharacters: chars });
            await route.continue();
        } catch (e) { report.pageErrors.push(e.message); await route.abort(); }
    });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor();
    await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 }); await panel();
    await field('endpoint').fill(credentials.endpoint); await field('project').fill(credentials.project); await field('key').fill(credentials.key);
    await field('connect').click(); await status('Chat memory is ready'); await idle();
    await page.evaluate(async () => {
        const c = SillyTavern.getContext(), body = new FormData(); body.set('ch_name', 'Branch Cost Synthetic'); body.set('first_mes', 'Synthetic expedition.');
        const r = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body });
        if (!r.ok) throw new Error('Character creation failed');
    });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' }); await status('Connected.'); await idle();
    await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'Branch Cost Synthetic' }).click();
    await page.waitForFunction(() => SillyTavern.getContext().characterId !== undefined); await panel();
    stage = 'local-model-warmup';
    const warmStart = performance.now();
    await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        const r = await fetch('/api/vector/insert', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ source: 'transformers', collectionId: 'branch-cost-warmup', items: [{ hash: 1, text: 'Warm up the local embedding model.', index: 0 }] }) });
        if (!r.ok) throw new Error('Local model warmup failed');
    });
    report.modelDownloadAndWarmupMilliseconds = performance.now() - warmStart;
    for (const count of plan.messages) {
        report.inputs.push({ messages: count, sha256: hash(JSON.stringify(messagesFor(count))), characters: messagesFor(count).reduce((n, m) => n + m.mes.length, 0) });
        for (let rep = 1; rep <= plan.repetitions; rep++) {
            for (const arm of rep % 2 ? ['native', 'sillymemory'] : ['sillymemory', 'native']) await runArm(arm, count, rep);
        }
    }
    check('complete frozen matrix', report.rows.length === plan.messages.length * plan.repetitions * 2 * plan.operations.length);
    check('no browser errors', !report.pageErrors.length);
    report.passed = true;
} catch (error) {
    report.failure = { stage, type: error.name, message: String(error.message).replaceAll(credentials.key, '[redacted]').slice(0, 800), timedOut };
    console.log(`FAILED ${stage}: ${error.name}`);
} finally {
    clearTimeout(timeout); stage = 'cleanup';
    // Node cleanup is independent of browser availability and only touches recorded owned collections.
    try {
        if (page && !page.isClosed()) { await memoryOff(); await nativeEnabled(false); }
    } catch (error) { report.browserShutdownFailure = error.name; }
    await browser?.close().catch(error => { report.browserShutdownFailure = error.name; });
    let client;
    try {
        const { LambdaClient } = await import('../src/client.js');
        client = new LambdaClient(credentials, credentials.key);
        const result = await cleanupOwnedCollections(client, pending);
        report.cleanup = result.remaining.length === 0;
        report.cleanupFailures = result.failures.map(({ collection, error }) => ({ collection, type: error.name, message: String(error.message).replaceAll(credentials.key, '[redacted]').slice(0, 300) }));
        await writeFile(pendingPath, JSON.stringify(result.remaining, null, 2));
    } catch (error) { report.cleanupFailure = { type: error.name, message: String(error.message).replaceAll(credentials.key, '[redacted]').slice(0, 300) }; }
    finally { client?.forget(); }
    // Attempt every local cleanup step even if another step fails. Keep evidence
    // outside the disposable data directory, and remove native data before save.
    try {
        if (server?.pid && server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    } catch (error) { report.serverShutdownFailure = { type: error.name, code: error.code }; }
    try {
        if (hostInstrumented) await replaceHostEmbedding(embeddingPath, originalEmbedding);
        report.hostRestored = await readFile(embeddingPath, 'utf8') === originalEmbedding;
    } catch (error) { report.hostRestoreFailure = { type: error.name, code: error.code }; }
    report.sourceUnchanged = true;
    try {
        for (const [file, digest] of Object.entries(report.sourceSha256)) if (hash(await readFile(path.join(root, file))) !== digest) report.sourceUnchanged = false;
    } catch (error) { report.sourceUnchanged = false; report.sourceCheckFailure = { type: error.name, code: error.code }; }
    try { if (work) await rm(work, { recursive: true, force: true }); }
    catch (error) { report.nativeCleanupFailure = { type: error.name, code: error.code, directory: work }; }
    report.passed &&= report.cleanup === true && report.sourceUnchanged && report.hostRestored === true
        && !report.browserShutdownFailure && !report.serverShutdownFailure && !report.nativeCleanupFailure;
    await save();
}
process.exitCode = report.passed ? 0 : 1;
