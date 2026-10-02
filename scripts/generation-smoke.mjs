// Full SillyTavern Generate/UI path + live LambdaDB. Model is deterministic by
// default; --live-model requires explicitly supplied compatible-model settings.
import { runChunking, chunkingBaseline, chunkingFiles } from './chunking-eval.mjs';
import { runHybrid, hybridFiles } from './hybrid-eval.mjs';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath, rename } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATURAL_RETRY, requestWithRetry } from './provider-retry.mjs';
import { PROVIDER_SPACING, createSpacedSender, summarizeProviderSpacing } from './provider-spacing.mjs';
import { fixtureFiles } from './natural-dialogue.mjs';
import { semanticFiles, verifySemanticPlan } from './semantic-long.mjs';
import { createDirectAdapter, directFiles, directProtocol, verifyDirectPlan } from './semantic-direct.mjs';
import { summaryFiles, summaryRetry, verifySummaryPlan } from './summarize-plan.mjs';
import { runSummarize } from './summarize-live.mjs';
import { createSummaryTrafficGuard } from './summary-traffic.mjs';
import { tuningFiles, tuningRetry, verifyTuningPlan } from './native-tuning-plan.mjs';
import { threeModeFiles, threeModeRetry, verifyThreeModePlan } from './three-mode-plan.mjs';
import { purgeNativeCollections } from './three-mode-native.mjs';
import { runSemanticDialogue } from './semantic-live.mjs';
import { verifyNaturalPlan, runNaturalDialogue } from './natural-eval.mjs';
import { runComparison } from './comparison-eval.mjs';
import { runChallenges } from './challenge-eval.mjs';
import { runKoreanEvaluation } from './korean-eval.mjs';
import { cleanupGenerationResources } from './generation-cleanup.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ST_SOURCE || '/tmp/sillymemory-st-source';
const revision = '06bde939fb1e9c4c8d8641d810f0a916b5bce127';
const env = parseEnv(await readFile(process.env.SM_ENV_FILE || path.join(root, '.env.local'), 'utf8'));
const chunkingMode = process.argv.includes('--chunking');
const hybridMode = process.argv.includes('--hybrid');
if (chunkingMode && hybridMode) throw new Error('Choose one retrieval experiment.');
const retrievalExperiment = chunkingMode || hybridMode;
const experimentFiles = hybridMode ? hybridFiles : chunkingFiles;
if (retrievalExperiment && ['--semantic','--natural','--comparison','--heldout','--challenges','--summarize','--native-tuning','--three-modes','--direct-embeddings','--korean-eval'].some(f => process.argv.includes(f))) throw new Error('Choose the retrieval experiment alone.');
const summarizeMode = process.argv.includes('--summarize');
if(summarizeMode && ['--semantic','--natural','--native-tuning','--three-modes','--direct-embeddings','--comparison','--korean-eval','--challenges','--heldout'].some(flag=>process.argv.includes(flag))) throw new Error('Choose --summarize without another evaluation mode');
const nativeTuning = process.argv.includes('--native-tuning');
const threeModes = process.argv.includes('--three-modes') || nativeTuning;
const semantic = process.argv.includes('--semantic') || threeModes || summarizeMode;
if (semantic && process.argv.includes('--natural')) throw new Error('Choose one evaluation mode.');
const directEmbeddingsMode = process.argv.includes('--direct-embeddings');
if (directEmbeddingsMode && (!semantic || threeModes)) throw new Error('--direct-embeddings requires --semantic');
const natural = process.argv.includes('--natural') || semantic;
const retryTransient = process.argv.includes('--retry-transient') || retrievalExperiment;
if (semantic && !retryTransient) throw new Error('--semantic requires the frozen --retry-transient policy');
if (retryTransient && !natural && !retrievalExperiment) throw new Error('--retry-transient requires --natural');
const retryBudget = { calls: 0, retries: 0 };
const frozenNatural = natural ? (semantic ? await (summarizeMode ? verifySummaryPlan : nativeTuning ? verifyTuningPlan : threeModes ? verifyThreeModePlan : directEmbeddingsMode ? verifyDirectPlan : verifySemanticPlan)(process.env.SM_NATURAL_PLAN) : await verifyNaturalPlan(process.env.SM_NATURAL_PLAN)) : null;
const comparison = process.argv.includes('--comparison');
const nativeComparison = comparison || threeModes;
const transportProtocol = retrievalExperiment ? { ...NATURAL_RETRY, maxCalls: hybridMode ? 24 : 20 } : summarizeMode ? summaryRetry : nativeTuning ? tuningRetry : threeModes ? threeModeRetry : NATURAL_RETRY;
const setupOnly = process.argv.includes('--comparison-setup');
const comparisonStart = Number(process.env.SM_COMPARE_START || 0);
if (!Number.isInteger(comparisonStart) || comparisonStart < 0 || comparisonStart > 53) throw new Error('Invalid SM_COMPARE_START');
const koreanEvaluation = process.argv.includes('--korean-eval');
const heldout = process.argv.includes('--heldout');
const challenges = process.argv.includes('--challenges') || heldout;
const challengeCount = heldout ? 24 : 12;
if ([comparison, koreanEvaluation, challenges, natural].filter(Boolean).length > 1) throw new Error('Choose one evaluation mode.');
const challengeStart = Number(process.env.SM_CHALLENGE_START || 0);
if (!Number.isInteger(challengeStart) || challengeStart < 0 || challengeStart >= challengeCount) throw new Error('Invalid SM_CHALLENGE_START');
const artifactTag = process.env.SM_ARTIFACT_TAG || '';
if (artifactTag && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(artifactTag)) throw new Error('Invalid SM_ARTIFACT_TAG.');
const liveModel = retrievalExperiment || process.argv.includes('--live-model') || koreanEvaluation || comparison || challenges || natural;
const hostContextTokens = natural ? frozenNatural.plan.settings.context : (koreanEvaluation || comparison || retrievalExperiment) ? 32768 : 8192;
const caseStart = koreanEvaluation ? Number(process.env.SM_CASE_START || 0) : 0;
if (!Number.isInteger(caseStart) || caseStart < 0 || caseStart > 7) throw new Error('SM_CASE_START must be an integer from 0 to 7.');
const sampleStart = koreanEvaluation ? Number(process.env.SM_SAMPLE_START ?? caseStart * 2) : 0;
if (!Number.isInteger(sampleStart) || sampleStart < 0 || sampleStart > 15) throw new Error('SM_SAMPLE_START must be an integer from 0 to 15.');
let transientRetriesRemaining = natural ? 0 : 1;
if (liveModel && !(env.LLM_BASE_URL && (process.env.SM_MODEL || env.LLM_MODEL) && env.LLM_API_KEY)) throw new Error('Live model requires LLM_BASE_URL, LLM_MODEL, and LLM_API_KEY in .env.local.');
const model = liveModel ? (process.env.SM_MODEL || env.LLM_MODEL) : 'sillymemory-deterministic-fixture';
if ((comparison || challenges || natural || retrievalExperiment) && (env.LLM_BASE_URL !== 'https://api.openai.com/v1' || model !== 'gpt-4.1-mini-2025-04-14')) throw new Error('Comparison requires the fixed OpenAI snapshot and endpoint.');
const generationIntervalMs = liveModel ? PROVIDER_SPACING.minimumIntervalMs : 0;
const maxOutputTokens = liveModel ? 256 : 100;
const reasoningEffort = liveModel ? env.LLM_REASONING_EFFORT : undefined;
if (reasoningEffort && !['none', 'minimal', 'low', 'medium', 'high'].includes(reasoningEffort)) throw new Error('Invalid LLM_REASONING_EFFORT.');
// Gemini rejects these fields emitted by the pinned host's generic Custom API.
// Use the host's documented body exclusions, not a prompt-rewriting bridge.
const excludedParameters = liveModel && new URL(env.LLM_BASE_URL).hostname === 'generativelanguage.googleapis.com' ? ['frequency_penalty', 'logprobs', 'top_logprobs'] : [];
const credentials = { endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME, key: env.LAMBDADB_PROJECT_API_KEY };
if (!summarizeMode && !nativeTuning && !Object.values(credentials).every(Boolean)) throw new Error('LambdaDB configuration is incomplete.');
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) throw new Error('Unexpected host revision.');
if (await realpath(path.join(source, 'public/scripts/extensions/third-party/sillymemory')) !== root) throw new Error('Host extension symlink must point to this checkout.');
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
const modeSuffix = hybridMode ? 'hybrid' : chunkingMode ? 'chunking' : natural ? (summarizeMode ? 'summarize' : nativeTuning ? 'native-tuning' : threeModes ? 'three-modes' : semantic ? 'semantic' : 'natural') : challenges ? `${heldout ? 'heldout' : 'challenges'}${challengeStart ? `-from-${challengeStart}` : ''}` : comparison ? `comparison${comparisonStart ? `-from-${comparisonStart}` : ''}${setupOnly ? '-setup' : ''}` : koreanEvaluation ? `korean-eval${process.env.SM_SAMPLE_START ? `-from-sample-${sampleStart}` : caseStart ? `-from-${caseStart}` : ''}` : liveModel ? 'live-model' : 'fixture-model';
const suffix = modeSuffix + (artifactTag ? `-${artifactTag}` : '');
const reportPath = path.join(artifacts, `generation-${suffix}.json`);
if (natural || retrievalExperiment) await writeFile(reportPath, JSON.stringify({ passed: false, incomplete: true }), { flag: 'wx' });
const naturalSourceFiles = ['src/chunking.js', 'index.js', 'src/chat-collections.js', 'src/client.js', 'src/gate.js', 'src/memory.js', 'src/context.js', 'src/status.js', 'scripts/generation-smoke.mjs', 'scripts/provider-spacing.mjs', 'scripts/generation-cleanup.mjs', 'scripts/natural-eval.mjs', 'scripts/natural-dialogue.mjs', ...(semantic ? [...semanticFiles, ...(summarizeMode ? summaryFiles : nativeTuning ? tuningFiles : threeModes ? threeModeFiles : []), ...(directEmbeddingsMode ? directFiles : [])] : fixtureFiles(frozenNatural?.plan.version)), ...(retryTransient ? ['scripts/provider-retry.mjs', 'docs/natural-dialogue-retry.md', 'scripts/natural-summary.mjs', 'scripts/natural-score.mjs'] : [])];
const naturalSourceSha256 = natural ? Object.fromEntries(await Promise.all(naturalSourceFiles.map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')]))) : null;
const experimentHashes = async () => Object.fromEntries(await Promise.all(['index.js', 'src/memory.js', 'src/client.js', 'src/chat-collections.js', 'src/context.js', 'scripts/generation-smoke.mjs', ...experimentFiles, 'src/chunking.js', 'src/gate.js', 'src/status.js', 'src/delivery.js', 'scripts/provider-retry.mjs', 'scripts/provider-spacing.mjs', 'scripts/generation-cleanup.mjs'].map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])));
const experimentSource = retrievalExperiment ? await experimentHashes() : null;
if (retrievalExperiment) await writeFile(reportPath + '.plan.json', JSON.stringify({ sourceSha256: experimentSource, baseline: hybridMode ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() : chunkingBaseline, model, context: hostContextTokens, maxOutputTokens, budget: 800, recent: 4, samples: hybridMode ? 16 : 12, transportProtocol, providerSpacing: PROVIDER_SPACING }, null, 2), { flag: 'wx' });
const pendingPath = path.join(artifacts, `generation-${suffix}-pending.json`);
const pending = { collections: [], connectionHash: createHash('sha256').update(JSON.stringify([credentials.endpoint, credentials.project])).digest('hex') };
await writeFile(pendingPath, JSON.stringify(pending), { flag: 'wx' });
const work = await mkdtemp(path.join(tmpdir(), 'sillymemory-generation-'));
const checks = [], generations = [], embeddings = [], vectorQueries = [], lambdaRequests = [];
const resumeReport=frozenNatural?.resumeReport;
if(resumeReport){generations.push(...structuredClone(resumeReport.generations));retryBudget.calls=resumeReport.providerCalls;retryBudget.retries=resumeReport.providerCalls-resumeReport.generations.length;}
const resumedEvidence=()=>resumeReport?{resume:{...frozenNatural.plan.resume,generations:resumeReport.generations.length,providerCalls:resumeReport.providerCalls}}:{};
const directEmbeddings = [];
const directEvidence = () => ({ embeddingMode: summarizeMode ? 'none' : nativeTuning ? 'native-openai' : directEmbeddingsMode ? 'direct-experimental' : 'managed', ...(directEmbeddingsMode ? { directProtocol, directEmbeddings } : {}) });
const transformDirect = directEmbeddingsMode ? createDirectAdapter({ key: env.LLM_API_KEY, rows: directEmbeddings, stage: () => stage }) : null;
const lambdaRequestMap = new Map();
const redact = value => { let output = JSON.stringify(value, null, 2); for (const secret of [credentials.key, env.LLM_API_KEY, credentials.endpoint, credentials.project, env.LLM_BASE_URL].filter(Boolean)) output = output.replaceAll(secret, "[REDACTED]"); return output; };
async function checkpointNatural() {
    if (!natural && !retrievalExperiment) return;
    const temporary = `${reportPath}.tmp`;
    await writeFile(temporary, redact({ passed: false, incomplete: true, ...directEvidence(), evaluation, generations, providerCalls, ...resumedEvidence(), lambdaRequests, embeddings, vectorQueries, ...summaryTrafficEvidence(), transportProtocol: retryTransient ? transportProtocol : null, providerSpacing: PROVIDER_SPACING, sourceSha256: naturalSourceSha256 || experimentSource }));
    await rename(temporary, reportPath);
    summaryTraffic?.assertClean();
}
let nativeCleanupComplete = !nativeComparison, providerCalls = resumeReport?.providerCalls || 0;
let nativeCleanup = [];
let stage = 'startup', failRetrieval = false, server, browser, page, failure, cleanupComplete = false;
const summaryTraffic = summarizeMode ? createSummaryTrafficGuard({ embeddings, vectorQueries,
    stage: () => stage, onViolation: reason => { failure ||= { stage, reason }; } }) : null;
