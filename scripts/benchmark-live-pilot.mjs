// Real pinned host, native vector backend, OpenAI and LambdaDB managed embeddings.
// Public frozen development cases only. Credentials never enter reports or disk profiles.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { parseEnv } from 'node:util';
import { createBudget, LIMITS } from './benchmark-live-budget.mjs';
import { requestWithRetry } from './provider-retry.mjs';
import { createSpacedSender, PROVIDER_SPACING, summarizeProviderSpacing } from './provider-spacing.mjs';
import { indexNative, purgeNativeCollections } from './three-mode-native.mjs';
import { once } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { hostRevision, readVerifiedFile, sha } from './benchmark-audit.mjs';
import { prepareHostCase, sourceView, promptCoverage } from './benchmark-host-input.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostSource = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const [cache, output, envFile, previousFile] = process.argv.slice(2);
assert(cache && output && envFile && [5, 6].includes(process.argv.length), 'Usage: benchmark-live-pilot.mjs <dataset-cache> <new-report.json> <env-file> [interrupted-report.json]');
const env = parseEnv(await readFile(envFile, 'utf8'));
assert.equal(env.LLM_BASE_URL.replace(/\/$/, ''), 'https://api.openai.com/v1');
assert.equal(env.LLM_MODEL, 'gpt-4.1-mini-2025-04-14');
for (const key of ['LLM_API_KEY', 'LAMBDADB_BASE_URL', 'LAMBDADB_PROJECT_NAME', 'LAMBDADB_PROJECT_API_KEY']) assert(env[key], `Missing ${key}`);
const endpoint = new URL(env.LAMBDADB_BASE_URL).origin;
assert.equal(new URL(endpoint).protocol, 'https:');
const previousBytes = previousFile ? await readFile(previousFile) : null;
const previous = previousBytes ? JSON.parse(previousBytes) : null;
if (previous) {
    assert(previous.cleanup && previous.rows.length === 5 && previous.generations.length === 60, 'Only the recorded interrupted pilot is recoverable');
    assert.equal(previous.failure?.stage, 'eeda8a6d_abs/32768/vectors');
    assert(previous.generations.every(g => g.status === 200 && g.finishReason === 'stop'));
    assert(Date.now() - Date.parse(previous.finishedAt) >= 15000, 'Cross-run provider spacing');
}
const startedAt = Date.now(), budget = createBudget(previous ? structuredClone(previous.budget) : {});
const retryBudget = previous ? structuredClone(previous.retryBudget) : { calls: 0, retries: 0 };
const scorer = await readFile(path.join(cache, 'evaluate_qa.py'));
assert.equal(sha(scorer), 'ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('-C', hostSource, 'rev-parse', 'HEAD'), hostRevision);
const read = name => readFile(path.join(root, name));
const planBytes = await read('docs/benchmarks/pilot-design-v1.json'), plan = JSON.parse(planBytes);
const lockBytes = await read('docs/benchmarks/sources-v1.json'), lock = JSON.parse(lockBytes);
const selectionBytes = await read('docs/benchmarks/selection-v1.json');
const preflightBytes = await read('docs/benchmarks/host-preflight-v1.json');
const preflight = JSON.parse(preflightBytes);
assert(preflight.passed && preflight.cleanup && preflight.rows.length === 16);
assert.equal(preflight.planSha256, sha(planBytes));
assert.equal(sha(lockBytes), plan.sourceSha256);
assert.equal(sha(selectionBytes), plan.selectionSha256);
assert.equal(plan.hostRevision, hostRevision);
if (previous) { assert.equal(sha(previousBytes), sha(await read('docs/benchmarks/live-pilot-interrupted-v1.json')), 'Recovery requires the preserved interrupted report'); const { recordedSource } = await import('./recorded-source.mjs'); for (const [file, hash] of Object.entries(previous.sourceSha256ByFile)) recordedSource(file, hash); assert.equal(previous.planSha256, sha(planBytes)); assert.equal(previous.sourceSha256, sha(lockBytes)); assert.equal(previous.hostRevision, hostRevision); }
const data = readVerifiedFile(cache, lock.files.find(f => f.dataset === 'longmemeval'));
const cases = plan.cases.map(sample => prepareHostCase(data[sample.sourceIndex], sample));
const require = createRequire(path.join(hostSource, 'package.json'));
assert.equal(JSON.parse(await readFile(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
const encoder = require('tiktoken').get_encoding('o200k_base');
const count = text => encoder.encode(text, [], []).length;
const embeddingEncoder = require('tiktoken').get_encoding('cl100k_base');
const embeddingCount = text => embeddingEncoder.encode(text, [], []).length;
const report = { version: 'longmemeval-live-pilot-v1', passed: false,
    evidence: 'Real pinned SillyTavern/Chromium, OpenAI and LambdaDB managed embeddings; two development questions, not benchmark accuracy.',
    hostRevision, nodeVersion: process.version, planSha256: sha(planBytes), sourceSha256: sha(lockBytes),
    preflightSha256: sha(preflightBytes), questions: cases.map(c => ({ id: c.id, question: c.question, inputSha256: c.inputSha256 })),
    startedAt: new Date(startedAt).toISOString(), limits: LIMITS, budget: budget.state, retryBudget,
    generator: plan.generator, judge: 'gpt-4o-2024-08-06', scorerSha256: sha(scorer),
    scorerRevision: '9e0b455f4ef0e2ab8f2e582289761153549043fc', providerSpacing: PROVIDER_SPACING,
    sourceSha256ByFile: {}, rows: [], summaries: [], generations: [], embeddings: [], owned: [],
    traffic: { vector: [], lambda: [], browserBlocked: 0, hostBlocked: 0 }, cleanup: false };
if (previous) {
    report.continuation = { reportSha256: sha(previousBytes), priorFinishedAt: previous.finishedAt,
        failure: previous.failure, errors: previous.errors,
        recovery: 'Reuse successful calls; derive the unrecorded native outgoing coverage from identical plain-mode payload hash. Native host token counter/source snapshot was not retained.' };
    for (const key of ['rows', 'summaries', 'embeddings', 'owned', 'traffic']) report[key] = structuredClone(previous[key]);
    report.generations = previous.generations.map(g => ({ ...structuredClone(g), run: 0 }));
    const baseline = previous.rows.find(r => r.id === 'eeda8a6d_abs' && r.mode === 'off');
    const native = previous.generations.find(g => g.stage === 'eeda8a6d_abs/32768/vectors');
    assert.equal(native.promptSha256, baseline.promptSha256, 'Cannot recover changed outgoing content');
    report.rows.push({ ...structuredClone(baseline), mode: 'vectors', answer: native.answer, usage: native.usage,
        nativeDocuments: previous.traffic.vector.filter(r => r.stage === native.stage && r.operation === 'insert').reduce((n, r) => n + r.count, 0),
        nativePromptDelivered: false, nativeNoInjection: true, hostPromptTokens: null, sourcePreserved: null,
        tokenObservation: 'Recovered outgoing content by exact hash equality to the plain row; native host counter/source snapshot not retained',
        recoveredFromIdenticalPrompt: baseline.promptSha256, armElapsedMs: null, judge: undefined });
}
const ownedBefore = report.owned.length;
for (const file of ['scripts/benchmark-live-pilot.mjs', 'scripts/benchmark-live-budget.mjs', 'scripts/three-mode-native.mjs', 'scripts/provider-retry.mjs', 'scripts/provider-spacing.mjs', 'scripts/benchmark-host-input.mjs',
    'scripts/benchmark-live-network.cjs', 'scripts/benchmark-audit.mjs', 'index.js', 'manifest.json',
    'src/memory.js', 'src/context.js', 'src/client.js', 'src/gate.js', 'src/delivery.js', 'src/status.js']) {
    report.sourceSha256ByFile[file] = sha(await read(file));
}
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
let checkpointTail = Promise.resolve();
const checkpoint = () => { const text = JSON.stringify(report, null, 2) + '\n'; checkpointTail = checkpointTail.then(async () => { await writeFile(output + '.tmp', text); await (await import('node:fs/promises')).rename(output + '.tmp', output); }); return checkpointTail; };
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-benchmark-live-'));
const source = path.join(work, 'host');
let host, browser, page, hostAdded = false, stage = 'setup', summarySignal = 0;
const generations = [], errors = [], memoryDocs = new Map(), nativeInFlight = new Set();
const send = (res, status, body = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const json = async req => { const parts = []; for await (const chunk of req) parts.push(chunk); return JSON.parse(Buffer.concat(parts).toString() || '{}'); };
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const deadline = () => assert(Date.now() - startedAt < LIMITS.durationMs, 'Pilot duration exceeded');
const auth = { Authorization: `Bearer ${env.LLM_API_KEY}`, 'Content-Type': 'application/json' };
const spaced = createSpacedSender(async (body, signal) => {
    deadline(); budget.completion(JSON.parse(body).model); await checkpoint();
    return fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: auth, body, signal });
});
async function completion(body, phase) {
    deadline(); const judge = phase.endsWith('/judge');
    const existing = report.generations.filter(g => g.stage === phase).length;
    const sampleCap = phase.endsWith('/summary-replay') ? plan.cases.find(c => phase.startsWith(c.id + '/'))?.automaticSummaryCallCap : 1;
    assert(existing < sampleCap, 'Logical completion cap');
    assert.equal(body.model, judge ? report.judge : plan.generator.model);
    assert.equal(body.max_tokens, judge ? 10 : 1024); assert.equal(body.temperature, 0);
    assert.equal(body.stream ?? false, false);
    const estimate = body.messages.reduce((n, m) => n + count(m.content) + 6, 0);
    assert(estimate <= (judge ? 4000 : 32700), 'Completion input reservation exceeded');
    const record = { stage: phase, run: previous ? 1 : 0, model: body.model, promptSha256: sha(JSON.stringify(body.messages)),
        contentTokenEstimate: estimate, attempts: [], startedAt: Date.now() };
    report.generations.push(record);
    const response = await requestWithRetry({ body: JSON.stringify(body), send: spaced,
        budget: retryBudget, attempts: record.attempts, maxCalls: 125, checkpoint });
    record.status = response.status;
    assert(response.ok, `Provider completion HTTP ${response.status}`);
    const result = await response.json();
    record.answer = result.choices?.[0]?.message?.content; record.usage = result.usage;
    record.finishReason = result.choices?.[0]?.finish_reason;
    record.elapsedMs = Date.now() - record.startedAt;
    assert(typeof record.answer === 'string' && record.answer.length > 0, 'Empty provider completion');
    assert.equal(record.finishReason, 'stop', 'Truncated/incomplete provider completion');
    await checkpoint(); return { result, record };
}
const bridge = createServer(async (req, res) => {
    try {
        if (req.url === '/v1/models') return send(res, 200, { data: [{ id: plan.generator.model }] });
        const body = await json(req); deadline();
        if (req.url === '/v1/embeddings') {
            assert(stage.includes('/vectors'), 'Embedding request outside native arm');
            assert.equal(body.model, 'text-embedding-3-small');
            assert(Array.isArray(body.input) && body.input.length > 0 && body.input.length <= 10);
            assert(body.input.every(x => typeof x === 'string' && x.length <= 10000));
            const tokens = body.input.reduce((n, x) => n + embeddingCount(x) + 8, 0);
            budget.embedding(body.input.length, tokens);
            const record = { stage, inputs: body.input.length, reservedTokens: tokens, requestSha256: sha(JSON.stringify(body)) };
            report.embeddings.push(record); await checkpoint();
            const response = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: auth,
                body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
            record.status = response.status; assert(response.ok, `Native embedding HTTP ${response.status}`);
            const result = await response.json(); record.usage = result.usage; await checkpoint();
            return send(res, 200, result);
        }
        assert.equal(req.url, '/v1/chat/completions');
        const { result, record } = await completion(body, stage);
        generations.push({ stage, body, answer: record.answer, record });
        send(res, 200, result);
    } catch (e) { errors.push(e.message.split('\n')[0].slice(0, 160)); await checkpoint(); send(res, 502, { error: { message: 'Bounded benchmark request failed' } }); }
});

try {
    git('-C', hostSource, 'worktree', 'add', '--detach', source, hostRevision); hostAdded = true;
    await symlink(path.join(hostSource, 'node_modules'), path.join(source, 'node_modules'));
    const extensions = path.join(source, 'public/scripts/extensions/third-party');
    await mkdir(extensions, { recursive: true }); await symlink(root, path.join(extensions, 'sillymemory'));
    report.availability = [];
    for (const model of [plan.generator.model, report.judge, 'text-embedding-3-small']) {
        const response = await fetch(`https://api.openai.com/v1/models/${model}`, { headers: auth, signal: AbortSignal.timeout(30000) });
        report.availability.push({ model, status: response.status }); assert(response.ok, 'Pinned model unavailable');
    }
    const bridgeUrl = `http://127.0.0.1:${await listen(bridge)}/v1`;
    const probe = createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
    const url = `http://127.0.0.1:${port}`, config = path.join(work, 'config.yaml');
    await writeFile(config, await readFile(path.join(source, 'default/config.yaml')));
    host = spawn(process.execPath, ['--require', path.join(root, 'scripts/benchmark-live-network.cjs'),
        'server.js', '--configPath', config, '--dataRoot', path.join(work, 'data'), '--port', String(port),
        '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'false'], {
        cwd: source, env: { PATH: process.env.PATH, HOME: process.env.HOME, BENCHMARK_LAMBDA_HOST: new URL(endpoint).hostname }, stdio: ['ignore', 'ignore', 'pipe'] });
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
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/vector/')) nativeInFlight.add(request); });
    for (const event of ['requestfinished', 'requestfailed']) page.on(event, request => nativeInFlight.delete(request));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => {
        if (/Not enough messages in chat to summarize|Summary conditions not satisfied|Summary set to:/.test(message.text())) summarySignal++;
    });
    await page.route('**/*', async route => {
        const request = route.request(), target = new URL(request.url());
        if (target.origin !== url && target.origin !== endpoint) { report.traffic.browserBlocked++; return route.abort(); }
        try {
            if (target.origin === endpoint) {
                const remote = target;
                assert.equal(remote.origin, endpoint); assert.equal(remote.search, '');
                const prefix = `/projects/${encodeURIComponent(env.LAMBDADB_PROJECT_NAME)}/collections`;
                assert(remote.pathname === prefix || remote.pathname.startsWith(prefix + '/'));
                const parts = remote.pathname.slice(prefix.length).split('/').filter(Boolean);
                const body = request.postData() ? request.postDataJSON() : {};
                const operation = parts.slice(1).join('/') || (parts[0] ? 'collection' : 'create');
                const create = operation === 'create' && request.method() === 'POST';
                if (stage !== 'cleanup') {
                    deadline();
                    budget.lambda({ create, documents: body.docs?.length || 0,
                        tokens: (body.docs || []).reduce((n, d) => n + embeddingCount(d.text) + 8, 0) + (body.query?.knn ? embeddingCount(body.query.knn.queryText) + 8 : 0),
                        bytes: request.method() === 'POST' ? Buffer.byteLength(request.postData() || '') : 0 });
                } else assert(['GET', 'DELETE'].includes(request.method()), 'Cleanup cannot write documents');
                if (create) {
                    assert.equal(body.indexConfigs.embedding.managedEmbedding, true);
                    assert.equal(body.tags.application, 'sillymemory'); assert(/^[a-f0-9]+$/.test(body.tags.owner));
                    assert(/^(sillymemory|smtest)_[a-f0-9]{32}$/.test(body.collectionName));
                    report.owned.push({ collection: body.collectionName, owner: body.tags.owner });
                } else assert(report.owned.some(c => c.collection === parts[0]), 'Unowned remote target');
                if (body.docs) { assert(body.docs.length <= 50); for (const d of body.docs) memoryDocs.set(d.id, { scope: d.scope, stage }); }
                const entry = { stage, method: request.method(), operation, count: body.docs?.length ?? body.ids?.length };
                report.traffic.lambda.push(entry);
                const onResponse = response => { if (response.request() === request) { entry.status = response.status(); page.off('response', onResponse); } };
                page.on('response', onResponse); await checkpoint();
            }
            if (target.pathname.startsWith('/api/vector/')) {
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

    async function reset(chat, id, context) {
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
            if (snapshots.length !== 1) throw new Error('Expected one non-dry-run prompt-ready snapshot');
            return { chat: c.chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user })),
                native: c.extensionPrompts['3_vectors']?.value || '', summary: c.extensionPrompts['1_memory']?.value || '',
                promptReady: snapshots[0].prompt, hostPromptTokens: snapshots[0].tokens,
                hostPromptBudget: getMaxPromptTokens(),
                delivery: document.querySelector('[data-sm="delivery"]').textContent };
        }, question);
        assert.equal(generations.length, start + 1, 'One successful completion per answer');
        assert.equal(sha(JSON.stringify(observation.promptReady)), sha(JSON.stringify(generations.at(-1).body.messages)), 'Prompt-ready snapshot matches completion transport');
        return { observation, request: generations.at(-1).body };
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
            const { record: judged } = await completion({ model: report.judge, messages: [{ role: 'user', content: judgePrompt }], temperature: 0, max_tokens: 10, stream: false }, `${row.id}/${row.context}/${row.mode}/judge`);
            row.judge = { response: judged.answer, correct: judged.answer.toLowerCase().includes('yes'), exactYesNo: /^(yes|no)\.?$/i.test(judged.answer.trim()), promptSha256: judged.promptSha256 };
            await checkpoint();
    }
    if (previous) await judgeRow(report.rows.at(-1));
    for (const item of cases) for (const context of [plan.pilotContext]) {
        for (const mode of Object.keys(plan.arms)) {
            if (report.rows.some(r => r.id === item.id && r.context === context && r.mode === mode)) continue;
            stage = `${item.id}/${context}/${mode}`; console.log(`LIVE ${stage}`);
            const armStarted = Date.now();
            await reset(mode === 'summary' ? [] : item.chat, stage.replaceAll('/', '-'), context);
            const restored = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user })));
            assert.equal(sha(JSON.stringify(restored)), sha(JSON.stringify(sourceView(mode === 'summary' ? [] : item.chat))), 'Restored source hash');
            let nativeDocuments = 0;
            if (mode === 'vectors') {
                await indexNative(page);
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
                report.summaries.push({ id: item.id, context, calls: generations.length - start, steps,
                    response: 'Real automatic Main API summaries; individual outputs and usage retained in generations' });
                assert(steps.length > 0);
                // Save/reload restores the host's latest summary; freeze for the answer
                // so its render event cannot race the outgoing-prompt observation.
                await page.evaluate(async () => { const c = SillyTavern.getContext(); c.extensionSettings.memory.memoryFrozen = true; await c.saveChat(); await c.reloadCurrentChat(); });
                stage = stage.replace('/summary-replay', '');
            }
            if (mode === 'sillymemory') { await field('enabled').check(); await status('synchronized'); }
            const { observation, request } = await generate(item.question);
            assert.equal(sha(JSON.stringify(observation.chat.slice(0, item.chat.length))), sha(JSON.stringify(sourceView(item.chat))), 'Source preserved through generation');
            assert.equal(observation.chat.length, item.chat.length + 2);
            assert(request.messages.some(m => m.role === 'user' && m.content.includes(item.question)), 'Dated question delivered');
            const coverage = promptCoverage(item.chat, request.messages);
            assert.equal(request.max_tokens, plan.generator.maxOutputTokens);
            assert.equal(observation.hostPromptBudget, context - plan.generator.maxOutputTokens);
            assert(observation.hostPromptTokens > 0 && observation.hostPromptTokens <= observation.hostPromptBudget);
            if (mode === 'off' && context === 131072) assert.equal(coverage.exactNativeRoleMessages, item.chat.length);
            if (mode === 'off' && context === 32768) assert(coverage.exactNativeRoleMessages < item.chat.length);
            if (mode === 'vectors' && observation.native) assert(request.messages.some(m => m.content.includes(observation.native.trim())));
            if (mode === 'summary') assert(observation.summary && request.messages.some(m => m.content.includes(observation.summary)));
            if (mode === 'sillymemory') assert.match(observation.delivery, /^Final host prompt:/);
            report.rows.push({ id: item.id, context, mode, inputSha256: item.inputSha256, ...coverage,
                finalMessages: request.messages.length,
                hostPromptTokens: observation.hostPromptTokens, hostPromptBudget: observation.hostPromptBudget,
                tokenObservation: 'Non-dry-run CHAT_COMPLETION_PROMPT_READY; captured prompt matches bridge messages by hash',
                finalContentTokenEstimate: request.messages.reduce((n, m) => n + count(m.content) + 6, 0),
                promptSha256: sha(JSON.stringify(request.messages)), nativeDocuments,
                memoryDocuments: mode === 'sillymemory' ? [...memoryDocs.values()].filter(d => d.stage === stage).length : 0,
                answer: generations.at(-1).answer, usage: generations.at(-1).record.usage, armElapsedMs: Date.now() - armStarted,
                nativePromptDelivered: mode === 'vectors' && Boolean(observation.native), nativeNoInjection: mode === 'vectors' && !observation.native, summaryDelivered: mode === 'summary',
                delivery: mode === 'sillymemory' ? observation.delivery : null,
                sourcePreserved: true, questionDelivered: true });
            assert.deepEqual(errors, []); await checkpoint();
            await judgeRow(report.rows.at(-1));
        }
    }

    report.spacing = [...new Set(report.generations.map(g => g.run))].map(run => ({ run, ...summarizeProviderSpacing(report.generations.filter(g => g.run === run), PROVIDER_SPACING) }));
    assert.deepEqual(errors, []); assert.equal(report.rows.length, 8);
    report.passed = true;
} catch (e) {
    // Assertion diffs can contain entire source dialogues. Keep failure output bounded.
    const message = e.message.split('\n')[0].slice(0, 240);
    report.failure = { stage, message }; console.error(`FAILED ${stage}: ${message}`);
    process.exitCode = 1;
} finally {
    // Let already-started native synchronization settle before purging; disabling
    // the checkbox alone does not cancel its outstanding backend request.
    if (page) {
        try {
            await page.evaluate(() => { $('#vectors_enabled_chats').prop('checked', false).trigger('input'); SillyTavern.getContext().extensionSettings.memory.memoryFrozen = true; });
            const end = Date.now() + 65000;
            do { await new Promise(r => setTimeout(r, 1000)); } while (nativeInFlight.size && Date.now() < end);
            assert.equal(nativeInFlight.size, 0, 'Native requests did not settle before cleanup');
        } catch { report.passed = false; process.exitCode = 1; errors.push('Native drain failed'); }
    }
    stage = 'cleanup'; report.cleanupResults = { native: false, remote: previous ? structuredClone(previous.cleanupResults.remote) : [] };
    if (page) {
        try { if (await page.locator('[data-sm="enabled"]').isChecked()) await page.locator('[data-sm="enabled"]').uncheck(); } catch {}
        try { report.cleanupResults.native = [...(previous?.cleanupResults.native || []), ...await purgeNativeCollections(page)]; } catch { report.cleanupResults.native = false; }
        for (const owned of report.owned.slice(ownedBefore)) {
            try {
                await page.evaluate(async ({ endpoint, project, key, owned }) => {
                    const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
                    const c = SillyTavern.getContext();
                    const client = new LambdaClient({ endpoint, project }, key);
                    await client.deleteOwnedCollection(owned.collection, owned.owner); client.forget();
                }, { endpoint, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY, owned });
                report.cleanupResults.remote.push({ collection: owned.collection, inaccessible: true });
            } catch { report.cleanupResults.remote.push({ collection: owned.collection, inaccessible: false }); }
        }
    }
    await browser?.close();
    if (host && host.exitCode === null) { const done = once(host, 'exit'); host.kill('SIGTERM'); await done; }
    if (bridge.listening) await new Promise(r => bridge.close(r));
    encoder.free(); embeddingEncoder.free();
    if (hostAdded) git('-C', hostSource, 'worktree', 'remove', '--force', source);
    await rm(work, { recursive: true, force: true });
    report.cleanup = report.cleanupResults.native !== false && report.cleanupResults.remote.length === report.owned.length && report.cleanupResults.remote.every(r => r.inaccessible);
    if (!report.cleanup) { report.passed = false; process.exitCode = 1; }
    report.finishedAt = new Date().toISOString(); report.errors = errors; await checkpoint();
    console.log(JSON.stringify({ passed: report.passed, rows: report.rows.length, cleanup: report.cleanup, output }));
}
