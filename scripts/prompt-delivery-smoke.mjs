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
import { capacityPlan, capacityChat, capacityInstructions } from './prompt-capacity-cases.mjs';
import { hostSource, loadLong } from './semantic-long.mjs';

const packingRanks = JSON.parse(await readFile(new URL('../tests/fixtures/packing-ranks.json', import.meta.url)));
const packingFixture = { item: loadLong().cases.find(item => item.id === packingRanks.case), original: packingRanks };
assert.ok(packingFixture);

const base = { enabled: true, context: 1536, output: 256, instructions: 1, recentRepeats: 1, stopOnLoss: true, type: 'normal' };
const plan = { ...capacityPlan, cases: [
    { ...base, id: 'included' },
    { ...base, id: 'speaker-prefix', names: 2 },
    { ...base, id: 'substring-collision', context: 4096, noHits: true, collision: true, blocked: true },
    { ...base, id: 'pressure-stopped', recentRepeats: 100, blocked: true },
    { ...base, id: 'pressure-warning', recentRepeats: 100, stopOnLoss: false },
    { ...base, id: 'pressure-streaming', recentRepeats: 100, streaming: true, blocked: true },
    { ...base, id: 'pressure-swipe', recentRepeats: 100, type: 'swipe', blocked: true },
    { ...base, id: 'pressure-regenerate', recentRepeats: 100, type: 'regenerate', blocked: true },
    { ...base, id: 'recovered-context', recentRepeats: 100, context: 4096 },
    { ...base, id: 'continue', type: 'continue' },
    { ...base, id: 'no-hits-pressure', recentRepeats: 100, noHits: true, blocked: true },
    { ...base, id: 'no-hits-small', noHits: true },
    { ...base, id: 'disabled', enabled: false, recentRepeats: 100 },
] };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-prompt-delivery';
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts/prompt-delivery.json'));
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), plan.host);
assert.equal(await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), root);
const sourceFiles = ['index.js', 'src/chat-collections.js', 'manifest.json', 'src/chunking.js', 'src/client.js', 'src/context.js', 'src/gate.js', 'src/memory.js', 'src/status.js', 'scripts/prompt-delivery-smoke.mjs', 'scripts/emulator-cors.mjs', 'src/delivery.js', 'settings.html', 'scripts/prompt-capacity-cases.mjs'];
sourceFiles.push('scripts/semantic-long.mjs', 'tests/fixtures/semantic-long-v1.json', 'tests/fixtures/packing-ranks.json');
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
            let docs = body.query.knn && noHits ? [] : [...c.docs.values()].filter(d => d.owner === match[1] && d.scope === match[2]);
            if (body.query.knn && packing) {
                const recorded = packingFixture.original.queries.find(query => query.query === body.query.knn.queryText);
                assert.ok(recorded, 'Actual host query matches the recorded synthetic query');
                docs = recorded.hits.map(hit => {
                    const doc = docs.find(doc => doc.message === hit.message && doc.chunk === hit.chunk);
                    assert.ok(doc, 'Recorded rank refers to a synchronized source');
                    assert.equal(createHash('sha256').update(doc.text).digest('hex'), hit.textSha256);
                    return doc;
                });
            }
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
let server, browser, page, noHits = false, packing = false;
const report = { ...frozen, evidence: 'Real SillyTavern/Chromium/direct CORS; emulated LambdaDB and generation; no live embeddings or model', rows };
try {
    await new Promise(r => remote.listen(0, '127.0.0.1', r));
    await new Promise(r => bridge.listen(0, '127.0.0.1', r));
    const endpoint = `https://127.0.0.1:${remote.address().port}`;
    const bridgeUrl = `http://127.0.0.1:${bridge.address().port}/v1`;
    const port = Number(process.env.ST_DELIVERY_PORT || 18136), url = `http://127.0.0.1:${port}`;
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

    for (const spec of plan.cases) {
        console.log(`VERIFY ${spec.id}`);
        noHits = spec.noHits === true;
        const chat = capacityChat(spec.recentRepeats);
        if (spec.collision) chat[10].mes = 'OK';
        if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await field('stopOnLoss').setChecked(spec.stopOnLoss);
        await page.evaluate(async ({ spec, chat, instructions }) => {
            const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
            Object.assign(oai_settings, { openai_max_context: spec.context, openai_max_tokens: spec.output, stream_openai: Boolean(spec.streaming), names_behavior: spec.names ?? 0 });
            oai_settings.prompts.find(p => p.identifier === 'main').content = instructions;
            c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
        }, { spec, chat, instructions: capacityInstructions(spec.instructions) });
        if (spec.enabled) { await field('enabled').check(); await waitStatus('synchronized'); }
        if (spec.collision) await page.evaluate(() => {
            const c = SillyTavern.getContext();
            globalThis.deliveryCollision = { removed: 0 };
            const omit = (data, dryRun) => {
                if (dryRun) return;
                const index = data.prompt.findIndex(m => m.role === 'user' && m.content === 'OK');
                if (index >= 0) { data.prompt.splice(index, 1); deliveryCollision.removed++; }
            };
            deliveryCollision.omit = omit;
            c.eventSource.makeFirst(c.eventTypes.GENERATE_AFTER_DATA, omit);
        });
        const requestStart = generations.length;
        const observation = await page.evaluate(async ({ question, type }) => {
            const c = SillyTavern.getContext();
            if (type === 'normal') document.querySelector('#send_textarea').value = question;
            let generationError;
            try { await c.generate(type); } catch (error) { generationError = String(error?.name || error); }
            return { generationError, answer: c.chat.at(-1)?.mes, isUser: c.chat.at(-1)?.is_user,
                chat: c.chat.map(m => m.mes),
                delivery: document.querySelector('[data-sm="delivery"]').textContent,
                inspection: document.querySelector('[data-sm="inspection"]').textContent,
                generating: (await import('/script.js')).is_send_press,
                generatingUI: document.body.dataset.generating || null };
        }, { question: spec.collision ? 'BOOK A TRIP' : plan.question, type: spec.type });
        if (spec.collision) {
            const removed = await page.evaluate(() => {
                const c = SillyTavern.getContext();
                c.eventSource.removeListener(c.eventTypes.GENERATE_AFTER_DATA, deliveryCollision.omit);
                return deliveryCollision.removed;
            });
            assert.equal(removed, 1, 'Fixture omits exactly the short protected turn before verification');
            assert.match(observation.delivery, /1 recent messages are missing/);
        }
        const sent = generations.slice(requestStart);
        rows.push({ spec, ...observation, requests: sent });
        assert.equal(sent.length, spec.blocked ? 0 : 1, 'Blocked generations make zero completion requests');
        assert.equal(observation.generating, false, 'Host generation lock released');
        assert.equal(observation.generatingUI, null, 'Host generation UI released');
        if (spec.blocked) {
            assert.match(observation.delivery, /^Generation stopped:/);
            if (spec.type === 'normal') {
                assert.equal(observation.isUser, true, 'No phantom assistant reply after cancellation');
                assert.equal(observation.chat.length, 13);
            }
        }
        else {
            assert.equal(observation.generationError, undefined);
            assert.ok(observation.answer.endsWith('LOCAL_FIXTURE_OK'));
            if (spec.enabled) assert.match(observation.delivery, spec.stopOnLoss ? /^Final host prompt:/ : /^Warning:/);
        }
        if (spec.type === 'normal') assert.deepEqual(observation.chat.slice(0, 12), chat.map(m => m.mes), 'Original chat text preserved');
        if (spec.id === 'included') {
            assert.match(observation.delivery, /3\/3 memory passages and 4\/4 recent messages verified/);
            assert.equal(sent[0].messages.filter(m => m.content.startsWith('[Past conversation excerpt:')).length, 3);
        }
        if (spec.id === 'pressure-warning') {
            assert.match(observation.delivery, /3 memory passages and 2 recent messages are missing/);
            assert.equal(sent[0].messages.filter(m => m.content.startsWith('[Past conversation excerpt:')).length, 0);
        }
        if (spec.id === 'recovered-context') assert.match(observation.delivery, /8\/8 memory passages and 4\/4 recent messages verified/);
        if (spec.id === 'continue') assert.match(observation.delivery, /could not be verified/);
        if (spec.id === 'disabled') assert.doesNotMatch(observation.delivery, /Generation stopped|verified/);
        if (spec.id === 'pressure-stopped') {
            await field('delivery').scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${output}.png` });
            const recoveryStart = generations.length;
            // Simulate the user's explicit setting change and retry in the SAME chat.
            // The product never retries automatically or resends the user's question.
            const recovered = await page.evaluate(async () => {
                const { oai_settings } = await import('/scripts/openai.js');
                oai_settings.openai_max_context = 4096;
                const c = SillyTavern.getContext(), before = c.chat.map(m => m.mes);
                await c.generate('regenerate');
                return { before, after: c.chat.map(m => m.mes), delivery: document.querySelector('[data-sm="delivery"]').textContent };
            });
            assert.equal(generations.length, recoveryStart + 1);
            assert.deepEqual(recovered.after.slice(0, -1), recovered.before);
            assert.equal(recovered.after.at(-1), 'LOCAL_FIXTURE_OK');
            assert.match(recovered.delivery, /8\/8 memory passages and 4\/4 recent messages verified/);
            rows.at(-1).manualRecovery = { ...recovered, request: generations.at(-1) };
        }
    }
    await field('stopOnLoss').check();
    await page.evaluate(async chat => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        oai_settings.openai_max_context = 4096;
        c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
    }, capacityChat(1));
    await field('enabled').check(); await waitStatus('synchronized');
    const raceStart = generations.length;
    await page.evaluate(() => {
        const c = SillyTavern.getContext();
        globalThis.deliveryRace = { finalEvents: 0 };
        const gate = new Promise(resolve => { deliveryRace.release = resolve; });
        const hold = async (_data, dryRun) => {
            if (dryRun) return;
            deliveryRace.finalEvents++;
            if (deliveryRace.finalEvents === 1) { deliveryRace.held = true; await gate; }
        };
        deliveryRace.hold = hold;
        c.eventSource.makeFirst(c.eventTypes.GENERATE_AFTER_DATA, hold);
        document.querySelector('#send_textarea').value = 'OLDER QUESTION';
        deliveryRace.older = c.generate('normal').catch(() => {});
    });
    await page.waitForFunction(() => globalThis.deliveryRace?.held === true);
    const rejected = await page.evaluate(async () => {
        document.querySelector('#send_textarea').value = 'NEWER QUESTION';
        await SillyTavern.getContext().generate('normal');
        return { finalEvents: deliveryRace.finalEvents, status: document.querySelector('[data-sm="delivery"]').textContent };
    });
    assert.equal(rejected.finalEvents, 1, 'Overlapping ready prompt never reaches final event');
    assert.match(rejected.status, /Another prompt is awaiting/);
    await page.evaluate(async () => { deliveryRace.release(); await deliveryRace.older; });
    assert.equal(generations.length, raceStart, 'Neither the stale nor rejected request reaches completion endpoint');
    const race = await page.evaluate(async () => {
        const c = SillyTavern.getContext();
        const canceled = document.querySelector('[data-sm="delivery"]').textContent;
        await c.generate('regenerate');
        c.eventSource.removeListener(c.eventTypes.GENERATE_AFTER_DATA, deliveryRace.hold);
        return { canceled, finalEvents: deliveryRace.finalEvents, recovered: document.querySelector('[data-sm="delivery"]').textContent, answer: c.chat.at(-1).mes };
    });
    assert.match(race.canceled, /chat or memory settings changed/);
    assert.equal(race.finalEvents, 2);
    assert.equal(generations.length, raceStart + 1);
    assert.equal(race.answer, 'LOCAL_FIXTURE_OK');
    assert.match(race.recovered, /^Final host prompt:/);
    report.overlap = { ...rejected, ...race, rejectedCompletionRequests: 0, recoveryCompletionRequests: 1 };
    console.log('VERIFY repeated-passage-packing');
    await field('enabled').uncheck();
    for (const [name, value] of [['recent', 8], ['budget', 400]]) {
        await field(name).fill(String(value)); await field(name).dispatchEvent('change');
    }
    const packingChat = hostSource(packingFixture.item);
    await page.evaluate(async chat => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { openai_max_context: 1536, openai_max_tokens: 256, stream_openai: false });
        c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
    }, packingChat);
    packing = true;
    await field('enabled').check(); await waitStatus('synchronized');
    const packingStart = generations.length;
    const packed = await page.evaluate(async question => {
        const c = SillyTavern.getContext();
        document.querySelector('#send_textarea').value = question;
        await c.generate('normal');
        return { chat: c.chat.map(m => m.mes), delivery: document.querySelector('[data-sm="delivery"]').textContent };
    }, packingFixture.item.question);
    assert.equal(generations.length, packingStart + 1);
    const packingRequest = generations.at(-1), excerpts = packingRequest.messages.filter(m => m.content.startsWith('[Past conversation excerpt:'));
    assert.equal(excerpts.length, 4);
    assert.match(packed.delivery, /4\/4 memory passages and 8\/8 recent messages verified/);
    for (const index of [0, 1, 2, 27]) {
        const original = packingFixture.item.messages[index];
        assert(excerpts.some(m => m.role === original.role && m.content.endsWith(`\n${original.text}`)), 'Full source and native role reached the completion endpoint');
    }
    assert(excerpts.some(m => m.content.includes('identical text at message:passage 3:1, 43:1]')));
    assert.deepEqual(packed.chat.slice(0, 60), packingChat.map(m => m.mes), 'Packing never changes stored history');
    report.packing = { evidence: 'Actual host generation with recorded query ranks and a local completion fixture', case: packingFixture.item.id, configuredBudget: 400, effectiveBudget: 320, delivery: packed.delivery, request: packingRequest, storedHistoryUnchanged: true };
    packing = false;
    await field('stopOnLoss').uncheck();
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    assert.equal(await field('stopOnLoss').isChecked(), false, 'Warning preference survives reload');
    assert.equal(await field('key').inputValue(), '', 'Reload clears session key');
    assert.equal(await field('enabled').isChecked(), false, 'Reload disables memory');
    assert.equal(await field('delivery').innerText(), 'No prompt checked in this chat.', 'No stale final prompt after reload');
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await field('key').fill('synthetic-session-key'); await field('connect').click();
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
    console.error('Delivery status:', await page?.locator('[data-sm="delivery"]').innerText().catch(() => 'unavailable'));
    throw error;
} finally {
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    if (server && server.exitCode === null) { const exited = new Promise(r => server.once('exit', r)); server.kill('SIGTERM'); await exited; }
    await Promise.all([new Promise(r => remote.close(r)), new Promise(r => bridge.close(r))]);
    await rm(work, { recursive: true, force: true });
}
console.log(`PASS ${rows.length} delivery cases; ${output}`);
