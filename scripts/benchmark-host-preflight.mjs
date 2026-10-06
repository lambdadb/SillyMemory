import { emulatorCors } from './emulator-cors.mjs';
// Real pinned host and Chromium; local completion/LambdaDB fixtures and vector API
// emulation only. Never reads .env.local. Raw source/prompt text stays in memory.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
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
const [cache, output] = process.argv.slice(2);
assert(cache && output && process.argv.length === 4, 'Usage: benchmark-host-preflight.mjs <dataset-cache> <report.json>');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('-C', hostSource, 'rev-parse', 'HEAD'), hostRevision);
const read = name => readFile(path.join(root, name));
const planBytes = await read('docs/benchmarks/pilot-design-v1.json'), plan = JSON.parse(planBytes);
const lockBytes = await read('docs/benchmarks/sources-v1.json'), lock = JSON.parse(lockBytes);
const selectionBytes = await read('docs/benchmarks/selection-v1.json');
assert.equal(sha(lockBytes), plan.sourceSha256);
assert.equal(sha(selectionBytes), plan.selectionSha256);
assert.equal(plan.hostRevision, hostRevision);
const data = readVerifiedFile(cache, lock.files.find(f => f.dataset === 'longmemeval'));
const cases = plan.cases.map(sample => prepareHostCase(data[sample.sourceIndex], sample));
const require = createRequire(path.join(hostSource, 'package.json'));
assert.equal(JSON.parse(await readFile(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
const encoder = require('tiktoken').get_encoding('o200k_base');
const count = text => encoder.encode(text, [], []).length;
const report = { version: 'longmemeval-host-preflight-v1', passed: false,
    evidence: 'Pinned SillyTavern/Chromium; emulated generation, summary and retrieval. No provider quality or usage evidence.',
    hostRevision, nodeVersion: process.version, planSha256: sha(planBytes), sourceSha256: sha(lockBytes),
    tokenizer: 'o200k_base; sum final message content tokens plus 6/message; not provider billing or exact host occupancy',
    retrievalFixture: 'First source-order documents/hashes, independent of question and answer labels; no embeddings or ANN.',
    sourceSha256ByFile: {}, rows: [], summaries: [], probes: {}, traffic: { vector: [], lambda: [], completions: 0,
        browserBlocked: 0, hostBlocked: 0 }, cleanup: false };
for (const file of ['scripts/benchmark-host-preflight.mjs', 'scripts/benchmark-host-input.mjs',
    'scripts/benchmark-loopback-guard.cjs', 'scripts/benchmark-audit.mjs', 'index.js', 'src/chat-collections.js', 'manifest.json',
    'src/memory.js', 'src/time.js', 'src/context.js', 'src/client.js', 'vendor/lambdadb.js', 'package-lock.json', 'src/gate.js', 'src/delivery.js', 'src/status.js']) {
    report.sourceSha256ByFile[file] = sha(await read(file));
}
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const checkpoint = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-benchmark-host-'));
const source = path.join(work, 'host');
let host, browser, page, hostAdded = false, stage = 'setup', summarySignal = 0;
const collections = new Map(), vectors = new Map(), generations = [], errors = [], scopeStages = new Map();
const send = (res, status, body = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const json = async req => { const parts = []; for await (const chunk of req) parts.push(chunk); return JSON.parse(Buffer.concat(parts).toString() || '{}'); };
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const bridge = createServer(async (req, res) => {
    try {
        if (req.url === '/v1/models') return send(res, 200, { data: [{ id: plan.generator.model }] });
        assert.equal(req.url, '/v1/chat/completions');
        const body = await json(req);
        assert.equal(body.model, plan.generator.model); assert.equal(body.stream, false);
        assert(generations.length < 300, 'Local completion cap');
        const answer = stage.includes('/summary-replay') ? `LOCAL_SUMMARY_${generations.length}` : 'LOCAL_ANSWER';
        generations.push({ stage, body, answer }); report.traffic.completions++;
        send(res, 200, { id: 'preflight-fixture', choices: [{ index: 0,
            message: { role: 'assistant', content: answer }, finish_reason: 'stop' }] });
    } catch (e) { errors.push(e.message); send(res, 500); }
});
let remote;
try {
    git('-C', hostSource, 'worktree', 'add', '--detach', source, hostRevision); hostAdded = true;
    await symlink(path.join(hostSource, 'node_modules'), path.join(source, 'node_modules'));
    const extensions = path.join(source, 'public/scripts/extensions/third-party');
    await mkdir(extensions, { recursive: true }); await symlink(root, path.join(extensions, 'sillymemory'));
    const key = path.join(work, 'key.pem'), cert = path.join(work, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
        '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    remote = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
        if (emulatorCors(req, res)) return;
        try {
            const body = await json(req), parts = new URL(req.url, 'https://localhost').pathname.split('/').filter(Boolean), name = parts[3];
            assert.equal(req.headers['x-api-key'], 'synthetic-session-key');
            assert.deepEqual(parts.slice(0, 3), ['projects', 'synthetic', 'collections']);
            const operation = parts.slice(4).join('/') || (name ? 'collection' : 'create');
            report.traffic.lambda.push({ stage, method: req.method, operation, count: body.docs?.length ?? body.ids?.length });
            if (!name && req.method === 'POST') {
                assert.equal(body.indexConfigs.embedding.managedEmbedding, true);
                collections.set(body.collectionName, { definition: body, docs: new Map() }); return send(res, 201, { collection: body });
            }
            if (!name && req.method === 'GET') return send(res, 200, { collections: [...collections.values()].map(c => c.definition) });
            const c = collections.get(name); if (!c) return send(res, 404);
            if (parts.length === 4 && req.method === 'GET') return send(res, 200, { collection: c.definition });
            if (parts.length === 4 && req.method === 'DELETE') { collections.delete(name); return send(res, 200); }
            if (operation === 'docs/upsert') {
                body.docs.forEach(d => { c.docs.set(d.id, d); scopeStages.set(d.scope, stage); }); return send(res, 202);
            }
            if (operation === 'docs/delete') { body.ids.forEach(id => c.docs.delete(id)); return send(res, 202); }
            if (operation === 'query') {
                const filter = body.query.knn?.filter || body.query;
                const match = /^owner:([a-f0-9]+) AND scope:([a-f0-9]+)$/.exec(filter.queryString?.query || '');
                assert(match);
                let docs = [...c.docs.values()].filter(d => d.owner === match[1] && d.scope === match[2]);
                if (body.query.knn) docs = docs.slice(0, body.size || 20);
                return send(res, 200, { docs: docs.map(doc => ({ collection: name, doc })), isDocsInline: true, total: docs.length, took: 1 });
            }
            throw new Error('Unexpected LambdaDB emulator operation');
        } catch (e) { errors.push(e.message); send(res, 500); }
    });
    const endpoint = `https://127.0.0.1:${await listen(remote)}`;
    const bridgeUrl = `http://127.0.0.1:${await listen(bridge)}/v1`;
    const probe = createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
    const url = `http://127.0.0.1:${port}`, config = path.join(work, 'config.yaml');
    await writeFile(config, await readFile(path.join(source, 'default/config.yaml')));
    host = spawn(process.execPath, ['--require', path.join(root, 'scripts/benchmark-loopback-guard.cjs'),
        'server.js', '--configPath', config, '--dataRoot', path.join(work, 'data'), '--port', String(port),
        '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'false'], {
        cwd: source, env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_EXTRA_CA_CERTS: cert }, stdio: ['ignore', 'ignore', 'pipe'] });
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
    browser = await chromium.launch(); page = await browser.newPage({ ignoreHTTPSErrors: true }); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => {
        if (/Not enough messages in chat to summarize|Summary conditions not satisfied|Summary set to:/.test(message.text())) summarySignal++;
    });
    await page.route('**/*', async route => {
        const target = new URL(route.request().url());
        if (target.origin !== url && target.origin !== endpoint) { report.traffic.browserBlocked++; return route.abort(); }
        if (!target.pathname.startsWith('/api/vector/')) return route.continue();
        try {
            const body = route.request().postDataJSON(), operation = target.pathname.split('/').at(-1);
            assert(stage.includes('/vectors') || stage === 'cleanup', 'Native vector call outside its arm');
            const id = body.collectionId; if (!vectors.has(id)) vectors.set(id, []);
            report.traffic.vector.push({ stage, operation, count: body.items?.length });
            let result = {};
            if (operation === 'list') result = [...new Set(vectors.get(id).map(d => d.hash))];
            else if (operation === 'insert') vectors.get(id).push(...body.items);
            else if (operation === 'delete') vectors.set(id, vectors.get(id).filter(d => !body.hashes.includes(d.hash)));
            else if (operation === 'purge') vectors.delete(id);
            else if (operation === 'query') {
                const docs = vectors.get(id), hashes = [...new Set(docs.map(d => d.hash))].slice(0, body.topK);
                result = { hashes, metadata: docs.filter(d => hashes.includes(d.hash)) };
            } else throw new Error('Unexpected native vector operation');
            return route.fulfill({ json: result });
        } catch (e) { errors.push(e.message); return route.fulfill({ status: 500, json: {} }); }
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
        data.set('ch_name', 'Assistant'); data.set('description', 'A conversational assistant.'); data.set('first_mes', 'Local preflight.');
        assertResponse(await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data }));
        function assertResponse(r) { if (!r.ok) throw new Error('Character creation failed'); }
    }, { bridgeUrl, model: plan.generator.model });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached' });
    await page.locator('#rightNavHolder .drawer-toggle').click();
    await page.locator('.character_select').filter({ hasText: 'Assistant' }).click();
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection');
    const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
    const status = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 120000 });
    await page.locator('#extensions-settings-button .drawer-toggle').click();
    await page.locator('#sillymemory .inline-drawer-toggle').click();
    await field('endpoint').fill(endpoint); await field('project').fill('synthetic'); await field('key').fill('synthetic-session-key');
    await field('connect').click(); await field('gate').click(); await status('Transport gate passed');
    assert.equal(collections.size, 0); await field('provision').click(); await status('Chat memory is ready');
    report.settings = await page.evaluate(() => {
        const c = SillyTavern.getContext();
        c.extensionSettings.memory.source = 'main'; c.extensionSettings.memory.memoryFrozen = true;
        $('#vectors_source').val('vllm').trigger('change');
        $('#vectors_vllm_model').val('text-embedding-3-small').trigger('input');
        $('#vector_altEndpointUrl_enabled').prop('checked', true).trigger('input');
        $('#vector_altEndpoint_address').val('http://127.0.0.1:1/v1').trigger('change');
        return { summary: structuredClone(c.extensionSettings.memory), vectors: structuredClone(c.extensionSettings.vectors),
            recent: Number(document.querySelector('[data-sm="recent"]').value), budget: Number(document.querySelector('[data-sm="budget"]').value) };
    });
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
        assert.equal(generations.length, start + 1, 'One local completion per answer');
        assert.equal(sha(JSON.stringify(observation.promptReady)), sha(JSON.stringify(generations.at(-1).body.messages)), 'Prompt-ready snapshot matches completion transport');
        return { observation, request: generations.at(-1).body };
    }
    // Separate synthetic edge probe first, never appended to benchmark histories.
    stage = 'synthetic-probe';
    const synthetic = [{ mes: 'Macro probe {{char}} {{setvar::benchmark_probe::executed}}', name: 'User', is_user: true, extra: {} },
        { mes: '', name: 'Assistant', is_user: false, extra: {} },
        { mes: 'Last literal source turn.', name: 'Assistant', is_user: false, extra: {} }];
    await reset(synthetic, 'synthetic-probe', 32768);
    const reloadedProbe = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user })));
    const { observation: edge, request: edgeRequest } = await generate('Report the preceding turns.');
    const edgeText = edgeRequest.messages.map(m => m.content).join('\n');
    report.probes = { importedEmptyPreserved: edge.chat[1].mes === '',
        emptyInOutgoing: edgeRequest.messages.some(m => m.content === ''),
        macroChangedStoredSourceOnReload: reloadedProbe[0].mes !== synthetic[0].mes,
        macroChangedStoredSourceAfterGeneration: edge.chat[0].mes !== synthetic[0].mes,
        macroExpandedByHost: edgeText.includes('Macro probe Assistant') && !edgeText.includes('{{char}}'),
        pilotMacroSpellings: cases.map(c => ({ id: c.id, messages: c.chat.filter(m => /\{\{|<(USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>/i.test(m.mes)).length })) };
    assert(report.probes.importedEmptyPreserved);
    assert(report.probes.macroExpandedByHost);
    assert(report.probes.pilotMacroSpellings.every(c => c.messages === 0), 'Macro-containing pilot inputs require an explicit adaptation decision');
    await checkpoint();
    for (const item of cases) for (const context of plan.offlinePreflightContexts) {
        for (const mode of Object.keys(plan.arms)) {
            stage = `${item.id}/${context}/${mode}`; console.log(`PREFLIGHT ${stage}`);
            await reset(mode === 'summary' ? [] : item.chat, stage.replaceAll('/', '-'), context);
            const restored = await page.evaluate(() => SillyTavern.getContext().chat.map(m => ({ mes: m.mes, name: m.name, is_user: m.is_user })));
            assert.equal(sha(JSON.stringify(restored)), sha(JSON.stringify(sourceView(mode === 'summary' ? [] : item.chat))), 'Restored source hash');
            let nativeDocuments = 0;
            if (mode === 'vectors') {
                await page.evaluate(async () => {
                    $('#vectors_enabled_chats').prop('checked', true).trigger('input');
                    await $('#vectors_vectorize_all').triggerHandler('click');
                });
                const id = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
                nativeDocuments = vectors.get(id)?.length || 0; assert(nativeDocuments > 0);
                const hashes = await page.evaluate(async () => {
                    const { getStringHash } = await import('/scripts/utils.js');
                    return [...new Set(SillyTavern.getContext().chat.map(m => getStringHash(m.mes)))].sort();
                });
                assert.deepEqual([...new Set(vectors.get(id).map(d => d.hash))].sort(), hashes);
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
                        const deadline = Date.now() + 30000;
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
                    response: 'Local marker only; summary fidelity and realistic summary length unmeasured' });
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
            if (mode === 'vectors') assert(observation.native && request.messages.some(m => m.content.includes(observation.native.trim())));
            if (mode === 'summary') assert(observation.summary && request.messages.some(m => m.content.includes(observation.summary)));
            if (mode === 'sillymemory') assert.match(observation.delivery, /^Final host prompt:/);
            report.rows.push({ id: item.id, context, mode, inputSha256: item.inputSha256, ...coverage,
                finalMessages: request.messages.length,
                hostPromptTokens: observation.hostPromptTokens, hostPromptBudget: observation.hostPromptBudget,
                tokenObservation: 'Non-dry-run CHAT_COMPLETION_PROMPT_READY; captured prompt matches bridge messages by hash',
                finalContentTokenEstimate: request.messages.reduce((n, m) => n + count(m.content) + 6, 0),
                promptSha256: sha(JSON.stringify(request.messages)), nativeDocuments,
                memoryDocuments: mode === 'sillymemory' ? [...collections.values()].flatMap(c => [...c.docs.values()]).filter(d => scopeStages.get(d.scope) === stage).length : 0,
                nativePromptDelivered: mode === 'vectors', summaryDelivered: mode === 'summary',
                delivery: mode === 'sillymemory' ? observation.delivery : null,
                sourcePreserved: true, questionDelivered: true });
            assert.deepEqual(errors, []); await checkpoint();
        }
    }

    stage = 'cleanup';
    await page.evaluate(async ids => {
        const c = SillyTavern.getContext();
        for (const collectionId of ids) {
            const response = await fetch('/api/vector/purge', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ collectionId }) });
            if (!response.ok) throw new Error('Native purge failed');
        }
    }, [...vectors.keys()]);
    page.on('dialog', dialog => dialog.accept());
    await field('delete').click(); await status('Owned remote memory collection is no longer accessible');
    assert.equal(collections.size, 0); assert.equal(vectors.size, 0);
    assert.equal(report.traffic.hostBlocked, 0); assert.equal(report.traffic.browserBlocked, 0);
    assert.deepEqual(errors, []); assert.equal(report.rows.length, 16);
    report.passed = true;
} catch (e) {
    // Assertion diffs can contain entire source dialogues. Keep failure output bounded.
    const message = e.message.split('\n')[0].slice(0, 240);
    report.failure = { stage, message }; console.error(`FAILED ${stage}: ${message}`);
    process.exitCode = 1;
} finally {
    await browser?.close();
    if (host && host.exitCode === null) { const done = once(host, 'exit'); host.kill('SIGTERM'); await done; }
    if (bridge.listening) await new Promise(r => bridge.close(r));
    if (remote?.listening) await new Promise(r => remote.close(r));
    encoder.free();
    if (hostAdded) git('-C', hostSource, 'worktree', 'remove', '--force', source);
    await rm(work, { recursive: true, force: true });
    report.cleanup = true; report.errors = errors; await checkpoint();
    console.log(JSON.stringify({ passed: report.passed, rows: report.rows.length, cleanup: report.cleanup, output }));
}
