// Bounded direct-provider experiment, reusing saved comparison answers without regeneration.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { adaptLongMemEval, sha, literalBenchmarkText } from '../benchmark/shared/longmemeval-input.mjs';
import { openCheckpoint } from './benchmark-checkpoint.mjs';
import { segmentHistory, summaryRequest, selectionRequest, selectMemories, replaceMemory, boundSummary, jevJudgeRequest, jevDecision } from './segment-summary.mjs';
import { loadSummaryTokenizer } from './segment-summary-tokenizer.mjs';
const [mode, directory, datasetFile, baselineFile, judgeFile, tokenizerRoot, historicalFile] = process.argv.slice(2);
assert(['prepare', 'run'].includes(mode) && historicalFile, 'Usage: segment-summary-eval.mjs prepare|run OUT DATA BASELINES JUDGE TOKENIZER_ROOT HISTORICAL_RESULTS');
const out = path.resolve(directory);
await mkdir(out, { recursive: true, mode: 0o700 });
const bytes = await readFile(datasetFile), baselinesBytes = await readFile(baselineFile), judgeBytes = await readFile(judgeFile);
const historicalBytes = await readFile(historicalFile), historical = JSON.parse(historicalBytes);
assert.equal(sha(judgeBytes), 'ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251', 'Unpinned official evaluator');
const sourceLock = JSON.parse(await readFile(new URL('../docs/benchmarks/sources-v1.json', import.meta.url)));
assert.equal(sha(bytes), sourceLock.files.find(f => f.dataset === 'longmemeval').sha256);
const baselines = JSON.parse(baselinesBytes), allData = JSON.parse(bytes);
const ids = Object.keys(baselines).sort(); assert.equal(ids.length, 50);
assert.equal(historical.config.baselineSha256, sha(baselinesBytes));
assert.equal(historical.config.datasetSha256, sha(bytes));
assert.equal(historical.config.summaryTargetWords, 400);
assert.deepEqual([...historical.config.ids].sort(), ids);
assert.equal(historical.rows.length, 100);
for (const id of ids) for (const arm of ['summary', 'control']) {
    const rows = historical.rows.filter(r => r.id === id && r.arm === arm);
    assert.equal(rows.length, 1);
    assert(rows[0].operationalFailure ? rows[0].answer === null : typeof rows[0].answer === 'string' && rows[0].answer.trim());
}
const require = createRequire(path.join(path.resolve(tokenizerRoot), 'package.json'));
const tokenizer = await loadSummaryTokenizer(require), count = tokenizer.count;
const tokens = messages => 16 + messages.reduce((n, m) => n + count(m.content) + 16, 0);
const cases = allData.filter(r => ids.includes(r.question_id)).map(row => {
    const input = adaptLongMemEval(row);
    input.messages.forEach(m => { m.content = literalBenchmarkText(m.content); });
    input.question = literalBenchmarkText(input.question);
    let offset = 0;
    row.haystack_sessions.forEach((session, i) => session.forEach(() => Object.assign(input.messages[offset++], { session: i + 1, date: row.haystack_dates[i] })));
    const baseline = baselines[row.question_id].body;
    assert.deepEqual(Object.keys(baseline).sort(), ['max_completion_tokens', 'messages', 'model', 'reasoning_effort', 'stream'].sort());
    assert.equal(baseline.model, 'gpt-6.1-sol'); assert.equal(baseline.reasoning_effort, 'low');
    assert.equal(baseline.max_completion_tokens, 4096); assert.equal(baseline.stream, false);
    assert.equal(baseline.messages.at(-2).content, input.question);
    assert.equal(baseline.messages.at(-2).role, 'user'); assert.equal(baseline.messages.at(-1).role, 'system');
    assert(baseline.messages.slice(0, 3).every(m => m.role === 'system'));
    const partition = segmentHistory(input.messages);
    assert.deepEqual(baseline.messages.slice(-6, -2), partition.recent.map(({ role, content }) => ({ role, content })), `Recent partition mismatch: ${row.question_id}`);
    for (const segment of partition.segments) assert(tokens(summaryRequest(segment)) + 4096 <= 32768, 'Segment exceeds context; do not truncate');
    assert(tokens(baseline.messages) + 4096 <= 32768);
    jevJudgeRequest(judgeTemplate(row), row, 'offline validation');
    return { row, input, baseline, ...partition };
});
const summaryCalls = cases.reduce((n, c) => n + c.segments.length, 0);
assert.equal(cases.length, 50, 'All frozen IDs must exist in the dataset');
const config = { version: 'segment-summary-400chars-v1', historicalSha256: sha(historicalBytes), datasetSha256: sha(bytes), baselineSha256: sha(baselinesBytes), judgeSha256: sha(judgeBytes),
    tokenizer: tokenizer.identity,
    codeSha256: sha(Buffer.concat(await Promise.all(['segment-summary.mjs', 'segment-summary-eval.mjs', 'segment-summary-tokenizer.mjs', 'benchmark-checkpoint.mjs',
        'benchmark-audit.mjs', 'benchmark-development-input.mjs', 'benchmark-host-input.mjs'].map(f => readFile(new URL(f, import.meta.url)))))),
    ids, summaryCalls, selectionCalls: cases.filter(c => c.segments.length > 5).length, answerCalls: 50, judgeCalls: 50 + historical.rows.filter(r => !r.operationalFailure).length,
    segmentMessages: 40, summaryMaxCharacters: 400, characterUnit: 'Unicode code points including whitespace and punctuation; deterministic prefix cap, raw output retained', recentMessages: 4, recentSummaries: 3, olderSelections: 2, memoryTokens: 4096,
    generator: 'gpt-6.1-sol', reasoning: 'low', judge: 'jev-1.13.0', judgeType: 'noul', judgeThreshold: 0.50, concurrency: 4,
    limits: { calls: summaryCalls + 150 + historical.rows.filter(r => !r.operationalFailure).length, reservedUsd: 60 }, durationMs: 7200000,
    pricingReservation: { generatorInputPerMillion: 2.5, generatorOutputPerMillion: 10, judgeInputPerMillion: 0.042, judgeOutputPerMillion: 0 },
    notes: 'Only 400-character summaries/selection/answers are newly generated. Saved 400-word and historical Query1 answers are rejudged, never regenerated. Final incomplete segment is flushed at the evaluation checkpoint. Invalid selections/budget overflow count as failed cases without retry. Not a production replica or host latency measurement.' };
