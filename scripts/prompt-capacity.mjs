import { emulatorCors } from './emulator-cors.mjs';
// Real pinned host/Chromium/direct CORS, local LambdaDB and completion emulators only.
// Does not load .env.local. Never supply a personal profile or real credentials.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer as httpsServer } from 'node:https';
import { createServer as httpServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capacityPlan as plan, capacityChat, capacityInstructions } from './prompt-capacity-cases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-prompt-capacity';
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts/prompt-capacity.json'));
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), plan.host);
assert.equal(await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), root);
const sourceFiles = ['index.js', 'src/chat-collections.js', 'manifest.json', 'src/client.js', 'src/context.js', 'src/gate.js', 'src/memory.js', 'src/status.js', 'scripts/prompt-capacity.mjs', 'scripts/emulator-cors.mjs', 'scripts/prompt-capacity-cases.mjs'];
const hostFiles = ['public/script.js', 'public/scripts/openai.js', 'public/scripts/PromptManager.js', 'public/scripts/tokenizers.js', 'src/endpoints/tokenizers.js', 'src/endpoints/backends/chat-completions.js', 'package-lock.json'];
async function hashes() {
    return Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])));
}
async function hostHashes() {
    return Object.fromEntries(await Promise.all(hostFiles.map(async file => {
        const data = await readFile(path.join(source, file));
        assert.deepEqual(data, execFileSync('git', ['-C', source, 'show', `${plan.host}:${file}`]), `Unmodified host source: ${file}`);
        return [file, createHash('sha256').update(data).digest('hex')];
    })));
}
const frozen = { plan, sourceSha256: await hashes(), hostSha256: await hostHashes(), time: new Date().toISOString() };
await mkdir(path.dirname(output), { recursive: true });
// No overwrite: a failed attempt remains available under its own filename.
await writeFile(`${output}.plan.json`, JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-capacity-'));
const cert = path.join(work, 'cert.pem'), key = path.join(work, 'key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
const collections = new Map(), requests = [], generations = [], rows = [], errors = [];
const send = (res, status, body = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
async function json(req) { const buffers = []; for await (const b of req) buffers.push(b); return buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {}; }
const remote = httpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
        if (emulatorCors(req, res)) return;
    try {
        const body = await json(req), parts = new URL(req.url, 'https://localhost').pathname.split('/').filter(Boolean), name = parts[3];
        assert.equal(req.headers['x-api-key'], 'synthetic-session-key');
        assert.ok(!req.headers.cookie && !req.headers['x-csrf-token']);
        assert.deepEqual(parts.slice(0, 3), ['projects', 'synthetic', 'collections']);
        requests.push({ method: req.method, operation: parts.slice(4).join('/') || (name ? 'collection' : 'create') });
        if (!name && req.method === 'POST') {
            assert.equal(body.indexConfigs.embedding.managedEmbedding, true);
            assert.ok(!collections.has(body.collectionName));
            collections.set(body.collectionName, { definition: body, docs: new Map() });
            return send(res, 201, { collection: body });
        }
        if (!name && req.method === 'GET') return send(res, 200, { collections: [...collections.values()].map(c => c.definition) });
        const c = collections.get(name); if (!c) return send(res, 404);
        if (parts.length === 4 && req.method === 'GET') return send(res, 200, { collection: c.definition });
        if (parts.length === 4 && req.method === 'DELETE') { collections.delete(name); return send(res, 200); }
        if (parts[4] === 'docs' && parts[5] === 'upsert') { body.docs.forEach(d => c.docs.set(d.id, d)); return send(res, 202); }
        if (parts[4] === 'docs' && parts[5] === 'delete') { body.ids.forEach(id => c.docs.delete(id)); return send(res, 202); }
        if (parts[4] === 'query') {
            const filter = body.query.knn?.filter || body.query;
            const match = /^owner:([a-f0-9]+) AND scope:([a-f0-9]+)$/.exec(filter.queryString?.query || '');
            assert.ok(match);
            if (body.query.knn) assert.equal(typeof body.query.knn.queryText, 'string');
            // Fixed source order, deliberately no embeddings or ANN simulation.
            const docs = [...c.docs.values()].filter(d => d.owner === match[1] && d.scope === match[2]);
            return send(res, 200, { docs: docs.map(doc => ({ collection: name, doc })), isDocsInline: true, total: docs.length, took: 1 });
        }
        throw new Error('Unexpected emulator operation');
    } catch (error) { errors.push(error.message); send(res, 500); }
});
const bridge = httpServer(async (req, res) => {
    try {
        if (req.url === '/v1/models') return send(res, 200, { data: [{ id: plan.model }] });
        assert.equal(req.url, '/v1/chat/completions');
        const body = await json(req); assert.equal(body.model, plan.model); assert.equal(body.stream, false);
        generations.push(body);
        send(res, 200, { id: 'local-capacity-fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'LOCAL_FIXTURE_OK' }, finish_reason: 'stop' }] });
    } catch (error) { errors.push(error.message); send(res, 500); }
});
let server, browser, page;
const report = { ...frozen, evidence: 'Real SillyTavern/Chromium/direct CORS; emulated LambdaDB and generation; no live embeddings or model', rows };
try {
    await new Promise(r => remote.listen(0, '127.0.0.1', r));
    await new Promise(r => bridge.listen(0, '127.0.0.1', r));
    const endpoint = `https://127.0.0.1:${remote.address().port}`;
    const bridgeUrl = `http://127.0.0.1:${bridge.address().port}/v1`;
    const port = Number(process.env.ST_CAPACITY_PORT || 18134), url = `http://127.0.0.1:${port}`;
    const configPath = path.join(work, 'config.yaml');
    await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'false'], {
        cwd: source, env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_EXTRA_CA_CERTS: cert }, stdio: 'ignore',
    });
    let ready = false;
    for (let i = 0; i < 90; i++) {
        assert.equal(server.exitCode, null, 'Host remains running');
        try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    assert.ok(ready, 'Host startup');
    const profilePath = path.join(work, 'data/default-user/settings.json');
    const profile = JSON.parse(await readFile(profilePath, 'utf8'));
    profile.main_api = 'openai'; // Avoid the default remote Horde connection.
    await writeFile(profilePath, JSON.stringify(profile));
    browser = await chromium.launch(); page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => [url, endpoint].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor();
    await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.evaluate(async ({ bridgeUrl, plan }) => {
        const { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { custom_url: bridgeUrl, custom_model: plan.model, custom_include_headers: '', custom_include_body: '', custom_exclude_body: '', custom_prompt_post_processing: '', stream_openai: false, squash_system_messages: false, temp_openai: 0 });
        const { saveSettings } = await import('/script.js'); await saveSettings();
        const c = SillyTavern.getContext(), data = new FormData();
        data.set('ch_name', 'Mira'); data.set('description', plan.character); data.set('first_mes', 'Synthetic capacity test.');
        const response = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data });
        if (!response.ok) throw new Error('Character creation failed');
    }, { bridgeUrl, plan });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.locator('#rightNavHolder .drawer-toggle').click();
    await page.locator('.character_select').filter({ hasText: 'Mira' }).click();
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const waitStatus = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text);
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#sillymemory .inline-drawer-toggle').click();
    await field('endpoint').fill(endpoint); await field('project').fill('synthetic'); await field('key').fill('synthetic-session-key');
    await field('connect').click(); await field('gate').click(); await waitStatus('Transport gate passed');
    assert.equal(collections.size, 0);
    await field('provision').click(); await waitStatus('Chat memory is ready');
    for (const name of ['recent', 'budget']) { await field(name).fill(String(plan[name])); await field(name).dispatchEvent('change'); }

    // Observe the real methods; no host accounting or extension behavior is replaced.
    await page.evaluate(async () => {
        const { promptManager } = await import('/scripts/openai.js');
        const { countTokensOpenAIAsync, getTokenizerModel } = await import('/scripts/tokenizers.js');
        const c = SillyTavern.getContext();
        const original = globalThis.sillymemory_intercept;
        globalThis.sillymemory_intercept = async (chat, contextSize, ...args) => {
            const before = JSON.stringify(c.chat);
            await original(chat, contextSize, ...args);
            const memory = chat.filter(m => m.mes.startsWith('[Past conversation excerpt:'));
            const mapped = await Promise.all(chat.map(async ({ mes, is_user, index }) => ({ mes, is_user, index, nativeTokens: await countTokensOpenAIAsync({ role: is_user ? 'user' : 'assistant', content: mes }) })));
            globalThis.capacityObservation.hook = { contextSize, tokenizerModel: getTokenizerModel(), sourceUnchanged: before === JSON.stringify(c.chat), chat: mapped, memoryTextTokens: await c.getTokenCountAsync(memory.map(m => m.mes).join('\n')), inspection: document.querySelector('[data-sm="inspection"]').textContent };
        };
        const originalSet = promptManager.setChatCompletion;
        promptManager.setChatCompletion = function (completion) {
            if (globalThis.capacityObservation?.hook) {
                globalThis.capacityObservation.accounting = {
                    remaining: completion.tokenBudget, total: completion.getTotalTokenCount(),
                    collections: completion.getMessages().collection.filter(Boolean).map(item => ({ id: item.identifier, tokens: item.getTokens() })),
                    messages: completion.getMessages().collection.filter(Boolean).flatMap(item => (item.collection || [item]).map(m => ({ id: m.identifier, role: m.role, content: m.content, tokens: m.getTokens() }))),
                    chat: structuredClone(completion.getChat()),
                };
            }
            return originalSet.call(this, completion);
        };
        c.eventSource.on(c.eventTypes.CHAT_COMPLETION_PROMPT_READY, data => { if (!data.dryRun && globalThis.capacityObservation?.hook) globalThis.capacityObservation.ready = structuredClone(data.chat); });
    });
    for (const spec of plan.cases) {
        console.log(`MEASURE ${spec.id}`);
        if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await page.evaluate(async ({ spec, chat, instructions }) => {
            const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
            Object.assign(oai_settings, { openai_max_context: spec.context, openai_max_tokens: spec.output });
            oai_settings.prompts.find(p => p.identifier === 'main').content = instructions;
            c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
        }, { spec, chat: capacityChat(spec.recentRepeats), instructions: capacityInstructions(spec.instructions) });
        if (spec.enabled) { await field('enabled').check(); await waitStatus('synchronized'); }
        const requestStart = generations.length;
        const observation = await page.evaluate(async question => {
            globalThis.capacityObservation = {};
            document.querySelector('#send_textarea').value = question;
            await SillyTavern.getContext().generate('normal');
            return { ...globalThis.capacityObservation, answer: SillyTavern.getContext().chat.at(-1)?.mes };
        }, plan.question);
        assert.equal(generations.length, requestStart + 1, 'Exactly one real host completion request');
        const request = generations.at(-1);
        rows.push({ spec, ...observation, request });
        assert.equal(observation.answer, 'LOCAL_FIXTURE_OK');
        assert.equal(observation.hook.contextSize, spec.context - spec.output);
        assert.equal(observation.hook.sourceUnchanged, true);
        assert.deepEqual(observation.ready, request.messages);
        assert.deepEqual(observation.accounting.chat, request.messages);
        assert.equal(observation.accounting.total + observation.accounting.remaining + 3, observation.hook.contextSize, 'Native ledger includes three reserved reply tokens');
        assert.ok(observation.accounting.remaining >= 0);
        assert.equal(request.max_tokens, spec.output);
    }
    page.once('dialog', dialog => dialog.accept()); await field('delete').click(); await waitStatus('no longer accessible');
    assert.equal(collections.size, 0);
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    assert.ok(!stored.includes('synthetic-session-key'));
    assert.ok(!(await readFile(profilePath, 'utf8')).includes('synthetic-session-key'));
    assert.deepEqual(errors, []);
    assert.deepEqual(await hashes(), frozen.sourceSha256, 'Measured sources remain frozen');
    assert.deepEqual(await hostHashes(), frozen.hostSha256, 'Measured host sources remain frozen');
    Object.assign(report, { passed: true, node: process.version, browser: browser.version(), requests, remainingCollections: collections.size, sessionKeyAbsentFromStorage: true });
} catch (error) {
    Object.assign(report, { passed: false, failure: error.message, errors, remainingCollections: collections.size });
    console.error('Capacity status:', await page?.locator('[data-sm="status"]').innerText().catch(() => 'unavailable'));
    throw error;
} finally {
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    if (server && server.exitCode === null) { const exited = new Promise(r => server.once('exit', r)); server.kill('SIGTERM'); await exited; }
    await Promise.all([new Promise(r => remote.close(r)), new Promise(r => bridge.close(r))]);
    await rm(work, { recursive: true, force: true });
}
console.log(`PASS ${rows.length} capacity cases; ${output}`);