const summaryTrafficEvidence = () => summaryTraffic ? { nativeTrafficObservation: summaryTraffic.observation() } : {};
const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); console.log(`PASS ${name}`); };
const sendGeneration = createSpacedSender((body, signal) => {
    providerCalls++;
    return fetch(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` }, body, signal });
});
// This loopback test bridge is not an extension component or server plugin.
// Live provider keys remain in this process; the host only sees its local URL.
const bridge = createServer(async (req, res) => {
    if (summaryTraffic?.blockBridgeRequest(req, res)) return;
    if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: model, object: 'model' }] })); return; }
    if (nativeComparison && req.url === '/v1/embeddings') {
        const entry = { stage, startedAt: Date.now() }; embeddings.push(entry);
        try {
            const buffers = []; for await (const b of req) buffers.push(b);
            const body = JSON.parse(Buffer.concat(buffers).toString());
            const inputs = Array.isArray(body.input) ? body.input : [body.input];
            if (embeddings.length > (threeModes ? 800 : 300) || body.model !== 'text-embedding-3-small' || inputs.length > 5 || !inputs.every(s => typeof s === 'string' && s.length < 10000)) throw new Error('Embedding bound exceeded');
            entry.inputs = inputs.length;
            const upstream = await fetch(`${env.LLM_BASE_URL}/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
            entry.status = upstream.status; const payload = await upstream.json(); entry.usage = payload.usage; entry.elapsedMs = Date.now() - entry.startedAt;
            if (!upstream.ok) throw new Error('Embedding provider failed');
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload));
        } catch { entry.failed = true; res.writeHead(502); res.end('{"error":"Embedding test failed"}'); }
        return;
    }
    if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return; }
    try {
        summaryTraffic?.assertClean();
        const buffers = []; for await (const b of req) buffers.push(b);
        const body = JSON.parse(Buffer.concat(buffers).toString());
        const entry = { stage, messages: body.messages, stream: body.stream, model, maxOutputTokens: body.max_tokens, reasoningEffort: body.reasoning_effort, startedAt: Date.now() };
        if ((natural || retrievalExperiment) && (body.model !== model || body.temperature !== 0 || body.max_tokens !== 256)) throw new Error('Frozen model parameters changed');
        entry.requestOptions = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'messages'));
        generations.push(entry);
        if (liveModel) {
            let upstream; entry.attempts = [];
            if (retryTransient) {
                const controller = new AbortController();
                const cancel = () => { if (!res.writableEnded) controller.abort(); };
                res.once('close', cancel);
                upstream = await requestWithRetry({ body: JSON.stringify(body), budget: retryBudget, attempts: entry.attempts, signal: controller.signal, maxCalls: transportProtocol.maxCalls,
                        send: sendGeneration, checkpoint: checkpointNatural });
            } else for (;;) {
                if (comparison && (setupOnly || providerCalls >= 55 - comparisonStart)) throw new Error('Generation call bound exceeded');
                if (challenges && providerCalls >= challengeCount + 1 - challengeStart) throw new Error('Challenge call bound exceeded');
                if (natural && providerCalls >= frozenNatural.plan.schedule.length) throw new Error('Natural dialogue call bound exceeded');
                const attempt = { status: null }; entry.attempts.push(attempt);
                const attemptStarted = performance.now();
                try {
                    upstream = await sendGeneration(JSON.stringify(body), AbortSignal.timeout(90000), attempt);
                    attempt.status = upstream.status;
                } finally { attempt.elapsedMs = performance.now() - attemptStarted; }
                if (upstream.status !== 503 || transientRetriesRemaining === 0) break;
                transientRetriesRemaining--;
                await upstream.body?.cancel();
                const retrySeconds = Number(upstream.headers.get('retry-after'));
                // At most one transient retry per run. Never retry a quota error.
                const retryMs = Math.max(10000, Number.isFinite(retrySeconds) ? retrySeconds * 1000 : 0);
                if (retryMs > 30000) break;
                entry.attempts.at(-1).retryWaitMs = retryMs;
                console.log(`RETRY ${stage}: provider HTTP 503; waiting ${retryMs} ms`);
                await new Promise(resolve => setTimeout(resolve, retryMs));
            }
            entry.upstreamStatus = upstream.status;
            if (!upstream.ok) {
                const payload = await upstream.json().catch(() => ({}));
                const error = Array.isArray(payload) ? payload[0]?.error : payload.error;
                entry.providerError = { code: error?.code, status: error?.status, message: String(error?.message || 'Provider rejected request').slice(0, 1000), quotaViolations: error?.details?.flatMap(d => d.violations || []).map(v => ({ metric: v.quotaMetric, id: v.quotaId, limit: v.quotaValue })), retryDelay: error?.details?.find(d => d.retryDelay)?.retryDelay };
                res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Model provider rejected the test request' })); return;
            }
            res.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
            const decoder = new TextDecoder(); let responseText = '';
            for await (const data of upstream.body) { responseText += decoder.decode(data, { stream: true }); res.write(data); }
            responseText += decoder.decode();
            // Capture provider usage and completion text without storing headers or keys.
            const frames = body.stream
                ? responseText.split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]').map(line => JSON.parse(line.slice(5)))
                : [JSON.parse(responseText)];
            entry.providerAnswer = '';
            for (const frame of frames) {
                if (frame.usage) entry.providerUsage = frame.usage;
                const choice = frame.choices?.find(c => c.index === 0);
                if (choice?.finish_reason) entry.finishReason = choice.finish_reason;
                entry.providerAnswer += (body.stream ? choice?.delta?.content : choice?.message?.content) || '';
            }
            entry.responseMs = Date.now() - entry.startedAt; res.end(); return;
        }
        const text = JSON.stringify(body.messages);
        // Deliberately deterministic; this tests transport, not model intelligence.
        const answer = text.includes('in the stone tower') ? 'The blue compass is in the stone tower.' : text.includes('beneath the cedar tree') ? 'The blue compass is beneath the cedar tree.' : 'UNKNOWN';
        if (body.stream) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            for (const content of answer.match(/.{1,12}/g) || []) { res.write(`data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`); await new Promise(r => setTimeout(r, 20)); }
            res.end(`data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
        } else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }] })); }
        entry.responseMs = Date.now() - entry.startedAt;
    } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
});
await new Promise(r => bridge.listen(0, '127.0.0.1', r));
const port = Number(process.env.ST_GENERATION_PORT || 18128), url = `http://127.0.0.1:${port}`;
const bridgeUrl = `http://127.0.0.1:${bridge.address().port}/v1`;
let events = [], evaluation;
const field = name => page.locator(`#sillymemory [data-sm="${name}"]`);
const waitStatus = text => page.waitForFunction(text => document.querySelector('[data-sm="status"]')?.textContent.includes(text), text, { timeout: 90000 });
async function openSettings() {
    if (!await field('endpoint').isVisible()) {
        if (!await page.locator('#sillymemory .inline-drawer-toggle').isVisible()) await page.locator('#extensions-settings-button .drawer-toggle').click();
        if (!await field('endpoint').isVisible()) await page.locator('#sillymemory .inline-drawer-toggle').click();
    }
}
async function seed(location = 'beneath the cedar tree') {
    await page.evaluate(async location => {
        const c = SillyTavern.getContext();
        const messages = Array.from({ length: 16 }, (_, i) => ({
            name: i % 2 ? 'User' : 'Mira', is_user: Boolean(i % 2), is_system: false, send_date: Date.now(), extra: {},
            mes: i === 0 ? `Remember this fact: Mira hid the blue compass ${location}.` : i === 15 ? 'RECENT_KEEP_B: We are ready for the next question.' : i === 14 ? 'RECENT_KEEP_A: We have returned to the garden.' : `DISTRACTOR_${i}: ${'We sorted ordinary blank sheets of paper and counted empty baskets. '.repeat(8)}`,
        }));
        c.chat.splice(0, c.chat.length, ...messages); await c.saveChat(); await c.reloadCurrentChat();
    }, location);
    if (await field('enabled').isChecked()) await waitStatus('synchronized');
}
async function generate(name, type = 'normal', streaming = false, evaluationOptions) {
    stage = name; const start = generations.length;
    const continuationPrefix = type === 'continue' ? await page.evaluate(() => SillyTavern.getContext().chat.at(-1)?.mes || '') : '';
    const generationStart = performance.now();
    await page.evaluate(async ({ type, streaming, question }) => {
        const { oai_settings } = await import('/scripts/openai.js'); oai_settings.stream_openai = streaming;
        if (type === 'normal') document.querySelector('#send_textarea').value = question || 'Where is the blue compass? Answer with the location, or UNKNOWN if no fact is available.';
        await SillyTavern.getContext().generate(type);
    }, { type, streaming, question: evaluationOptions?.question });
    const generationElapsedMs = performance.now() - generationStart;
    if (generations.length !== start + 1) throw new Error('Expected exactly one final model request');
    const result = await page.evaluate(() => {
        const c = SillyTavern.getContext();
        return { last: c.chat.at(-1)?.mes, isUser: c.chat.at(-1)?.is_user, chatLength: c.chat.length, inspection: document.querySelector('[data-sm="inspection"]').textContent, chatId: c.getCurrentChatId() };
    });
    const request = generations.at(-1);
    request.answer = result.last; request.generationElapsedMs = generationElapsedMs;
    // Exclude only initial pacing; retry waits remain part of generation latency.
    request.generationMs = generationElapsedMs - (request.attempts?.[0]?.spacingWaitMs || 0);
    request.promptCharacters = JSON.stringify(request.messages).length;
    request.hostTextTokens = await page.evaluate(async messages => SillyTavern.getContext().getTokenCountAsync(messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n')), request.messages);
    request.memoryInspection = result.inspection;
    assert(!result.isUser && typeof result.last === 'string' && result.last.length > 0, `${name}: generated assistant response saved`);
    if (liveModel) {
        assert(request.upstreamStatus === 200 && request.finishReason === 'stop' && (type === 'continue' ? (continuationPrefix + request.providerAnswer).replace(/\s/g, '') === result.last.replace(/\s/g, '') : request.providerAnswer.trim() === result.last.trim()), `${name}: complete provider answer matches saved host message`);
        if (!evaluationOptions?.evaluate) {
            const expected = name === 'after-delete' ? 'UNKNOWN' : ['after-edit', 'streaming-regenerate', 'swipe-generation', 'native-branch'].includes(name) ? 'stone tower' : 'cedar tree';
            request.expectedAnswer = expected;
            // A narrow synthetic-fact check, not a general semantic quality evaluator.
            request.answerMatchesExpected = expected === 'UNKNOWN' ? /^UNKNOWN[.!]?$/i.test(result.last.trim()) : result.last.toLowerCase().includes(expected) && !result.last.toLowerCase().includes(expected === 'stone tower' ? 'cedar tree' : 'stone tower');
            assert(request.answerMatchesExpected, `${name}: answer matches the synthetic source fact`);
        }
    }
    return { ...result, request, prompt: JSON.stringify(request.messages) };
}
try {
    if (natural || retrievalExperiment) {
        stage = 'fixed model availability';
        const response = await fetch(`${env.LLM_BASE_URL}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${env.LLM_API_KEY}` }, signal: AbortSignal.timeout(30000) });
        assert(response.ok && (await response.json()).id === model, 'fixed model is available; no substitution');
    }
    const configPath = path.join(work, 'config.yaml'); await writeFile(configPath, await readFile(path.join(source, 'default/config.yaml')));
    server = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', path.join(work, 'data'), '--port', String(port), '--listen', 'false', '--browserLaunchEnabled', 'false', '--corsProxy', 'true'], { cwd: source, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw new Error('Host exited'); try { if ((await fetch(url)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
    if (!ready) throw new Error('Host startup timeout');
    browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(20000);
    if (natural || retrievalExperiment) {
        const finishRequest = (request, failed = false) => {
            const entry = lambdaRequestMap.get(request); if (!entry) return;
            if (failed) { entry.failed = true; entry.controller?.abort(); }
            if (entry.started !== undefined) entry.elapsedMs = performance.now() - entry.started;
            if (entry.forwarded !== undefined) entry.databaseMs = performance.now() - entry.forwarded;
            delete entry.started; delete entry.forwarded;
        };
        page.on('response', response => { const entry = lambdaRequestMap.get(response.request()); if (entry) { entry.status = response.status(); if (!directEmbeddingsMode) finishRequest(response.request()); } });
        page.on('requestfinished', request => { if (directEmbeddingsMode) finishRequest(request); });
        page.on('requestfailed', request => finishRequest(request, true));
    }
    // Persist only non-secret ownership metadata before any collection creation.
    if (chunkingMode) {
        const baseline = execFileSync('git', ['show', `${chunkingBaseline}:src/memory.js`], { cwd: root, encoding: 'utf8' });
        await page.route('**/src/memory-baseline.js', route => route.fulfill({ contentType: 'text/javascript', body: baseline }));
    }
    await page.route('**/proxy/**', async route => {
        const req = route.request(); const target = new URL(decodeURIComponent(new URL(req.url()).pathname.split('/proxy/')[1]));
        if (natural || retrievalExperiment) { const entry = { stage, method: req.method(), path: target.pathname.replace(/^\/projects\/[^/]+/, ''), started: performance.now() }; lambdaRequests.push(entry); lambdaRequestMap.set(req, entry); }
        if (req.method() === 'POST' && target.pathname.endsWith('/collections')) {
            const body = req.postDataJSON(); pending.collections.push({ name: body.collectionName, owner: body.tags.owner });
            await writeFile(pendingPath, JSON.stringify(pending, null, 2));
        }
        if (failRetrieval && target.pathname.endsWith('/query')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Injected test failure"}' });
        if (transformDirect) {
            const entry = lambdaRequestMap.get(req), controller = new AbortController();
            Object.defineProperty(entry, 'controller', { value: controller });
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(directProtocol.requestDeadlineMs)]);
            try {
                if (target.origin !== new URL(credentials.endpoint).origin || !target.pathname.startsWith(`/projects/${credentials.project}/collections`)) throw new Error('Unexpected experiment destination');
                const relative = target.pathname.replace(/^\/projects\/[^/]+/, '');
                const name = relative.split('/')[2];
                if (name && !pending.collections.some(item => item.name === name)) throw new Error('Unowned experiment collection');
                const body = req.postData() ? req.postDataJSON() : undefined;
                const transformed = await transformDirect(relative, body, { signal, requestIndex: lambdaRequests.indexOf(entry) });
                signal.throwIfAborted();
                if (performance.now() - entry.started >= directProtocol.requestDeadlineMs || entry.failed) throw new Error('Direct request expired');
                entry.forwarded = performance.now();
                await route.continue(transformed === undefined ? {} : { postData: JSON.stringify(transformed) });
            } catch {
                entry.adapterFailed = true;
                await route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Temporary direct embedding experiment failed"}' }).catch(() => {});
            }
            return;
        }
        await route.continue();
    });
    if (summaryTraffic) await summaryTraffic.installVectorRoutes(page);
    if (nativeComparison) await page.route('**/api/vector/query', async route => {
        const response = await route.fetch();
        const payload = await response.json();
        vectorQueries.push({ stage, status: response.status(), request: route.request().postDataJSON(), result: payload });
        await route.fulfill({ response });
    });
    await page.goto(url); await page.getByText('Welcome to SillyTavern!', { exact: true }).waitFor(); await page.getByText('Save', { exact: true }).last().click();
    await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    // Configure the real host via its controls/settings. Never give it an LLM key.
    stage = 'configure model connection';
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.evaluate(async ({ bridgeUrl, model, maxOutputTokens, reasoningEffort, excludedParameters, hostContextTokens, instruction }) => {
        const { oai_settings } = await import('/scripts/openai.js');
        Object.assign(oai_settings, { custom_url: bridgeUrl, custom_model: model, custom_include_headers: '', custom_include_body: reasoningEffort ? `reasoning_effort: ${reasoningEffort}` : '', custom_exclude_body: excludedParameters.map(name => `- ${name}`).join('\n'), openai_max_context: hostContextTokens, openai_max_tokens: maxOutputTokens, temp_openai: 0, stream_openai: false });
        const { saveSettings } = await import('/script.js'); await saveSettings();
        const c = SillyTavern.getContext(); const data = new FormData(); data.set('ch_name', 'SillyMemory E2E Mira'); data.set('description', instruction || 'A synthetic recall test character. Answer questions only from the supplied conversation.'); data.set('first_mes', 'Ready for a synthetic test.');
        const r = await fetch('/api/characters/create', { method: 'POST', headers: c.getRequestHeaders({ omitContentType: true }), body: data }); if (!r.ok) throw new Error('Character creation failed');
    }, { bridgeUrl, model, maxOutputTokens, reasoningEffort, excludedParameters, hostContextTokens, instruction: frozenNatural?.plan.generation.instruction });
    await page.reload(); await page.locator('#sillymemory').waitFor({ state: 'attached', timeout: 45000 });
    await page.locator('#rightNavHolder .drawer-toggle').click(); await page.locator('.character_select').filter({ hasText: 'SillyMemory E2E Mira' }).click();
    await page.locator('#api_button_openai').dispatchEvent('click');
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection', { timeout: 30000 });
    await page.evaluate(() => {
        const c = SillyTavern.getContext(); globalThis.generationTestEvents = [];
        for (const name of ['MESSAGE_SENT','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPED','GENERATION_ENDED','STREAM_TOKEN_RECEIVED']) c.eventSource.on(c.eventTypes[name], () => globalThis.generationTestEvents.push(name));
    });
    assert(true, 'real host connected to the selected completion endpoint');
    stage = 'UI LambdaDB setup'; await openSettings();
    if (!nativeTuning && !summarizeMode) {
    await page.evaluate(({ endpoint, project, key }) => { for (const [name, value] of Object.entries({ endpoint, project, key })) document.querySelector(`[data-sm="${name}"]`).value = value; }, credentials);
    await field('connect').click(); await field('gate').click(); await waitStatus('Transport gate passed');
    await field('provision').click(); await waitStatus('Chat memory is ready');
    }
    if (retrievalExperiment) {
        evaluation = {};
        await (hybridMode ? runHybrid : runChunking)({ page, field, openSettings, waitStatus, generate, setStage: value => { stage = value; }, result: evaluation, checkpoint: checkpointNatural, credentials });
        events = await page.evaluate(() => globalThis.generationTestEvents);
    } else if (natural) {
        evaluation = {};
        await (summarizeMode ? runSummarize : semantic ? runSemanticDialogue : runNaturalDialogue)({ generations, page, field, openSettings, waitStatus, generate, assert, setStage: value => { stage = value; }, result: evaluation, frozen: frozenNatural, checkpoint: checkpointNatural, bridgeUrl, vectorQueries });
        events = await page.evaluate(() => globalThis.generationTestEvents);
    } else if (comparison) {
        evaluation = {};
        await runComparison({ page, field, openSettings, waitStatus, generate, assert, setStage: value => { stage = value; }, bridgeUrl, vectorQueries, startSample: comparisonStart, setupOnly, result: evaluation });
        events = await page.evaluate(() => globalThis.generationTestEvents);
    } else if (challenges) {
        evaluation = {};
        await runChallenges({ page, field, openSettings, waitStatus, generate, assert, setStage: value => { stage = value; }, result: evaluation, startSample: challengeStart, heldout });
        events = await page.evaluate(() => globalThis.generationTestEvents);
    } else if (koreanEvaluation) {
        evaluation = await runKoreanEvaluation({ page, field, openSettings, waitStatus, generate, assert, setStage: value => { stage = value; }, startCase: caseStart, startSample: sampleStart });
        events = await page.evaluate(() => globalThis.generationTestEvents);
    } else {
        await field('recent').fill('3'); await field('recent').dispatchEvent('change'); await field('budget').fill('220'); await field('budget').dispatchEvent('change');
        assert(true, 'real settings buttons completed the live LambdaDB gate and provisioning');
        await seed(); const baseline = await generate('memory-off');
        assert(baseline.prompt.includes('DISTRACTOR_1'), 'memory-off final request contains older full history');
        await seed(); await openSettings(); await field('enabled').check(); await waitStatus('synchronized');
        const on = await generate('memory-on');
        assert(on.prompt.includes('Past conversation excerpt') && on.prompt.includes('beneath the cedar tree'), 'final model request contains retrieved live memory');
        assert(on.prompt.includes('RECENT_KEEP_A') && on.prompt.includes('RECENT_KEEP_B'), 'final model request retains recent complete messages');
        assert(on.request.promptCharacters < baseline.request.promptCharacters, 'memory-on reduces this fixture final prompt size');
        assert(!on.prompt.includes('DISTRACTOR_1'), 'older full distractor message omitted from final request');
        assert(await page.evaluate(() => SillyTavern.getContext().chat[1].mes.includes('DISTRACTOR_1')), 'prompt pruning preserves source conversation');
        // Edit with the host's actual message editor.
        stage = 'native edit';
        await page.locator('#extensions-settings-button .drawer-toggle').click();
        await page.locator('.mes[mesid="0"] .mes_edit').click();
        await page.locator('#curEditTextarea').fill('Remember this fact: Mira hid the blue compass in the stone tower.');
        await page.locator('.mes[mesid="0"] .mes_edit_done').click(); await waitStatus('synchronized');
        // Remove generated answer before regeneration so stale answers cannot answer the query.
        await page.evaluate(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(c.chat.length - 1); });
        const edited = await generate('after-edit', 'regenerate');
        assert(edited.prompt.includes('in the stone tower') && !edited.prompt.includes('beneath the cedar tree'), 'native edit reaches the final request without the old fact');
        const streamed = await generate('streaming-regenerate', 'regenerate', true);
        assert(streamed.request.stream, 'real generation consumed an SSE streaming response');
        const swiped = await generate('swipe-generation', 'swipe', true);
        assert(swiped.prompt.includes('in the stone tower'), 'swipe generation uses current memory');
        stage = 'native branch';
        await page.evaluate(async () => { const c = SillyTavern.getContext(); const { createBranch } = await import('/scripts/bookmarks.js'); const name = await createBranch(c.chat.length - 1); if (!name) throw new Error('Branch failed'); await c.openCharacterChat(name); });
        await waitStatus('synchronized');
        const branched = await generate('native-branch');
        assert(branched.chatId !== on.chatId && branched.prompt.includes('in the stone tower'), 'native branch completes generation with its own synchronized memory');
        // Use a clean fixture for deletion/failure so answers cannot carry older facts.
        await seed('in the stone tower'); await page.evaluate(async () => { await SillyTavern.getContext().deleteMessage(0); }); await waitStatus('synchronized');
        const deleted = await generate('after-delete');
        assert(!deleted.prompt.includes('in the stone tower') && !deleted.prompt.includes('beneath the cedar tree'), 'deleted source fact is absent from final request');
        await seed(); failRetrieval = true; const fallback = await generate('retrieval-failure'); failRetrieval = false;
        assert(fallback.prompt.includes('DISTRACTOR_1') && !fallback.prompt.includes('Past conversation excerpt'), 'retrieval failure still generates from original full prompt');
        events = await page.evaluate(() => globalThis.generationTestEvents);
        assert(events.includes('MESSAGE_RECEIVED') && events.includes('STREAM_TOKEN_RECEIVED') && events.includes('MESSAGE_UPDATED') && events.includes('MESSAGE_DELETED'), 'host emitted real generation streaming edit and deletion events');
        await openSettings(); await field('enabled').uncheck();
        const disabled = await generate('disabled-again');
        assert(!disabled.prompt.includes('Past conversation excerpt'), 'disable removes injected memory from final request');
    }
    stage = 'secret audit';
    const serialized = await page.evaluate(async () => { const c = SillyTavern.getContext(); const r = await fetch('/api/settings/get', {method:'POST', headers:c.getRequestHeaders(), body:'{}'}); return JSON.stringify({local:{...localStorage},session:{...sessionStorage},settings:await r.json()}); });
    assert((!credentials.key || !serialized.includes(credentials.key)) && (!env.LLM_API_KEY || !serialized.includes(env.LLM_API_KEY)), 'real keys are absent from browser and persisted host settings');
} catch (e) {
    failure = { stage, reason: e instanceof Error && !e.name.includes('Timeout') && !String(e.message).includes('\n') ? e.message : 'Host/browser step did not complete' };
    // Do not print raw browser exceptions: they can contain typed inputs/URLs.
    console.log(`FAIL ${stage}`);
} finally {
    stage = 'cleanup';
    if (pending.collections.length === 0) { cleanupComplete = true; await rm(pendingPath, { force: true }); }
    if (page && !page.isClosed()) {
        try {
            failRetrieval = false;
            const cleanup = await cleanupGenerationResources({ purgeNative: async () => {
                if (threeModes) {
                    nativeCleanup = await purgeNativeCollections(page);
                    assert(nativeCleanup.every(row => row.remaining.length === 0), 'all native synthetic collections purged');
                } else if (comparison) {
                    nativeCleanupComplete = await page.evaluate(async () => {
                        $('#vectors_enabled_chats').prop('checked', false).trigger('input');
                        const c = SillyTavern.getContext(), v = c.extensionSettings.vectors;
                        const body = JSON.stringify({ collectionId: c.getCurrentChatId(), source: v.source, model: v.vllm_model, apiUrl: v.alt_endpoint_url });
                        const options = { method: 'POST', headers: c.getRequestHeaders(), body };
                        const purged = await fetch('/api/vector/purge', options);
                        const list = await fetch('/api/vector/list', options);
                        return purged.ok && list.ok && (await list.json()).length === 0;
                    });
                    assert(nativeCleanupComplete, 'native synthetic vector index purged and verified empty');
                }
            }, deleteRemote: async () => {
                if (nativeTuning || summarizeMode) { assert(lambdaRequests.length === 0, 'native-only comparison made no LambdaDB requests'); return; }
                const hasMemory = await page.evaluate(() => {
                    const owner = SillyTavern.getContext().extensionSettings.sillymemory?.owner;
                    return Boolean(JSON.parse(localStorage.getItem(`sillymemory:state:${owner}`) || '{}').ready);
                });
                if (hasMemory) {
                    // The shipped deletion path invalidates retrieval and drains writes.
                    // If it fails, retain the pending record instead of racing deletion.
                    await openSettings();
                    page.once('dialog', dialog => dialog.accept());
                    await field('delete').click();
                    await waitStatus('Owned remote memory collection is no longer accessible');
                    assert(true, 'settings deletion drains writes and removes owned memory');
                }
                await page.evaluate(async ({ credentials, collections }) => {
                    const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
                    const client = new LambdaClient(credentials, credentials.key, { headers: () => SillyTavern.getContext().getRequestHeaders() });
                    try { for (const item of collections) await client.deleteOwnedCollection(item.name, item.owner); }
                    finally { client.forget(); }
                }, { credentials, collections: pending.collections });
                console.log('PASS owned test collections cleaned up');
            }, removePending: () => rm(pendingPath, { force: true }) });
            ({ nativeCleanupComplete, cleanupComplete } = cleanup);
            if (!nativeCleanupComplete || !cleanupComplete) console.log('Cleanup incomplete; keep pending resource record.');
        } catch { console.log('Cleanup incomplete; keep pending resource record.'); }
    }
    const sourceSha256 = {};
    for (const file of [...(retrievalExperiment ? [...experimentFiles, 'scripts/provider-retry.mjs'] : []), 'src/chunking.js', 'index.js', 'src/chat-collections.js','src/client.js','src/gate.js','src/memory.js', 'src/context.js','src/status.js','scripts/generation-smoke.mjs','scripts/provider-spacing.mjs','scripts/generation-cleanup.mjs','scripts/korean-eval.mjs','scripts/korean-fixture.mjs','scripts/comparison-fixture.mjs','scripts/comparison-eval.mjs','scripts/challenge-eval.mjs','scripts/recall-challenges.mjs','scripts/heldout-fixture.mjs', ...(natural ? ['scripts/natural-eval.mjs', 'scripts/natural-dialogue.mjs', ...(semantic ? [...semanticFiles, ...(summarizeMode ? summaryFiles : nativeTuning ? tuningFiles : threeModes ? threeModeFiles : []), ...(directEmbeddingsMode ? directFiles : [])] : fixtureFiles(frozenNatural?.plan.version)), ...(retryTransient ? ['scripts/provider-retry.mjs', 'docs/natural-dialogue-retry.md', 'scripts/natural-summary.mjs', 'scripts/natural-score.mjs'] : [])] : [])]) sourceSha256[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    if (natural && Object.entries(naturalSourceSha256).some(([file, digest]) => sourceSha256[file] !== digest)) failure ||= { stage: 'source identity', reason: 'Source changed during execution' };
    if ((natural || retrievalExperiment) && !failure) {
        try { assert(summarizeProviderSpacing(resumeReport ? generations.slice(resumeReport.generations.length) : generations, PROVIDER_SPACING).verified, 'actual provider starts respect the 15-second interval'); }
        catch (error) { failure = { stage: 'provider spacing', reason: error.message }; }
    }
    if (retrievalExperiment && JSON.stringify(await experimentHashes()) !== JSON.stringify(experimentSource)) failure ||= { stage, reason: 'Experiment producer changed during run' };
    const report = { ...(retrievalExperiment ? { initialSourceSha256: experimentSource, lambdaRequests, transportProtocol, providerSpacing: PROVIDER_SPACING } : {}), ...directEvidence(), ...resumedEvidence(), ...summaryTrafficEvidence(), time:new Date().toISOString(), sillyTavern:revision, lambdaDB:summarizeMode ? 'unused' : 'live', generator:liveModel?'live compatible model':'deterministic test fixture, not a real LLM', model, generationIntervalMs, maxOutputTokens, reasoningEffort, excludedParameters, hostContextTokens, evaluation, embeddings, vectorQueries, ...(natural ? { lambdaRequests, transportProtocol: retryTransient ? transportProtocol : null, providerSpacing: PROVIDER_SPACING, initialSourceSha256: naturalSourceSha256, managedEmbeddingUsage: null, managedEmbeddingCost: null, semanticScores: null } : {}), nativeCleanupComplete, ...(threeModes ? { nativeCleanup } : {}), providerCalls, checks, failure, events, generations, cleanupComplete, sourceSha256, passed:!failure&&cleanupComplete&&nativeCleanupComplete };
    let output = JSON.stringify(report,null,2);
    for (const value of [credentials.key,env.LLM_API_KEY,credentials.endpoint,credentials.project,env.LLM_BASE_URL].filter(Boolean)) output=output.replaceAll(value,'[REDACTED]');
    await writeFile(reportPath,output);
    await browser?.close(); if (server && server.exitCode===null) {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
    await new Promise(r=>bridge.close(r)); await rm(work,{recursive:true,force:true});
}
process.exitCode = failure || !cleanupComplete || !nativeCleanupComplete ? 1 : 0;
