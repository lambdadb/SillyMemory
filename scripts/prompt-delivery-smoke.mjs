import { answerMemoryPopup, memoryControl, expandMemorySettings, openMemoryConnection } from './settings-panel.mjs';
import { collectionResponse, branchResponse, documentResponse, rerankedResponse } from '../tests/helpers/lambdadb-responses.js';
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
import { MEMORY_GUIDANCE } from '../src/context.js';
import { SENT_GUIDANCE } from '../src/time.js';
import { retrievalQueries } from '../src/memory.js';

// Small fixed source/rank control for repeated-source delivery. This is not a
// captured retrieval run or a quality corpus; all ranking is supplied locally.
const packingSource = [
    { role: 'user', text: '편지에는 "금요일에 항구에서 만나자"라고 적혀 있어요.' },
    { role: 'assistant', text: '편지의 서명은 미라입니다.' },
    { role: 'user', text: '상자에는 파란 리본이 묶여 있어요.' },
    { role: 'assistant', text: '파란 리본이 묶인 상자를 기억할게요.' },
];
const packingQuestion = '편지에 적힌 약속과 서명을 알려주세요.';
const packingChat = Array.from({ length: 16 }, (_, index) => {
    const source = index < 4 ? packingSource[index] : index < 12 && index % 4 >= 2 ? packingSource[index % 4] : { role: index % 2 ? 'assistant' : 'user', text: `중립적인 정원 대화 ${index}.` };
    return { mes: source.text, name: source.role === 'user' ? 'User' : 'SillyMemory E2E Mira', is_user: source.role === 'user', is_system: false, send_date: 0, extra: {} };
});
const packingOrder = [2, 6, 10, 1, 0, 3, 7, 11];
let packingQuery, onlyFirst = false;

// Leave room for one excerpt after current memory guidance; separately sized
// instruction pressure still tests host eviction and the delivery stop guard.
const base = { enabled: true, context: 1792, output: 256, instructions: 1, recentRepeats: 1, stopOnLoss: true, type: 'normal' };
const plan = { version: 2, generationInput: 'recent-five-and-memory',
    host: capacityPlan.host, model: capacityPlan.model, budget: capacityPlan.budget,
    question: capacityPlan.question, character: capacityPlan.character, cases: [
    { ...base, id: 'included' },
    { ...base, id: 'speaker-prefix', names: 2 },
    { ...base, id: 'substring-collision', context: 4096, noHits: true, collision: true, blocked: true },
    { ...base, id: 'pressure-stopped', instructions: 160, blocked: true },
    { ...base, id: 'pressure-warning', instructions: 160, stopOnLoss: false, guidanceLost: true },
    { ...base, id: 'pressure-streaming', instructions: 160, streaming: true, blocked: true },
    { ...base, id: 'pressure-swipe', instructions: 160, type: 'swipe', blocked: true },
    { ...base, id: 'pressure-regenerate', instructions: 160, type: 'regenerate', blocked: true },
    { ...base, id: 'recovered-context', instructions: 160, context: 4096, budget: 864 },
    { ...base, id: 'continue', type: 'continue' },
    { ...base, id: 'impersonate', type: 'impersonate' },
    { ...base, id: 'replacement-with-assistant-suffix', type: 'regenerate', context: 4096, earlierAnchor: true },
    { ...base, id: 'no-hits-pressure', recentRepeats: 80, noHits: true, blocked: true },
    { ...base, id: 'no-hits-small', noHits: true },
    { ...base, id: 'history-pressure', recentRepeats: 80, blocked: true },
    { ...base, id: 'nothing-fits', budget: 250 },
    { ...base, id: 'guidance-does-not-fit', budget: 64, blocked: true, preparationFailure: true },
    { ...base, id: 'disabled', enabled: false, recentRepeats: 80 },
] };