const planFile = path.join(out, 'plan.json');
if (mode === 'prepare') {
    await writeFile(planFile, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: 'prepared', cases: cases.length, summaryCalls, maximumCalls: config.limits.calls,
        summaryInputTokens: cases.reduce((n,c) => n+c.segments.reduce((v,s) => v+tokens(summaryRequest(s)),0),0), limits: config.limits }));
    tokenizer.free(); process.exit(0);
}
assert.deepEqual(JSON.parse(await readFile(planFile)), config, 'Frozen plan changed');
const env = parseEnv(await readFile(process.env.SM_ENV_FILE, 'utf8'));
assert.equal(env.LLM_BASE_URL, 'https://api.openai.com/v1'); assert(env.LLM_API_KEY); assert(env.TYPESAFE_API_KEY?.trim());
const secretValues = Object.entries(env).filter(([k, v]) => /KEY|TOKEN|SECRET|PASSWORD/.test(k) && v.length >= 8).map(([,v]) => v);
const safe = text => { for (const secret of secretValues) text = text.replaceAll(secret, '[REDACTED]'); return text; };
const journal = await openCheckpoint(path.join(out, 'ledger'), config, config.limits);
const startedAt = journal.state.observations.start?.value.at ?? Date.now();
await journal.observe('start', { at: startedAt });
let canceled = false, firstFailure;
const expired = () => { assert(!canceled, 'Run stopped after another task failed'); assert(Date.now() - startedAt < config.durationMs, 'Run time bound exceeded'); };
async function call(id, kind, body) {
    assert(['summary', 'selection', 'answer'].includes(kind));
    if (kind === 'answer') assert(id.endsWith('/chars400/answer'), 'Comparison answers must never be regenerated');
    const inputTokens = tokens(body.messages), outputLimit = body.max_completion_tokens;
    assert(inputTokens + outputLimit <= 32768, 'Request context overflow');
    const reservedUsd = (inputTokens * 2.5 + outputLimit * 10) / 1e6;
    const providerId = `provider/${id}`;
    if (!journal.state.calls[providerId]) expired();
    await journal.call(`request/${id}`, body, {}, async () => body);
    const saved = await journal.call(providerId, body, { calls: 1, reservedUsd }, async () => {
        const start = Date.now();
        await journal.observe(`dispatch/${providerId}`, { at: start });
        let response, text;
        try {
            response = await fetch(env.LLM_BASE_URL + '/chat/completions', { method: 'POST', headers: {
                Authorization: `Bearer ${env.LLM_API_KEY}`, 'Content-Type': 'application/json',
            }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
            text = safe(await response.text());
        } catch { throw new Error('Unknown provider delivery; retained intent is not automatically resent'); }
        return { id, kind, start, elapsedMs: Date.now() - start, status: response.status, text };
    });
    const receipt = saved.value;
    assert.equal(receipt.status, 200, `Provider HTTP ${receipt.status}; receipt retained, no automatic retry`);
    const result = JSON.parse(receipt.text), choice = result.choices?.[0];
    assert.equal(choice?.finish_reason, 'stop', 'Incomplete generation retained without quality retry');
    assert(typeof choice.message?.content === 'string' && choice.message.content.trim());
    assert(Number.isInteger(result.usage?.prompt_tokens) && Number.isInteger(result.usage?.completion_tokens));
    assert(result.usage.prompt_tokens <= inputTokens, 'Tokenizer reservation underestimated provider input');
    assert(result.usage.completion_tokens <= outputLimit);
    return { text: choice.message.content, usage: result.usage, elapsedMs: receipt.elapsedMs, reused: saved.reused };
}
async function judge(id, body) {
    const providerId = `provider/${id}`;
    if (!journal.state.calls[providerId]) expired();
    await journal.call(`request/${id}`, body, {}, async () => body);
    // UTF-8 byte count plus overhead is deliberately conservative for this short request.
    const reservedInput = Buffer.byteLength(JSON.stringify(body)) + 4096;
    const saved = await journal.call(providerId, body, { calls: 1, reservedUsd: reservedInput * 0.042 / 1e6 }, async () => {
        const start = Date.now();
        await journal.observe(`dispatch/${providerId}`, { at: start });
        let response, text;
        try {
            response = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: {
                Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json',
            }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
            text = safe(await response.text());
        } catch { throw new Error('Unknown judge delivery; retained intent is not automatically resent'); }
        return { id, kind: 'judge', start, elapsedMs: Date.now() - start, status: response.status, text };
    });
    assert.equal(saved.value.status, 200, 'Judge HTTP failure; receipt retained without retry');
    const result = JSON.parse(saved.value.text), decision = jevDecision(result);
    assert(result.usage.input_tokens <= reservedInput, 'Judge reservation underestimated input');
    return { ...decision, judgeUsage: result.usage };
}
const generation = messages => ({ model: config.generator, messages, max_completion_tokens: 4096, reasoning_effort: 'low', stream: false });
function judgeTemplate(row) {
    return execFileSync('python3', ['-c', `import ast,json,sys\ns=ast.parse(open(sys.argv[1]).read());f=next(n for n in s.body if isinstance(n,ast.FunctionDef) and n.name=='get_anscheck_prompt');ns={};exec(compile(ast.Module(body=[f],type_ignores=[]),'<pinned-judge>','exec'),ns);print(ns['get_anscheck_prompt'](**json.load(sys.stdin)))`, judgeFile], {
        input: JSON.stringify({ task: row.question_type, question: '__FROZEN_QUESTION__', answer: '__FROZEN_REFERENCE__', response: '__FROZEN_ANSWER__', abstention: row.question_id.endsWith('_abs') }), encoding: 'utf8',
    }).trimEnd();
}
async function evaluate(c, index) {
    const id = c.row.question_id, memories = [], lengths = [];
    for (const segment of c.segments) {
        const result = await call(`${id}/summary/${segment.id}`, 'summary', generation(summaryRequest(segment)));
        const bounded = boundSummary(result.text);
        memories.push({ id: segment.id, text: bounded.text });
        lengths.push({ id: segment.id, originalCharacters: bounded.originalCharacters, storedCharacters: bounded.storedCharacters, truncated: bounded.truncated });
    }
    const selection = memories.length > 5 ? await call(`${id}/selection`, 'selection', generation(selectionRequest(memories, c.recent.map(({role,content}) => ({role,content})), c.input.question))) : null;
    let selected = [], assembled, operationalFailure;
    try {
        selected = selectMemories(memories, selection?.text);
        assembled = replaceMemory(c.baseline, selected, count);
    } catch (error) { operationalFailure = error.message; }
    await journal.observe(`${id}/memory`, { memories, lengths, selected: selected.map(m => m.id), memoryTokens: assembled?.memoryTokens ?? 0,
        ...(operationalFailure ? { operationalFailure } : {}),
        segments: c.segments.map(({id,start,end}) => ({id,start,end})), finalFlush: c.segments.at(-1).messages.length < 40 });
    const template = judgeTemplate(c.row);
    const arms = ['chars400', 'words400', 'control'];
    for (const arm of arms) {
        const prior = arm === 'chars400' ? null : historical.rows.find(r => r.id === id && r.arm === (arm === 'words400' ? 'summary' : 'control'));
        const failure = arm === 'chars400' ? operationalFailure : prior.operationalFailure;
        if (failure) {
            await journal.observe(`${id}/${arm}/result`, { id, arm, type: c.row.question_type, answer: null,
                correct: false, operationalFailure: failure, usage: { prompt_tokens: 0, completion_tokens: 0 }, elapsedMs: 0,
                answerReused: arm !== 'chars400', probability: null });
            continue;
        }
        const answer = arm === 'chars400' ? await call(`${id}/${arm}/answer`, 'answer', assembled.body)
            : { text: prior.answer, usage: prior.usage, elapsedMs: prior.elapsedMs };
        const judged = await judge(`${id}/${arm}/judge`, jevJudgeRequest(template, c.row, answer.text));
        await journal.observe(`${id}/${arm}/result`, { id, arm, type: c.row.question_type, answer: answer.text,
            ...judged, usage: answer.usage, elapsedMs: answer.elapsedMs, answerReused: arm !== 'chars400' });
    }
    console.log(JSON.stringify({ completed: id, index, summary: journal.state.observations[`${id}/chars400/result`].value.correct,
        control: journal.state.observations[`${id}/control/result`].value.correct, calls: journal.state.used.calls }));
}
let next = 0;
try {
    const workers = Array.from({ length: config.concurrency }, async () => {
        try { while (next < cases.length) { expired(); const index = next++; await evaluate(cases[index], index); } }
        catch (error) { firstFailure ??= error; canceled = true; throw error; }
    });
    const results = await Promise.allSettled(workers);
    const failure = results.find(r => r.status === 'rejected'); if (failure) throw firstFailure;
    const rows = Object.entries(journal.state.observations).filter(([id]) => id.endsWith('/result')).map(([,r]) => r.value);
    assert.equal(rows.length, 150);
    await writeFile(path.join(out, 'results.json.tmp'), JSON.stringify({ config, rows, used: journal.state.used }, null, 2));
    await rename(path.join(out, 'results.json.tmp'), path.join(out, 'results.json'));
    console.log(JSON.stringify({ status: 'complete', rows: rows.length, used: journal.state.used }));
} finally { await journal.close(); tokenizer.free(); }
