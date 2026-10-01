// Real pinned host, native vector backend, OpenAI and LambdaDB managed embeddings.
// Public frozen development cases only. Credentials never enter reports or disk profiles.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { parseEnv } from 'node:util';
import { indexNative, purgeNativeCollections } from './three-mode-native.mjs';
import { once } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, symlink, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { hostRevision, readVerifiedFile, sha } from './benchmark-audit.mjs';
import { prepareHostCase, sourceView, promptCoverage } from './benchmark-host-input.mjs';

import { openProviderLedger, LEDGER_POLICY } from './benchmark-provider-ledger.mjs';
import { openCheckpoint } from './benchmark-checkpoint.mjs';
import { prepareDevelopmentCase } from './benchmark-development-input.mjs';
import { validateLivePilot } from './benchmark-live-results.mjs';
import { validateObservation } from './benchmark-observation.mjs';
import { nativeBarrier, completeNativeIndex } from './benchmark-native-barrier.mjs';
import { installRetrievalObserver } from './benchmark-retrieval-observer.mjs';
import { createServer as createHttpsServer } from 'node:https';

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostSource = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const [cache, output, mode, ...options] = process.argv.slice(2);
const fixture = mode === '--fixture', stopAfterObservation = options.includes('--stop-after-observation');
assert(cache && output && mode && options.every(x => x === '--stop-after-observation'));
assert(!stopAfterObservation || fixture, 'Fault injection is fixture-only');
assert(path.resolve(output).startsWith(path.join(root, 'artifacts') + path.sep), 'Private output must be under artifacts/');
const env = fixture ? { LAMBDADB_PROJECT_NAME: 'synthetic', LAMBDADB_PROJECT_API_KEY: 'synthetic-session-key' } : parseEnv(await readFile(mode, 'utf8'));
if (!fixture) {
    assert.equal(env.LLM_BASE_URL.replace(/\/$/, ''), 'https://api.openai.com/v1');
    assert.equal(env.LLM_MODEL, 'gpt-4.1-mini-2025-04-14');
    for (const key of ['LLM_API_KEY', 'LAMBDADB_BASE_URL', 'LAMBDADB_PROJECT_NAME', 'LAMBDADB_PROJECT_API_KEY']) assert(env[key], `Missing ${key}`);
}
let endpoint = fixture ? '' : new URL(env.LAMBDADB_BASE_URL).origin;
if (!fixture) assert.equal(new URL(endpoint).protocol, 'https:');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('-C', hostSource, 'rev-parse', 'HEAD'), hostRevision);
const read = name => readFile(path.join(root, name));
const planBytes = await read('docs/benchmarks/development-plan-v1.json'), plan = JSON.parse(planBytes);
const lockBytes = await read('docs/benchmarks/sources-v1.json'), lock = JSON.parse(lockBytes);
assert.equal(sha(lockBytes), plan.sourceSha256);
assert.equal(sha(await read('docs/benchmarks/selection-v1.json')), plan.selectionSha256);
assert.equal(plan.hostRevision, hostRevision);
const data = readVerifiedFile(cache, lock.files.find(f => f.dataset === 'longmemeval'));
const cases = plan.cases.map(sample => prepareDevelopmentCase(data[sample.sourceIndex], sample));
const pilotBytes = await read('docs/benchmarks/live-pilot-v1.json'), pilot = JSON.parse(pilotBytes);
const pilotPlanBytes = await read('docs/benchmarks/pilot-design-v1.json');
assert.equal(sha(pilotPlanBytes), plan.pilotPlanSha256);
validateLivePilot(pilot, JSON.parse(pilotPlanBytes));
assert.deepEqual(pilot.generator, plan.generator); assert.equal(pilot.judge, plan.judge.model);
const runtimeFiles = ['index.js', 'manifest.json', 'src/memory.js', 'src/context.js', 'src/client.js', 'src/gate.js', 'src/delivery.js', 'src/status.js'];
for (const file of runtimeFiles) assert.equal(sha(await read(file)), pilot.sourceSha256ByFile[file], `Pilot runtime changed: ${file}`);
const reused = plan.tasks.filter(t => t.reusePilot).map(t => {
    const row = pilot.rows.find(r => `${r.id}/${r.context}/${r.mode}` === t.id);
    assert(row?.judge); assert.equal(row.inputSha256, cases.find(c => c.id === t.caseId).inputSha256);
    return { ...structuredClone(row), reusedPilot: true };
});
assert.equal(reused.length, 8);
const scorer = await readFile(path.join(cache, 'evaluate_qa.py'));
assert.equal(sha(scorer), pilot.scorerSha256);
const require = createRequire(path.join(hostSource, 'package.json'));
assert.equal(JSON.parse(await readFile(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
const encoder = require('tiktoken').get_encoding('o200k_base'), embeddingEncoder = require('tiktoken').get_encoding('cl100k_base');
const count = text => encoder.encode(text, [], []).length, embeddingCount = text => embeddingEncoder.encode(text, [], []).length;
const sourceSha256ByFile = {};
for (const file of [...runtimeFiles, 'scripts/benchmark-development-live.mjs', 'scripts/benchmark-provider-ledger.mjs', 'scripts/benchmark-checkpoint.mjs',
    'scripts/benchmark-development-input.mjs', 'scripts/benchmark-observation.mjs', 'scripts/benchmark-retrieval-observer.mjs', 'scripts/benchmark-native-barrier.mjs',
    'scripts/three-mode-native.mjs', 'scripts/provider-retry.mjs', 'scripts/benchmark-host-input.mjs', 'scripts/benchmark-live-network.cjs', 'scripts/benchmark-audit.mjs']) sourceSha256ByFile[file] = sha(await read(file));
const binding = { plan: sha(planBytes), sourceSha256ByFile, fixture, pilot: sha(pilotBytes), scorer: sha(scorer),
    destination: fixture ? 'loopback' : sha(endpoint + '/' + env.LAMBDADB_PROJECT_NAME) };
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
// Acquire the run lock before reading or modifying its report; a second process
// must not touch the report even if provider-ledger initialization fails.
const durable = await openCheckpoint(output + '.state', binding, plan.limits);
let report, ledger, fixtureClock = 0;
try {
    try { report = JSON.parse(await readFile(output)); assert.deepEqual(report.binding, binding, 'Run binding changed'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; report = { version: 'longmemeval-development-live-v1', binding, fixture,
        evidence: fixture ? 'Actual pinned host with local deterministic services; no provider quality evidence.' : 'Actual pinned host, OpenAI and LambdaDB managed embeddings; development split only.',
        rows: fixture ? [] : reused, summaries: [], generations: [], embeddings: [], nativeBarriers: [], sessions: [],
        traffic: { lambda: [], vector: [], hostBlocked: 0, browserBlocked: 0 }, owned: [], passed: false, cleanup: false }; }
    assert(!report.passed, 'Completed run is read-only');
    ledger = await openProviderLedger(output + '.providers', plan, { binding,
        countTokens: (text, kind) => kind === 'embedding' ? embeddingCount(text) : count(text),
        ...(fixture ? { now: () => fixtureClock, wait: async ms => { fixtureClock += ms; }, random: () => 0 } : {}),
        send: async ({ kind, body, signal }) => {
            if (!fixture) return fetch(`https://api.openai.com/v1/${kind === 'embedding' ? 'embeddings' : 'chat/completions'}`, {
                method: 'POST', headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
            if (kind === 'embedding') return new Response(JSON.stringify({ data: body.input.map((text, index) => ({ index,
                embedding: Array.from({ length: 1536 }, (_, i) => (parseInt(sha(text).slice(i % 60, i % 60 + 4), 16) / 65535) - .5) })),
                usage: { total_tokens: body.input.reduce((n, text) => n + embeddingCount(text), 0) } }));
            const content = kind === 'judge' ? 'yes' : kind === 'summary' ? 'LOCAL_SUMMARY' : 'LOCAL_ANSWER';
            const prompt_tokens = body.messages.reduce((n, m) => n + count(m.content) + 6, 0), completion_tokens = count(content);
            return new Response(JSON.stringify({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens } }));
        },
    });
} catch (error) { await durable.close(); throw error; }
const startedAt = Date.now();
report.sessions.push({ startedAt: new Date(startedAt).toISOString(), priorFailure: report.failure || null });
delete report.failure; report.cleanup = false;
let checkpointTail = Promise.resolve();
const checkpoint = () => { const bytes = JSON.stringify(report) + '\n'; checkpointTail = checkpointTail.then(async () => { await writeFile(output + '.tmp', bytes); await rename(output + '.tmp', output); }); return checkpointTail; };
try { await checkpoint(); }
catch (error) { await ledger.close(); await durable.close(); throw error; }
// Replay exact prior embedding batches even if native background work changes their order.
// Consume each prior occurrence once; new requests still reserve a fresh ordinal.
const priorEmbedding = new Map(), embeddingNext = new Map();
for (const [id, call] of Object.entries(ledger.state.calls)) {
    const match = /^request\/(.+)\/embedding\/(\d+)$/.exec(id);
    if (!match) continue;
    const task = match[1], ordinal = Number(match[2]);
    embeddingNext.set(task, Math.max(embeddingNext.get(task) || 0, ordinal + 1));
    const key = task + '/' + call.requestSha256;
    if (!priorEmbedding.has(key)) priorEmbedding.set(key, []);
    priorEmbedding.get(key).push(ordinal);
}
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-development-live-')), source = path.join(work, 'host');
let host, browser, page, native, remote, cert, hostAdded = false, stage = 'setup', summarySignal = 0, summaryOrdinal = 0;
const generations = [], errors = [], memoryDocs = new Map();
const send = (res, status, body = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const json = async req => { const parts = []; for await (const chunk of req) parts.push(chunk); return JSON.parse(Buffer.concat(parts).toString() || '{}'); };
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const deadline = () => assert(fixture || Date.now() - ledger.state.observations.start.value.at < LEDGER_POLICY.durationMs, 'Development duration exceeded');
async function completion(body, phase) {
    const kind = phase.endsWith('/judge') ? 'judge' : phase.endsWith('/summary-replay') ? 'summary' : 'answer';
    const task = phase.replace(/\/(judge|summary-replay)$/, '');
    const ordinal = kind === 'summary' ? summaryOrdinal++ : 0;
    const { result, attempts, reused } = await ledger.invoke(task, kind, ordinal, body);
    const id = `${task}/${kind}/${ordinal}`;
    const record = { id, stage: phase, model: body.model, promptSha256: sha(JSON.stringify(body.messages)),
        answer: result.choices[0].message.content, usage: result.usage, finishReason: result.choices[0].finish_reason, attempts, reused };
    if (!report.generations.some(g => g.id === id)) report.generations.push(record);
    await checkpoint(); return { result, record };
}
const bridge = createServer(async (req, res) => {
    try {
        if (req.url === '/v1/models') return send(res, 200, { data: [{ id: plan.generator.model }] });
        const body = await json(req); deadline();
        if (req.url === '/v1/embeddings') {
            assert(stage.endsWith('/vectors'), 'Embedding request outside native arm');
            const key = stage + '/' + sha(JSON.stringify({ kind: 'embedding', body }));
            const previousOrdinals = priorEmbedding.get(key);
            const ordinal = previousOrdinals?.length ? previousOrdinals.shift() : (embeddingNext.get(stage) || 0);
            embeddingNext.set(stage, Math.max(embeddingNext.get(stage) || 0, ordinal + 1));
            const { result, attempts, reused } = await ledger.invoke(stage, 'embedding', ordinal, body);
            const id = `${stage}/embedding/${ordinal}`;
            if (!report.embeddings.some(e => e.id === id)) report.embeddings.push({ id, stage, inputs: body.input.length, usage: result.usage, attempts, reused });
            await checkpoint(); return send(res, 200, result);
        }
        assert.equal(req.url, '/v1/chat/completions');
        const { result, record } = await completion(body, stage);
        generations.push({ stage, body, answer: record.answer, record }); send(res, 200, result);
    } catch (e) { errors.push(e.message.split('\n')[0].slice(0, 160)); await checkpoint(); send(res, 502, { error: { message: 'Bounded benchmark request failed' } }); }
});
async function cleanOwned() {
    for (const entry of Object.values(durable.state.observations).filter(o => o.value.collection)) {
        const owned = entry.value;
        await page.evaluate(async ({ endpoint, project, key, owned }) => {
            const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
            const c = SillyTavern.getContext(), client = new LambdaClient({ endpoint, project }, key, { headers: () => c.getRequestHeaders() });
            try { await client.deleteOwnedCollection(owned.collection, owned.owner); } finally { client.forget(); }
        }, { endpoint, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY, owned });
        await durable.observe(`cleaned/${owned.collection}`, { inaccessible: true });
    }
}
try {
    git('-C', hostSource, 'worktree', 'add', '--detach', source, hostRevision); hostAdded = true;
    await symlink(path.join(hostSource, 'node_modules'), path.join(source, 'node_modules'));
    const extensions = path.join(source, 'public/scripts/extensions/third-party');
    await mkdir(extensions, { recursive: true }); await symlink(root, path.join(extensions, 'sillymemory'));
    if (fixture) {
        const key = path.join(work, 'key.pem'); cert = path.join(work, 'cert.pem');
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
            '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
        const collections = new Map();
        remote = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
            try {
                const body = await json(req), parts = req.url.split('/').filter(Boolean), name = parts[3];
                assert.equal(req.headers['x-api-key'], env.LAMBDADB_PROJECT_API_KEY);
                assert.deepEqual(parts.slice(0, 3), ['projects', 'synthetic', 'collections']);
                const operation = parts.slice(4).join('/');
                if (!name && req.method === 'POST') { collections.set(body.collectionName, { definition: body, docs: new Map() }); return send(res, 201, { collection: body }); }
                const c = collections.get(name); if (!c) return send(res, 404);
                if (parts.length === 4 && req.method === 'GET') return send(res, 200, { collection: c.definition });
                if (parts.length === 4 && req.method === 'DELETE') { collections.delete(name); return send(res, 200); }
                if (operation === 'docs/upsert') { body.docs.forEach(d => c.docs.set(d.id, d)); return send(res, 202); }
                if (operation === 'docs/delete') { body.ids.forEach(id => c.docs.delete(id)); return send(res, 202); }
                if (operation === 'query') {
                    const filter = body.query.knn?.filter || body.query;
                    const match = /^owner:([a-f0-9]+) AND scope:([a-f0-9]+)$/.exec(filter.queryString?.query || ''); assert(match);
                    let docs = [...c.docs.values()].filter(d => d.owner === match[1] && d.scope === match[2]);
                    if (body.query.knn) docs = docs.slice(0, body.size || 20);
                    return send(res, 200, { docs: docs.map(doc => ({ collection: name, doc })), isDocsInline: true, total: docs.length, took: 1 });
                }
                throw new Error('Unexpected fixture operation');
            } catch { send(res, 500); }
        });
        endpoint = `https://127.0.0.1:${await listen(remote)}`;
    } else {
        for (const model of [plan.generator.model, plan.judge.model, plan.arms.vectors.embeddingModel]) {
            const response = await fetch(`https://api.openai.com/v1/models/${model}`, { headers: { Authorization: `Bearer ${env.LLM_API_KEY}` }, signal: AbortSignal.timeout(30000) });
            assert(response.ok, `Pinned model unavailable: HTTP ${response.status}`);
        }
    }
    const bridgeUrl = `http://127.0.0.1:${await listen(bridge)}/v1`;
    const probe = createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
    const url = `http://127.0.0.1:${port}`, config = path.join(work, 'config.yaml');
    await writeFile(config, await readFile(path.join(source, 'default/config.yaml')));
    host = spawn(process.execPath, ['--require', path.join(root, 'scripts/benchmark-live-network.cjs'),
        'server.js', '--configPath', config, '--dataRoot', path.join(work, 'data'), '--port', String(port),
        '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'true'], {
        cwd: source, env: { PATH: process.env.PATH, HOME: process.env.HOME, BENCHMARK_LAMBDA_HOST: new URL(endpoint).hostname, ...(fixture ? { NODE_EXTRA_CA_CERTS: cert } : {}) }, stdio: ['ignore', 'ignore', 'pipe'] });
    host.stderr.on('data', bytes => { report.traffic.hostBlocked += (String(bytes).match(/BENCHMARK_NETWORK_BLOCKED/g) || []).length; });
    let ready = false;
    for (let n = 0; n < 90; n++) {
        assert.equal(host.exitCode, null, 'Host exited');
        try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    assert(ready, 'Host startup timeout');
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath)); profile.main_api = 'openai';
    await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch(); page = await browser.newPage(); page.setDefaultTimeout(30000);
    native = nativeBarrier(page);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => {
        if (/Not enough messages in chat to summarize|Summary conditions not satisfied|Summary set to:/.test(message.text())) summarySignal++;
    });
    await page.route('**/*', async route => {
        const request = route.request(), target = new URL(request.url());
        if (target.origin !== url) { report.traffic.browserBlocked++; return route.abort(); }
        try {
            if (target.pathname.startsWith('/proxy/')) {
                const remote = new URL(decodeURIComponent(target.pathname.slice(7)));
                assert.equal(remote.origin, endpoint); assert.equal(remote.search, '');
                const prefix = `/projects/${encodeURIComponent(env.LAMBDADB_PROJECT_NAME)}/collections`;
                assert(remote.pathname === prefix || remote.pathname.startsWith(prefix + '/'));
                const parts = remote.pathname.slice(prefix.length).split('/').filter(Boolean);
                const body = request.postData() ? request.postDataJSON() : {};
                const operation = parts.slice(1).join('/') || (parts[0] ? 'collection' : 'create');
                const create = operation === 'create' && request.method() === 'POST';
                if (stage !== 'cleanup') {
                    deadline();
                    await durable.charge({ collections: Number(create), lambdaRequests: 1, lambdaDocuments: body.docs?.length || 0,
                        lambdaTokens: (body.docs || []).reduce((n, d) => n + embeddingCount(d.text) + 8, 0) + (body.query?.knn ? embeddingCount(body.query.knn.queryText) + 8 : 0),
                        lambdaWriteBytes: request.method() === 'POST' ? Buffer.byteLength(request.postData() || '') : 0 });
                } else assert(['GET', 'DELETE'].includes(request.method()), 'Cleanup cannot write documents');
                if (create) {
                    assert.equal(body.indexConfigs.embedding.managedEmbedding, true);
                    assert.equal(body.tags.application, 'sillymemory'); assert(/^[a-f0-9]+$/.test(body.tags.owner));
                    assert(/^(sillymemory|smtest)_[a-f0-9]{32}$/.test(body.collectionName));
                    const owned = { collection: body.collectionName, owner: body.tags.owner };
                    await durable.observe(`owned/${owned.collection}`, owned); report.owned.push(owned);
                } else assert(durable.state.observations[`owned/${parts[0]}`], 'Unowned remote target');
                if (body.docs) { assert(body.docs.length <= 50); for (const d of body.docs) memoryDocs.set(d.id, { scope: d.scope, stage }); }
                const entry = { stage, method: request.method(), operation, count: body.docs?.length ?? body.ids?.length };
                report.traffic.lambda.push(entry);
                const onResponse = response => { if (response.request() === request) { entry.status = response.status(); page.off('response', onResponse); } };
                page.on('response', onResponse); await checkpoint();
            }
            if (target.pathname.startsWith('/api/vector/')) {
                assert(stage.endsWith('/vectors') || stage === 'cleanup', 'Native request outside its arm');
                const body = request.postDataJSON();
                report.traffic.vector.push({ stage, operation: target.pathname.split('/').at(-1), count: body.items?.length });
            }
            return route.continue();
        } catch (e) { errors.push(e.message.split('\n')[0].slice(0, 160)); await checkpoint(); return route.abort(); }
    });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor();
    await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.evaluate(async ({ bridgeUrl, model }) => {
        const { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { custom_url: bridgeUrl, custom_model: model, stream_openai: false, temp_openai: 0,
            custom_include_headers: '', custom_include_body: '', custom_exclude_body: '', custom_prompt_post_processing: '', squash_system_messages: false });
        oai_settings.prompts.find(p => p.identifier === 'main').content = 'Answer the question using the provided conversation history. If it is not known, say so.';
        await (await import('/script.js')).saveSettings();
        const c = SillyTavern.getContext(), data = new FormData();
        data.set('ch_name', 'Assistant'); data.set('description', 'A conversational assistant.'); data.set('first_mes', 'Benchmark development pilot.');
        assertResponse(await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data }));
        function assertResponse(r) { if (!r.ok) throw new Error('Character creation failed'); }
    }, { bridgeUrl, model: plan.generator.model });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.locator('#rightNavHolder .drawer-toggle').click();
    await page.locator('.character_select').filter({ hasText: 'Assistant' }).click();
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    await installRetrievalObserver(page);
    stage = 'cleanup'; await cleanOwned(); stage = 'setup';
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 600000 });
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#sillymemory .inline-drawer-toggle').click();
    await field('endpoint').fill(endpoint); await field('project').fill(env.LAMBDADB_PROJECT_NAME); await field('key').fill(env.LAMBDADB_PROJECT_API_KEY);
    await field('connect').click(); await field('gate').click(); await status('Transport gate passed');
    await field('provision').click(); await status('Memory collection created');
    report.settings = await page.evaluate(bridgeUrl => {
        globalThis.threeModeNativeCollections = [];
        const c = SillyTavern.getContext();
        c.extensionSettings.memory.source = 'main'; c.extensionSettings.memory.memoryFrozen = true;
        $('#vectors_source').val('vllm').trigger('change');
        $('#vectors_vllm_model').val('text-embedding-3-small').trigger('input');
        $('#vector_altEndpointUrl_enabled').prop('checked', true).trigger('input');
        $('#vector_altEndpoint_address').val(bridgeUrl).trigger('change');
        return { summary: structuredClone(c.extensionSettings.memory), vectors: structuredClone(c.extensionSettings.vectors),
            recent: Number(document.querySelector('[data-sm="recent"]').value), budget: Number(document.querySelector('[data-sm="budget"]').value) };
    }, bridgeUrl);
    assert.equal(report.settings.summary.prompt_builder, 0); assert.equal(report.settings.summary.promptInterval, 10);
    assert.equal(report.settings.summary.promptWords, 200); assert.equal(report.settings.summary.overrideResponseLength, 0);
    assert.equal(report.settings.vectors.insert, 3); assert.equal(report.settings.vectors.protect, 5);
    assert.equal(report.settings.recent, 12); assert.equal(report.settings.budget, 800);

    const comparable = settings => { const value = structuredClone(settings); delete value.vectors.alt_endpoint_url; return value; };
    assert.deepEqual(comparable(report.settings), comparable(pilot.settings), 'Pilot settings changed');
    async function reset(chat, id, context) {
        await native.suspend();
        if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(async ({ chat, id, context, output }) => {
            const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
            c.extensionSettings.memory.memoryFrozen = true;
            $('#vectors_enabled_chats').prop('checked', false).trigger('input');
            Object.assign(oai_settings, { openai_max_context: context, openai_max_tokens: output });
            await c.openCharacterChat(id); c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
            // Empty reloads recreate the character greeting; remove it before event replay.
            if (!chat.length) { c.chat.splice(0); await c.saveChat(); }
        }, { chat, id, context, output: plan.generator.maxOutputTokens });
    }
    async function generate(question) {
        const start = generations.length;
        const observation = await page.evaluate(async question => {
            const c = SillyTavern.getContext();
            const { promptManager } = await import('/scripts/openai.js');
            const { getMaxPromptTokens } = await import('/script.js');
            const snapshots = [];
            const capture = ({ chat, dryRun }) => {
                if (!dryRun) snapshots.push({ prompt: structuredClone(chat), tokens: promptManager.tokenUsage });
            };
            c.eventSource.makeFirst(c.eventTypes.CHAT_COMPLETION_PROMPT_READY, capture);
            document.querySelector('#send_textarea').value = question;
            try { await c.generate('normal'); }
            finally { c.eventSource.removeListener(c.eventTypes.CHAT_COMPLETION_PROMPT_READY, capture); }
            return { chat: c.chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user })),
                native: c.extensionPrompts['3_vectors']?.value || '', summary: c.extensionPrompts['1_memory']?.value || '',
                snapshotCount: snapshots.length, promptReady: snapshots[0]?.prompt, hostPromptTokens: snapshots[0]?.tokens,
                hostPromptBudget: getMaxPromptTokens(),
                retrieval: structuredClone(globalThis.benchmarkRetrieval || null),
                delivery: document.querySelector('[data-sm="delivery"]').textContent };
        }, question);
        return { observation, request: generations.at(-1)?.body, record: generations.at(-1)?.record, successfulCompletions: generations.length - start };
    }
    async function judgeRow(row) {
            // Never expose gold to the host, index, query, or generator.
            const sample = plan.cases.find(c => c.id === row.id), gold = data[sample.sourceIndex];
            const judgePrompt = execFileSync('python3', ['-c', `import ast,json,sys
s=ast.parse(open(sys.argv[1]).read())
f=next(n for n in s.body if isinstance(n,ast.FunctionDef) and n.name=='get_anscheck_prompt')
ns={}
exec(compile(ast.Module(body=[f],type_ignores=[]),'<pinned-scorer>','exec'),ns)
x=json.load(sys.stdin)
print(ns['get_anscheck_prompt'](**x))`, path.join(cache, 'evaluate_qa.py')], { input: JSON.stringify({ task: gold.question_type, question: gold.question, answer: gold.answer, response: row.answer, abstention: row.id.endsWith('_abs') }), encoding: 'utf8' }).trimEnd();
            const { record: judged } = await completion({ model: plan.judge.model, messages: [{ role: 'user', content: judgePrompt }], temperature: 0, max_tokens: 10, stream: false }, `${row.id}/${row.context}/${row.mode}/judge`);
            row.judge = { response: judged.answer, correct: judged.answer.toLowerCase().includes('yes'), exactYesNo: /^(yes|no)\.?$/i.test(judged.answer.trim()), promptSha256: judged.promptSha256 };
            await checkpoint();
    }
    for (const item of cases) for (const context of [32768, 131072]) {
        for (const mode of context === 131072 ? ['off'] : Object.keys(plan.arms)) {
            if (fixture && item.id !== plan.cases[1].id) continue;
            const existingRow = report.rows.find(r => r.id === item.id && r.context === context && r.mode === mode);
            if (existingRow) { if (!existingRow.judge) await judgeRow(existingRow); continue; }
            stage = `${item.id}/${context}/${mode}`; console.log(`LIVE ${stage}`);
            summaryOrdinal = 0;
            const armStarted = Date.now();
            let saved;
            if (!durable.state.calls[`observation/${stage}`]) {
            await reset(mode === 'summary' ? [] : item.chat, stage.replaceAll('/', '-'), context);
            const restored = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user })));
            assert.equal(sha(JSON.stringify(restored)), sha(JSON.stringify(sourceView(mode === 'summary' ? [] : item.chat))), 'Restored source hash');
            let nativeDocuments = 0;
            if (mode === 'vectors') {
                const indexed = await completeNativeIndex(page, { index: indexNative, barrier: native,
                    healthy: () => assert.deepEqual(errors, [], 'Provider failed during native indexing') });
                report.nativeIndexCompletion ||= []; report.nativeIndexCompletion.push({ stage, attempts: indexed.completionAttempts, hashes: indexed.hashes.length });
                nativeDocuments = report.traffic.vector.filter(r => r.stage === stage && r.operation === 'insert').reduce((n, r) => n + r.count, 0);
                assert(nativeDocuments > 0);
            }
            if (mode === 'summary') {
                stage += '/summary-replay';
                await page.evaluate(() => { SillyTavern.getContext().extensionSettings.memory.memoryFrozen = false; });
                const start = generations.length, steps = [];
                for (const [index, message] of item.chat.entries()) {
                    const signal = summarySignal, before = generations.length;
                    await page.evaluate(async message => {
                        const c = SillyTavern.getContext(); c.chat.push(message);
                        await c.eventSource.emit(message.is_user ? c.eventTypes.USER_MESSAGE_RENDERED : c.eventTypes.CHARACTER_MESSAGE_RENDERED, c.chat.length - 1);
                    }, message);
                    if (!message.is_user) {
                        const deadline = Date.now() + 210000;
                        while (summarySignal === signal && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
                        assert(summarySignal > signal, 'Automatic summary event settled');
                        const stored = await page.evaluate(() => {
                            const c = SillyTavern.getContext(), at = c.chat.findLastIndex(m => Boolean(m.extra?.memory));
                            return { at, summary: c.chat[at]?.extra?.memory };
                        });
                        if (generations.length > before) {
                            assert.equal(generations.length, before + 1);
                            assert.equal(stored.summary, generations.at(-1).answer);
                            const request = generations.at(-1).body;
                            steps.push({ triggerMessage: index, storedAt: stored.at,
                                promptSha256: sha(JSON.stringify(request.messages)),
                                contentTokenEstimate: request.messages.reduce((n, m) => n + count(m.content) + 6, 0),
                                outputCap: request.max_tokens, previousSummaryIncluded: before > start && request.messages.some(m => m.content.includes(generations[before - 1].answer)) });
                            if (steps.length % 10 === 0) console.log(`SUMMARY ${stage}: ${steps.length} automatic updates`);
                        }
                    }
                    assert(generations.length - start <= plan.cases.find(s => s.id === item.id).automaticSummaryCallCap);
                }
                report.summaries = report.summaries.filter(s => s.id !== item.id || s.context !== context);
                report.summaries.push({ id: item.id, context, calls: generations.length - start, steps,
                    response: fixture ? 'Local marker summaries; no provider fidelity evidence' : 'Real automatic Main API summaries; individual outputs and usage retained in generations' });
                assert(steps.length > 0);
                // Save/reload restores the host's latest summary; freeze for the answer
                // so its render event cannot race the outgoing-prompt observation.
                await page.evaluate(async () => { const c = SillyTavern.getContext(); c.extensionSettings.memory.memoryFrozen = true; await c.saveChat(); await c.reloadCurrentChat(); });
                stage = stage.replace('/summary-replay', '');
            }
            if (mode === 'sillymemory') { await field('enabled').check(); await status('synchronized'); }
            saved = { ...await generate(item.question), nativeDocuments,
                memoryDocuments: mode === 'sillymemory' ? [...memoryDocs.values()].filter(d => d.stage === stage).length : 0,
                armElapsedMs: Date.now() - armStarted };
            if (saved.successfulCompletions !== 1 || !saved.record) {
                await durable.call(`failed-observation/${stage}/${report.sessions.length}`, { task: stage }, {}, async () => saved);
                throw new Error('No single completed answer; failed observation retained separately');
            }
            await durable.call(`observation/${stage}`, { task: stage }, {}, async () => saved);
            if (stopAfterObservation) throw new Error('Intentional fixture interruption after durable observation');
            } else saved = (await durable.call(`observation/${stage}`, { task: stage }, {}, async () => { throw new Error('Missing saved observation'); })).value;
            const { observation, request, record } = saved;
            const coverage = validateObservation(item, context, mode, saved, plan.generator.maxOutputTokens, { requirePreparedMemory: false });
            report.rows.push({ id: item.id, context, mode, inputSha256: item.inputSha256, ...coverage,
                finalMessages: request.messages.length,
                hostPromptTokens: observation.hostPromptTokens, hostPromptBudget: observation.hostPromptBudget,
                tokenObservation: 'Non-dry-run CHAT_COMPLETION_PROMPT_READY; captured prompt matches bridge messages by hash',
                finalContentTokenEstimate: request.messages.reduce((n, m) => n + count(m.content) + 6, 0),
                promptSha256: sha(JSON.stringify(request.messages)), nativeDocuments: saved.nativeDocuments,
                memoryDocuments: saved.memoryDocuments,
                answer: record.answer, usage: record.usage, armElapsedMs: saved.armElapsedMs,
                nativePromptDelivered: mode === 'vectors' && Boolean(observation.native), nativeNoInjection: mode === 'vectors' && !observation.native, summaryDelivered: mode === 'summary',
                delivery: mode === 'sillymemory' ? observation.delivery : null,
                sourcePreserved: true, questionDelivered: true });
            if (mode === 'vectors') report.nativeBarriers.push({ stage, ...await native.suspend() });
            assert.deepEqual(errors, []); await checkpoint();
            await judgeRow(report.rows.at(-1));
        }
    }

    assert.deepEqual(errors, []); assert.equal(report.rows.length, fixture ? 5 : 70);
    report.passed = true;
} catch (e) {
    const message = e.message.split('\n')[0].slice(0, 240);
    report.failure = { stage, message }; console.error(`FAILED ${stage}: ${message}`); process.exitCode = 1;
} finally {
    report.cleanupResults = { native: false, remote: false };
    if (page) {
        try { await native.suspend(); } catch { errors.push('Native drain failed'); }
        stage = 'cleanup';
        try { if (await page.locator('[data-sm="enabled"]').isChecked()) await page.locator('[data-sm="enabled"]').uncheck(); } catch {}
        try { report.cleanupResults.native = await purgeNativeCollections(page); } catch { errors.push('Native cleanup failed'); }
        try { await cleanOwned(); report.cleanupResults.remote = true; } catch { errors.push('Owned remote cleanup remains pending'); }
    }
    native?.close(); await browser?.close();
    if (host && host.exitCode === null) { const done = once(host, 'exit'); host.kill('SIGTERM'); await done; }
    if (bridge.listening) await new Promise(r => bridge.close(r));
    if (remote?.listening) await new Promise(r => remote.close(r));
    encoder.free(); embeddingEncoder.free();
    if (hostAdded) git('-C', hostSource, 'worktree', 'remove', '--force', source);
    await rm(work, { recursive: true, force: true });
    report.cleanup = report.cleanupResults.native !== false && report.cleanupResults.remote;
    report.owned = Object.values(durable.state.observations).filter(o => o.value.collection).map(o => o.value);
    report.providerReservations = ledger.state.used; report.lambdaReservations = durable.state.used;
    if (!report.cleanup || errors.length) { report.passed = false; process.exitCode = 1; }
    report.finishedAt = new Date().toISOString(); report.errors = errors;
    Object.assign(report.sessions.at(-1), { finishedAt: report.finishedAt, errors, failure: report.failure || null, cleanup: report.cleanup });
    await checkpoint(); await ledger.close(); await durable.close();
    console.log(JSON.stringify({ passed: report.passed, rows: report.rows.length, cleanup: report.cleanup, output }));
}