// Keep the current-message query within provider limits while independently
// stressing the longer retained window. Only the two last source messages are short; message 9 keeps
// the original context pressure. These are delivery controls, not quality cases.
function deliveryChat(repeats) {
    const chat = capacityChat(repeats);
    chat[9].mes = `RECENT_9: ${'We are discussing the garden. '.repeat(repeats * 3)}`;
    for (const message of chat.slice(-2)) message.mes = 'We are discussing the garden.';
    return chat;
}
for (const spec of plan.cases.filter(spec => spec.enabled)) {
    const messages = deliveryChat(spec.recentRepeats).map((message, index) => ({ index, text: message.mes, user: message.is_user, eligible: true }));
    if (spec.type === 'normal') messages.push({ index: messages.length, text: plan.question, user: true, eligible: true });
    const [query] = retrievalQueries({ messages }, spec.type);
    assert(new TextEncoder().encode(query).byteLength <= 8192, `${spec.id}: pressure fixture must fit complete-query limits`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-prompt-delivery';
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts/prompt-delivery.json'));
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), plan.host);
assert.equal(await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')), root);
const sourceFiles = ['vendor/lambdadb.js', 'package-lock.json', 'tests/helpers/lambdadb-responses.js', 'index.js', 'src/chat-collections.js', 'manifest.json', 'src/chunking.js', 'src/client.js', 'src/credentials.js', 'src/context.js', 'src/gate.js', 'src/memory.js', 'src/time.js', 'src/status.js', 'scripts/prompt-delivery-smoke.mjs', 'scripts/settings-panel.mjs', 'scripts/emulator-cors.mjs', 'src/delivery.js', 'settings.html', 'scripts/prompt-capacity-cases.mjs'];
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
const send = (res, status, body = { message: 'OK' }) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
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
            collections.set(body.collectionName, { definition: collectionResponse(body), branches: new Map([['main', new Map()]]) });
            return send(res, 201, { collection: collectionResponse(body) });
        }
        if (!name && req.method === 'GET') return send(res, 200, { collections: [...collections.values()].map(c => c.definition) });
        const c = collections.get(name); if (!c) return send(res, 404);
        if (parts.length === 4 && req.method === 'GET') return send(res, 200, { collection: c.definition });
        if (parts.length === 4 && req.method === 'DELETE') { collections.delete(name); return send(res, 200); }
        if (parts[4] === 'branches') {
            if (req.method === 'GET') return send(res, 200, { branches: [...c.branches.keys()].map(name => branchResponse(name)) });
            if (req.method === 'POST') {
                if (c.branches.has(body.branchName)) return send(res, 409);
                const source = c.branches.get(body.source.name); if (!source) return send(res, 404);
                c.branches.set(body.branchName, new Map(source)); return send(res, 201, { branch: branchResponse(body.branchName, body.source.name) });
            }
            if (req.method === 'DELETE') { c.branches.delete(parts[5]); return send(res, 200); }
        }
        const branch = body.branch || body.ref?.name || new URL(req.url, 'https://localhost').searchParams.get('refName') || 'main';
        const branchDocs = c.branches.get(branch); if (!branchDocs) return send(res, 404);
        const inline = docs => documentResponse(docs, name);
        if (parts[4] === 'docs' && req.method === 'GET') return send(res, 200, inline([...branchDocs.values()]));
        if (parts[4] === 'docs' && parts[5] === 'fetch') return send(res, 200, inline(body.ids.map(id => branchDocs.get(id)).filter(Boolean)));
        if (parts[4] === 'docs' && parts[5] === 'upsert') { body.docs.forEach(d => branchDocs.set(d.id, d)); return send(res, 202); }
        if (parts[4] === 'docs' && parts[5] === 'delete') { body.ids.forEach(id => branchDocs.delete(id)); return send(res, 202); }
        if (parts[4] === 'query') {
            const knn = body.query.bayesian?.[0]?.knn || body.query.knn;
            const filter = knn?.filter || body.query;
            if (body.query.bayesian) assert.deepEqual(body.query.bayesian[1].bool[0], { ...filter, occur: 'filter' });
            const match = /^owner:([a-f0-9]+) AND scope:([a-f0-9]+)(?: AND message:\[0 TO (\d+)\])?$/.exec(filter.queryString?.query || '');
            assert.ok(match);
            if (knn) assert.equal(typeof knn.queryText, 'string');
            // Fixed source order, deliberately no embeddings or ANN simulation.
            let docs = knn && noHits ? [] : [...branchDocs.values()].filter(d => d.owner === match[1] && d.scope === match[2] && (match[3] === undefined || d.message <= Number(match[3])));
            if (knn && onlyFirst) docs = docs.filter(d => d.message === 0 && d.chunk === 0);
            if (knn && packing) {
                assert.equal(knn.queryText, packingQuery, 'Actual host uses the current-message policy');
                docs = packingOrder.map(hit => {
                    const doc = docs.find(doc => doc.message === hit && doc.chunk === 0);
                    assert.ok(doc, 'Fixed rank refers to a synchronized source');
                    assert.equal(doc.text, packingChat[hit].mes);
                    return doc;
                });
            }
            return send(res, 200, body.rerank ? rerankedResponse(docs, name) : documentResponse(docs, name));
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
    const field = name => name === 'enabled' ? memoryControl(page) : page.locator(`#sillymemory [data-sm="${name}"]`);
    const waitStatus = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text);
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await field('endpoint').fill(endpoint); await field('project').fill('synthetic'); await field('key').fill('synthetic-session-key');
    await field('connect').click(); await waitStatus('Chat memory is ready');
    assert.equal(collections.size, 0);
    // Isolate capacity/delivery with plain local completions. The native
    for (const name of ['budget']) { await field(name).fill(String(plan[name])); await field(name).dispatchEvent('change'); }

    for (const spec of plan.cases) {
        console.log(`VERIFY ${spec.id}`);
        noHits = spec.noHits === true; onlyFirst = spec.id === 'nothing-fits';
        const chat = deliveryChat(spec.recentRepeats);
        if (spec.earlierAnchor) chat.slice(9).forEach(message => { message.is_user = false; message.name = 'Mira'; });
        if (spec.collision) chat[10].mes = 'BOOK A TRIP';
        if (await field('enabled').isChecked()) await field('enabled').uncheck();
        await field('stopOnLoss').setChecked(spec.stopOnLoss);
        await field('budget').fill(String(spec.budget ?? plan.budget)); await field('budget').dispatchEvent('change');
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
            let generationError, preparedInspection;
            const inspectPrepared = (_data, dryRun) => { if (!dryRun) preparedInspection = document.querySelector('[data-sm="inspection"]').textContent; };
            c.eventSource.makeFirst(c.eventTypes.GENERATE_AFTER_DATA, inspectPrepared);
            try { await c.generate(type); } catch (error) { generationError = String(error?.name || error); }
            finally { c.eventSource.removeListener(c.eventTypes.GENERATE_AFTER_DATA, inspectPrepared); }
            return { generationError, preparedInspection, draft: document.querySelector('#send_textarea').value, answer: c.chat.at(-1)?.mes, isUser: c.chat.at(-1)?.is_user,
                chat: c.chat.map(m => m.mes),
                delivery: document.querySelector('[data-sm="delivery"]').textContent,
                inspection: document.querySelector('[data-sm="inspection"]').textContent,
                generating: (await import('/script.js')).is_send_press,
                generatingUI: document.body.dataset.generating || null };
        }, { question: spec.collision ? 'OK' : plan.question, type: spec.type });
        if (spec.collision) {
            const removed = await page.evaluate(() => {
                const c = SillyTavern.getContext();
                c.eventSource.removeListener(c.eventTypes.GENERATE_AFTER_DATA, deliveryCollision.omit);
                return deliveryCollision.removed;
            });
            assert.equal(removed, 1, 'Fixture omits exactly the short protected turn before verification');
            assert.match(observation.delivery, /1 input messages are missing/);
        }
        const sent = generations.slice(requestStart);
        rows.push({ spec, ...observation, requests: sent });
        assert.equal(sent.length, spec.blocked ? 0 : 1, 'Blocked generations make zero completion requests');
        assert.equal(observation.generating, false, 'Host generation lock released');
        assert.equal(observation.generatingUI, null, 'Host generation UI released');
        if (spec.blocked) {
            if (spec.preparationFailure) assert.match(observation.inspection, /operation failed/);
            else assert.match(observation.delivery, /^Generation stopped:/);
            if (spec.type === 'normal') {
                assert.equal(observation.isUser, true, 'No phantom assistant reply after cancellation');
                assert.equal(observation.chat.length, 13);
            }
        }
        else {
            assert.equal(observation.generationError, undefined);
            assert.ok((spec.type === 'impersonate' ? observation.draft : observation.answer).endsWith('LOCAL_FIXTURE_OK'));
            if (spec.enabled) {
                assert.match(observation.delivery, spec.stopOnLoss ? /^Final host prompt:/ : /^Warning:/);
                const hasGuidance = sent[0].messages.some(m => m.role === 'system' && m.content.includes(MEMORY_GUIDANCE));
                if (spec.guidanceLost) {
                    assert.equal(spec.stopOnLoss, false, 'Only explicit warning mode may dispatch without guidance');
                    assert.equal(hasGuidance, false, 'Pressure fixture evicts the guidance');
                    assert.match(observation.delivery, /Memory guidance is missing or changed/, 'Missing guidance is disclosed');
                } else assert(hasGuidance, 'Natural memory guidance reaches the completion request, including no hits');
            }
        }
        if (spec.enabled && sent.length) {
            const anchor = spec.type === 'normal' ? 12 : ['continue', 'impersonate'].includes(spec.type) ? 11 : spec.earlierAnchor ? 8 : 10;
            // An assistant-starting window includes its adjacent user; normal
            // user input still retains exactly five in this alternating fixture.
            const retainedStart = anchor === 11 ? 6 : anchor - 4;
            for (const [index, prior] of chat.entries()) {
                const retained = index >= retainedStart && index <= anchor;
                const present = sent[0].messages.some(m => m.content === prior.mes || m.content.trim() === prior.mes.trim());
                if (retained && spec.stopOnLoss && !spec.collision && !spec.names) assert(present, 'Recent source reaches the provider in its native role');
                if (!retained) assert(!present, 'Older source and replacement replies are not retained in full');
            }
            assert(sent[0].messages.some(m => m.role === 'system' && m.content.includes('Follow the conversation')), 'Native system instructions survive');
            assert(sent[0].messages.some(m => m.role === 'system' && m.content.includes(capacityPlan.character)), 'Native character settings survive');
        }
        if (spec.type === 'normal') assert.deepEqual(observation.chat.slice(0, 12), chat.map(m => m.mes), 'Original chat text preserved');
        if (!spec.blocked && (spec.noHits || spec.id === 'nothing-fits')) {
            assert.equal(sent[0].messages.filter(m => m.content.startsWith('[Recalled conversation excerpts]')).length, 0, 'Empty selection sends no excerpts and does not restore full history');
            assert.match(observation.delivery, /0\/0 memory excerpts and 5\/5 input messages verified/);
            const guidanceTokens = await page.evaluate(text => SillyTavern.getContext().getTokenCountAsync(text), MEMORY_GUIDANCE);
            assert.equal(Number(observation.preparedInspection.split(' / ')[0]), guidanceTokens, 'Empty-selection inspection includes the guidance token cost');
        }
        if (spec.id === 'included') {
            assert.match(observation.delivery, /1\/1 memory excerpts and 5\/5 input messages verified/);
            assert.equal(sent[0].messages.filter(m => m.content.startsWith('[Recalled conversation excerpts]')).length, 1);
        }
        if (spec.id === 'pressure-warning') {
            assert.match(observation.delivery, /1 memory excerpts and \d+ input messages are missing/);
            assert.equal(sent[0].messages.filter(m => m.content.startsWith('[Recalled conversation excerpts]')).length, 0);
        }
        if (spec.id === 'recovered-context') {
            assert.match(observation.delivery, /1\/1 memory excerpts and 5\/5 input messages verified/);
            const recoveredExcerpts = sent[0].messages.filter(m => m.content.startsWith('[Recalled conversation excerpts]'));
            assert.equal(recoveredExcerpts.length, 1);
            for (let index = 0; index < 6; index++) assert(recoveredExcerpts.some(m => m.content.includes(`OLD_${index}:`)), 'Six ranked older sources fit after removing follow-up obligations');
        }
        if (spec.earlierAnchor) {
            assert(sent[0].messages.some(m => m.role === 'user' && m.content === chat[8].mes), 'User anchor is retained despite following assistant turns');
            assert(!sent[0].messages.some(m => m.role === 'assistant' && m.content === chat[9].mes), 'Replacement answer suffix is not retained as full input');
        }
        if (spec.id === 'continue') {
            assert.match(observation.delivery, /could not be verified/);
            assert(sent[0].messages.some(m => m.role === 'assistant' && m.content.trim() === chat[11].mes.trim()), 'Native partial answer reaches the completion endpoint');
            assert(observation.answer.startsWith(chat[11].mes.trim()), 'Continue appends to the original partial answer');
        }
        if (spec.id === 'impersonate') {
            assert(sent[0].messages.some(m => m.role === 'assistant' && m.content.trim() === chat[11].mes.trim()), 'Impersonation answers the latest character response');
            assert.deepEqual(observation.chat, chat.map(m => m.mes), 'Impersonation writes a draft without changing source history');
        }
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
            assert.match(recovered.delivery, /1\/1 memory excerpts and 5\/5 input messages verified/);
            assert.equal(generations.at(-1).messages.filter(m => m.content.startsWith('[Recalled conversation excerpts]')).length, 1);
            rows.at(-1).manualRecovery = { ...recovered, request: generations.at(-1) };
        }
    }
    onlyFirst = false;
    await field('stopOnLoss').check();
    await page.evaluate(async chat => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        oai_settings.openai_max_context = 4096;
        c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
    }, deliveryChat(1));
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
    // Reserve guidance headroom so this source-integrity fixture still exercises
    // repeated citations; the small-context cases above independently test eviction.
    for (const [name, value] of [['budget', 600]]) {
        await field(name).fill(String(value)); await field(name).dispatchEvent('change');
    }
    packingQuery = retrievalQueries({ messages: [
        ...packingChat.map((message, index) => ({ index, text: message.mes, user: message.is_user, eligible: true })),
        { index: packingChat.length, text: packingQuestion, user: true, eligible: true },
    ] }, 'normal')[0];
    await page.evaluate(async chat => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { openai_max_context: 2656, openai_max_tokens: 256, stream_openai: false });
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
    }, packingQuestion);
    assert.equal(generations.length, packingStart + 1);
    const packingRequest = generations.at(-1), excerpts = packingRequest.messages.filter(m => m.content.startsWith('[Recalled conversation excerpts]'));
    // Every selected repeated source retains all of its coordinates.
    assert.equal(excerpts.length, 1);
    assert.match(packed.delivery, /1\/1 memory excerpts and 5\/5 input messages verified/);
    for (const index of [0, 1, 2, 3]) {
        const original = packingSource[index];
        assert(excerpts.some(m => m.role === 'user' && m.content.includes(`excerpt: ${original.role} `) && `\n${m.content}\n`.includes(`\n${original.text}\n`)), 'Full quoted source and original speaker label reached the completion endpoint');
    }
    assert(excerpts.some(m => m.content.includes('identical text at message:passage 3:1, 7:1, 11:1]')));
    assert(excerpts.some(m => m.content.includes('identical text at message:passage 4:1, 8:1, 12:1]')));
    assert.deepEqual(packed.chat.slice(0, packingChat.length), packingChat.map(m => m.mes), 'Packing never changes stored history');
    report.packing = { evidence: 'Actual host generation with fixed synthetic ranks and a local completion fixture', case: 'repeated-source-citations', configuredBudget: 600, effectiveBudget: 600, delivery: packed.delivery, request: packingRequest, storedHistoryUnchanged: true };
    packing = false;
    console.log('VERIFY same-message-assembly');
    await field('enabled').uncheck();
    for (const [name, value] of [['budget', 1600]]) {
        await field(name).fill(String(value)); await field(name).dispatchEvent('change');
    }
    const assemblyChat = Array.from({ length: 8 }, (_, index) => ({
        mes: index ? `Synthetic assembly turn ${index}.` : Array.from({ length: 75 }, (_, i) => `Archive shelf ${i}: the cedar maps are here.`).join('\n'),
        name: index % 2 ? 'Mira' : 'User', is_user: !(index % 2), is_system: false, send_date: '2026-01-01T00:00:00.000Z', extra: {},
    }));
    await page.evaluate(async chat => {
        const c = SillyTavern.getContext(), { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { openai_max_context: 8192, openai_max_tokens: 256, stream_openai: false });
        c.chat.splice(0, c.chat.length, ...chat); await c.saveChat(); await c.reloadCurrentChat();
    }, assemblyChat);
    await field('enabled').check(); await waitStatus('synchronized');
    const assemblyStart = generations.length;
    const assembled = await page.evaluate(async () => {
        const c = SillyTavern.getContext(); document.querySelector('#send_textarea').value = 'Where are the cedar maps?';
        await c.generate('normal');
        return { source: c.chat[0].mes, delivery: document.querySelector('[data-sm="delivery"]').textContent };
    });
    assert.equal(generations.length, assemblyStart + 1);
    const assemblyRequest = generations.at(-1), joined = assemblyRequest.messages.find(m => m.content.includes('message 1, passages 1-'));
    assert(joined && joined.role === 'user' && joined.content.includes(assemblyChat[0].mes), 'All assembled source text reached the completion endpoint');
    assert.equal(joined.content.split('message 1, passages 1-').length - 1, 1);
    assert.equal(assemblyRequest.messages.map(m => m.content).join('\n').split(SENT_GUIDANCE).length - 1, 1);
    assert(assemblyRequest.messages.some(m => m.role === 'system' && m.content.includes(SENT_GUIDANCE)), 'Date interpretation is delivered as system guidance');
    assert(!joined.content.includes(SENT_GUIDANCE), 'Quoted source does not carry instructions');
    assert.equal(assembled.source, assemblyChat[0].mes, 'Assembly does not alter stored history');
    assert.match(assembled.delivery, /^Final host prompt:/); assert(!assembled.delivery.includes('missing or changed'));
    report.assembly = { evidence: 'Actual host assembled prompt dispatched to a local completion fixture; LambdaDB emulated',
        configuredBudget: 1600, sourceUnchanged: true, delivery: assembled.delivery, request: assemblyRequest };
    await field('stopOnLoss').uncheck();
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    assert.equal(await field('stopOnLoss').isChecked(), false, 'Warning preference survives reload');
    await page.waitForFunction(() => !document.querySelector('#sillymemory [data-sm=connect]').disabled);
    assert.equal(await field('key').inputValue(), '', 'Reload restores the key without exposing it in the input');
    assert.equal(await field('delivery').innerText(), 'No prompt checked in this chat.', 'No stale final prompt after reload');
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    if (!await page.locator('#sillymemory .inline-drawer-content').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    await expandMemorySettings(page);
    await field('key').fill('synthetic-session-key'); await field('connect').click();
    await answerMemoryPopup(page, () => field('delete').click()); await waitStatus('no longer accessible');
    assert.equal(collections.size, 0);
    await openMemoryConnection(page);
    await field('forget').click(); await waitStatus('Saved key removed');
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, settings: SillyTavern.getContext().extensionSettings }));
    assert.ok(!stored.includes('synthetic-session-key'));
    assert.ok(!(await readFile(profilePath, 'utf8')).includes('synthetic-session-key'));
    assert.deepEqual(errors, []);
    assert.deepEqual(await hashes(), frozen.sourceSha256, 'Measured sources remain frozen');
    assert.deepEqual(await hostHashes(), frozen.hostSha256, 'Measured host sources remain frozen');
    Object.assign(report, { passed: true, node: process.version, browser: browser.version(), requests, remainingCollections: collections.size, forgottenKeyAbsentFromStorage: true });
} catch (error) {
    Object.assign(report, { passed: false, failure: error.message, errors, remainingCollections: collections.size });
    console.error('Delivery status:', await page?.locator('[data-sm="delivery"]').innerText().catch(() => 'unavailable'));
    throw error;
} finally {
    report.generations = generations;
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    if (server && server.exitCode === null) { const exited = new Promise(r => server.once('exit', r)); server.kill('SIGTERM'); await exited; }
    await Promise.all([new Promise(r => remote.close(r)), new Promise(r => bridge.close(r))]);
    await rm(work, { recursive: true, force: true });
}
console.log(`PASS ${rows.length} delivery cases; ${output}`);
