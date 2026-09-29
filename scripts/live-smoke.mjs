// Explicit live test: reads .env.local without exporting secrets to child processes.
// Sends only synthetic data through the pinned SillyTavern browser/proxy path.
import { runSelectionDiagnostic } from './selection-diagnostic.mjs';
import { scenarios } from './comparison-fixture.mjs';
import { runContextRetrieval } from './context-retrieval.mjs';
import { runLiveFaultScenarios } from './live-fault-scenarios.mjs';
import { chromium } from '@playwright/test';
import { parseEnv } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const selectionMode = process.argv.includes('--selection');
const faultMode = process.argv.includes('--faults');
const contextMode = process.argv.includes('--context');
const probeMode = process.argv.includes('--probe');
const probeBatchSize = Number(process.env.SM_PROBE_BATCH_SIZE || 1);
const probeTimeoutMs = Number(process.env.SM_PROBE_TIMEOUT_MS || 15000);
const probeQuery = process.env.SM_PROBE_QUERY === '1';
if (probeMode && (!Number.isInteger(probeBatchSize) || probeBatchSize < 1 || probeBatchSize > 50 || !Number.isInteger(probeTimeoutMs) || probeTimeoutMs < 1000 || probeTimeoutMs > 45000)) throw new Error('Invalid bounded probe settings.');
const artifactTag = process.env.SM_ARTIFACT_TAG || '';
if (artifactTag && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag)) throw new Error('Invalid SM_ARTIFACT_TAG.');
const suffix = `${selectionMode ? 'live-selection' : probeMode ? 'live-probe' : contextMode ? 'live-context' : faultMode ? 'live-faults' : 'live'}${artifactTag ? `-${artifactTag}` : ''}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
const variables = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const credentials = { endpoint: variables.LAMBDADB_BASE_URL, project: variables.LAMBDADB_PROJECT_NAME, key: variables.LAMBDADB_PROJECT_API_KEY };
if (!Object.values(credentials).every(v => typeof v === 'string' && v.length)) throw new Error('Missing required LambdaDB environment variables.');
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) throw new Error('Unexpected SillyTavern revision.');
if (await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')) !== root) throw new Error('Install this checkout as the pinned host extension symlink before live testing.');
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-live-'));
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
const owner = randomUUID().replaceAll('-', '');
const gateCollection = `smtest_${owner}`;
const memoryCollection = `smlive_${owner}`;
const pendingPath = path.join(artifacts, `${suffix}-pending.json`);
// A failed run leaves exact non-secret owned resource identities for recovery.
await writeFile(pendingPath, JSON.stringify({ owner, gateCollection, memoryCollection }, null, 2), { flag: 'wx' });
const port = Number(process.env.ST_LIVE_PORT || 18127), url = `http://127.0.0.1:${port}`;
let server, browser, page, stage = 'startup', failure = false, cleanupComplete = false;
const checks = [], responses = [];
const report = { time: new Date().toISOString(), sillyTavern: revision, upstream: 'Live LambdaDB through real browser and built-in proxy', checks, responses };
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
async function run(name, fn, arg) {
    stage = name;
    const result = await page.evaluate(async ({ source, arg }) => {
        try { return { ok: true, value: await (0, eval)(`(${source})`)(arg) }; }
        catch (e) { return { ok: false, status: Number(e.status) || 0, type: e.name }; }
    }, { source: fn.toString(), arg });
    if (!result.ok) throw Object.assign(new Error('Live check failed'), { status: result.status });
    record(name); return result.value;
}
try {
    const config = path.join(work, 'config.yaml'); await writeFile(config, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', config, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'true'], { cwd: source, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 90; i++) {
        if (server.exitCode !== null) throw new Error('Host exited');
        try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    if (!ready) throw new Error('Host startup timeout');
    // Keep the isolated profile independent of the default remote Horde service.
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.main_api = 'openai';
    await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch(); page = await browser.newPage(); page.setDefaultTimeout(20000);
    // Status and operation only; never collect request headers, bodies, URLs or traces.
    page.on('response', response => { if (response.url().includes('/proxy/')) responses.push({ stage, status: response.status() }); });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor();
    await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    record('pinned host and extension loaded');
    await run('session credentials initialized without persistence', async ({ credentials, owner, gateCollection, memoryCollection }) => {
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const { poll, runTransportGate } = await import('/scripts/extensions/third-party/sillymemory/src/gate.js');
        const { MemoryEngine, Journal, documents } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const client = new LambdaClient(credentials, credentials.key, { headers: () => SillyTavern.getContext().getRequestHeaders() });
        globalThis.liveTest = { client, poll, runTransportGate, owner, gateCollection, memoryCollection, MemoryEngine, Journal, documents };
    }, { credentials, owner, gateCollection, memoryCollection });
    await run('invalid key is rejected through the real proxy', async ({ endpoint, project, collection }) => {
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const invalid = new LambdaClient({ endpoint, project }, 'sillymemory-intentionally-invalid', { headers: () => SillyTavern.getContext().getRequestHeaders() });
        try { await invalid.get(collection); throw new Error('Invalid key unexpectedly accepted'); }
        catch (e) { if (![400, 401, 403].includes(e.status)) throw e; } finally { invalid.forget(); }
    }, { endpoint: credentials.endpoint, project: credentials.project, collection: gateCollection });
    if (probeMode) {
        report.probeConfiguration = { batchSize: probeBatchSize, timeoutMs: probeTimeoutMs, query: probeQuery, runtimeDefaultTimeoutMs: 15000 };
        report.probe = await run('bounded managed versus unmanaged upsert probe completed', async ({ texts, timeoutMs, query }) => {
            const t = globalThis.liveTest;
            const { schema, scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
            const results = [];
            const originalTimeout = t.client.timeoutMs; t.client.timeoutMs = timeoutMs;
            const docs = texts.map((text, index) => ({ id: `probe_${t.owner}_${index}`, owner: t.owner, scope: 'a'.repeat(64), revision: '1', text }));
            try {
            for (const managed of [false, true]) {
                const collection = managed ? t.gateCollection : t.memoryCollection;
                const indexConfigs = { ...schema }; if (!managed) delete indexConfigs.embedding;
                await t.client.request('/collections', { body: { collectionName: collection, indexConfigs, tags: { application: 'sillymemory', owner: t.owner }, snapshotRetentionInDays: 1 } });
                const start = performance.now();
                try {
                    await t.client.upsert(collection, docs);
                    results.push({ phase: 'upsert', managed, documents: docs.length, completed: true, elapsedMs: performance.now() - start });
                } catch (error) { results.push({ phase: 'upsert', managed, documents: docs.length, completed: false, status: Number(error.status) || 0, elapsedMs: performance.now() - start, reason: error.name === 'ConnectionError' ? error.message : 'Unexpected probe error' }); }
                if (query && results.at(-1).completed) {
                    const queryStart = performance.now();
                    try {
                        const hits = managed ? await t.client.search(collection, t.owner, docs[0].scope, texts[0]) : await t.client.query(collection, scopeFilter(t.owner, docs[0].scope), { size: docs.length });
                        const valid = hits.length > 0 && hits.every(hit => docs.some(doc => doc.id === hit.id && doc.text === hit.text && doc.owner === hit.owner && doc.scope === hit.scope));
                        results.push({ phase: managed ? 'queryText' : 'scope-query', managed, completed: valid, returned: hits.length, elapsedMs: performance.now() - queryStart });
                    } catch (error) { results.push({ phase: managed ? 'queryText' : 'scope-query', managed, completed: false, status: Number(error.status) || 0, elapsedMs: performance.now() - queryStart, reason: error.name === 'ConnectionError' ? error.message : 'Unexpected probe error' }); }
                }
            }
            } finally { t.client.timeoutMs = originalTimeout; }
            return results;
        }, { texts: probeBatchSize === 1 ? ['Synthetic diagnostic: the blue compass is under the cedar tree.'] : scenarios.find(s => s.id === 'revisions').messages.slice(0, probeBatchSize).map(m => m.mes), timeoutMs: probeTimeoutMs, query: probeQuery });
        failure = report.probe.some(result => !result.completed);
    } else {
    await run('live managed embedding transport gate and cleanup', async () => {
        const t = globalThis.liveTest;
        await t.runTransportGate(t.client, t.owner, t.gateCollection);
    });
    await run('dedicated live memory collection created', async () => {
        const t = globalThis.liveTest; await t.client.create(t.memoryCollection, t.owner);
        t.engine = new t.MemoryEngine({ client: t.client, owner: t.owner, collection: t.memoryCollection, journal: new t.Journal(localStorage, `live:${t.owner}`) });
        t.config = { recent: 2, budget: 400, chunkChars: 800 };
        t.snapshot = { character: 'synthetic-mira.png', chat: 'synthetic-parent', messages: [
            { text: 'Mira hid the blue compass beneath the cedar tree.' },
            { text: 'The brass key is inside a violet teapot in the library.' },
            { text: 'We returned to the garden at sunrise.' },
            { text: 'Where did Mira hide the blue compass?' },
        ].map((m, index) => ({ ...m, index, name: index % 2 ? 'Mira' : 'User', user: !(index % 2), swipe: 0, eligible: true })) };
        await t.poll(async () => { await t.engine.sync(t.snapshot, t.config); return true; });
    });
    report.memory = await run('live recall obeys local source and token budget', async () => {
        const t = globalThis.liveTest; let result;
        await t.poll(async () => { result = await t.engine.retrieve(t.snapshot, t.config, text => SillyTavern.getContext().getTokenCountAsync(text)); return result?.passages.some(p => p.message === 0); });
        if (result.tokens > t.config.budget || result.passages.some(p => p.message >= 2)) throw new Error('Budget or recent-message failure');
        return { passages: result.passages.length, tokens: result.tokens, budget: t.config.budget };
    });
    await run('live chat branch and character isolation', async () => {
        const t = globalThis.liveTest;
        const parent = await t.documents(t.snapshot, t.owner, t.config);
        const branch = structuredClone(t.snapshot); branch.chat = 'synthetic-branch'; branch.messages[0].text = 'Mira hid a silver compass in the stone tower.';
        const character = structuredClone(t.snapshot); character.character = 'synthetic-noah.png'; character.messages[0].text = 'Noah hid a green compass on the fishing boat.';
        for (const snap of [branch, character]) await t.engine.sync(snap, t.config);
        for (const snap of [t.snapshot, branch, character]) {
            const expected = await t.documents(snap, t.owner, t.config); let hits;
            await t.poll(async () => { hits = await t.client.search(t.memoryCollection, t.owner, expected.scope, 'Where is the compass?'); return hits.some(d => d.id === expected.docs[0].id); });
            if (hits.some(d => d.scope !== expected.scope)) throw new Error('Remote isolation failure');
        }
        t.parentScope = parent.scope; t.originalId = parent.docs[0].id;
    });
    await run('live edit and swipe remove obsolete documents', async () => {
        const t = globalThis.liveTest; t.snapshot.messages[0].text = 'Edited: the blue compass is now in the attic.';
        t.snapshot.messages[1].swipe = 1; t.snapshot.messages[1].text = 'Selected swipe: the brass key is in the cellar.';
        t.engine.invalidate(); await t.engine.sync(t.snapshot, t.config);
        const desired = await t.documents(t.snapshot, t.owner, t.config);
        const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        await t.poll(async () => { const rows = await t.client.query(t.memoryCollection, scopeFilter(t.owner, t.parentScope)); return rows.length === desired.docs.length && rows.every(d => desired.docs.some(x => x.id === d.id && x.text === d.text)); });
    });
    await run('live deletion reconciles after engine reload', async () => {
        const t = globalThis.liveTest; t.snapshot.messages.splice(0, 1); t.snapshot.messages.forEach((m, i) => { m.index = i; });
        t.engine = new t.MemoryEngine({ client: t.client, owner: t.owner, collection: t.memoryCollection, journal: new t.Journal(localStorage, `live:${t.owner}`) });
        await t.engine.sync(t.snapshot, t.config); const desired = await t.documents(t.snapshot, t.owner, t.config);
        const { scopeFilter } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        await t.poll(async () => { const rows = await t.client.query(t.memoryCollection, scopeFilter(t.owner, t.parentScope)); return rows.length === desired.docs.length && rows.every(d => desired.docs.some(x => x.id === d.id)); });
    });
    if (faultMode) await runLiveFaultScenarios(run, report);
    if (contextMode) await runContextRetrieval(run, report);
    if (selectionMode) await runSelectionDiagnostic(run, report);
    }
    await run('real key is absent from browser storage and host settings', async key => {
        const c = SillyTavern.getContext();
        if (JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: c.extensionSettings }).includes(key)) throw new Error('Credential persistence detected');
        const response = await fetch('/api/settings/get', { method: 'POST', headers: c.getRequestHeaders(), body: '{}' });
        if ((await response.text()).includes(key)) throw new Error('Credential persistence detected');
    }, credentials.key);
} catch (e) {
    failure = true; report.failure = { stage, status: Number(e.status) || 0 };
    console.log(`FAIL ${stage}; HTTP status ${Number(e.status) || 'unavailable'}`);
} finally {
    if (page && !page.isClosed()) {
        try {
            await run('all owned live test collections deleted and confirmed absent', async () => {
                const t = globalThis.liveTest; if (!t) throw new Error('No cleanup client');
                if (t.engine) await t.engine.deleteAll(); else await t.client.deleteOwnedCollection(t.memoryCollection, t.owner);
                await t.client.deleteOwnedCollection(t.gateCollection, t.owner); t.client.forget();
            });
            cleanupComplete = true; await rm(pendingPath, { force: true });
        } catch (e) { report.cleanupFailure = { stage, status: Number(e.status) || 0 }; console.log('Cleanup incomplete: retain the pending resource record for recovery.'); }
        if (cleanupComplete) {
            try {
                await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
                await run('browser reload drops the key and disables extension memory', async () => {
                    if (globalThis.liveTest || document.querySelector('[data-sm="key"]').value || document.querySelector('[data-sm="enabled"]').checked) throw new Error('Reload state failure');
                });
            } catch { failure = true; report.reloadFailure = true; }
        }
    }
    report.cleanupComplete = cleanupComplete; report.passed = !failure && cleanupComplete;
    report.sourceSha256 = {};
    for (const file of ['src/client.js', 'src/gate.js', 'src/memory.js', 'scripts/live-smoke.mjs', 'scripts/live-fault-scenarios.mjs', 'scripts/context-retrieval.mjs', 'scripts/comparison-fixture.mjs', 'scripts/selection-diagnostic.mjs', 'scripts/natural-dialogue.mjs', 'docs/context-selection-evaluation.md', ...['natural-dialogue-v1', 'speaker-native-v1', 'long-dialogue-v1'].map(v => `tests/fixtures/${v}.json`)]) report.sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    // Defense in depth: fail rather than write any known credential into a report.
    const output = JSON.stringify(report, null, 2);
    if (output.includes(credentials.key)) throw new Error('Report redaction guard failed');
    await writeFile(path.join(artifacts, `${suffix}${!selectionMode && !probeMode && !contextMode && !faultMode ? '-smoke' : ''}.json`), output);
    await browser?.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
    await rm(work, { recursive: true, force: true });
}
process.exitCode = report.passed ? 0 : 1;
