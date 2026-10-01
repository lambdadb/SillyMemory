// Resumable, bounded provider transport for the frozen development workload.
// The caller owns authentication in `send`; no keys/headers enter this journal.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { openCheckpoint } from './benchmark-checkpoint.mjs';
import { sha } from './benchmark-audit.mjs';
import { NATURAL_RETRY, retryDelay } from './provider-retry.mjs';
const frozenPlan = JSON.parse(await readFile(new URL('../docs/benchmarks/development-plan-v1.json', import.meta.url), 'utf8'));
export const LEDGER_POLICY = Object.freeze({ version: 'development-provider-ledger-v1', durationMs: 6 * 60 * 60 * 1000,
    completionIntervalMs: 15000, attemptTimeoutMs: 90000, requestDeadlineMs: 180000, maxAttempts: 3 });

export async function openProviderLedger(directory, plan, { binding, send, countTokens,
    now = Date.now, wait = ms => delay(ms), random = Math.random } = {}) {
    assert.equal(typeof send, 'function'); assert.equal(typeof countTokens, 'function');
    plan = structuredClone(plan);
    assert.deepEqual({ ...plan, limits: null }, { ...frozenPlan, limits: null }, 'Frozen workload changed');
    assert.deepEqual(Object.keys(plan.limits).sort(), Object.keys(frozenPlan.limits).sort());
    for (const [key, value] of Object.entries(plan.limits)) {
        assert(Number.isFinite(value) && value >= 0 && value <= frozenPlan.limits[key], 'Limit exceeds frozen ceiling');
    }
    const journal = await openCheckpoint(directory, { ...structuredClone(binding), planSha256: sha(JSON.stringify(plan)), policy: LEDGER_POLICY }, plan.limits);
    const initial = journal.state;
    const startedAt = initial.observations.start?.value.at ?? now();
    try { await journal.observe('start', { at: startedAt }); }
    catch (error) { await journal.close(); throw error; }
    const tasks = new Map(plan.tasks.filter(t => !t.reusePilot).map(t => [t.id, t]));
    const inflight = new Map(), activeAttempts = new Set();
    let completionTail = Promise.resolve(), lastCompletionStart = now(), closed = false;
    const expired = () => assert(now() - startedAt < LEDGER_POLICY.durationMs, 'Development execution window expired');
    function uncertain() {
        assert(!Object.entries(journal.state.calls).some(([id, c]) => id.startsWith('provider/') && c.status === 'pending' && !activeAttempts.has(id)),
            'Uncertain provider delivery requires explicit recovery');
    }
    function request(taskId, kind, ordinal, body) {
        const task = tasks.get(taskId); assert(task, 'Task is not fresh development work');
        assert(Number.isInteger(ordinal) && ordinal >= 0);
        if (kind === 'embedding') {
            assert.deepEqual(Object.keys(body).sort(), ['input', 'model'], 'Unsupported embedding options');
            assert.equal(task.mode, 'vectors'); assert(ordinal < frozenPlan.limits.nativeEmbeddingCalls);
            assert.equal(body.model, plan.arms.vectors.embeddingModel);
            assert(Array.isArray(body.input) && body.input.length > 0 && body.input.length <= 10);
            const tokens = body.input.reduce((sum, text) => {
                assert(typeof text === 'string' && text.length <= 10000);
                const n = countTokens(text, 'embedding'); assert(Number.isInteger(n) && n >= 0 && n <= 8191);
                return sum + n + 8;
            }, 0);
            return { task, reservation: { nativeEmbeddingCalls: 1, nativeEmbeddingInputs: body.input.length,
                nativeEmbeddingTokens: tokens, openaiUsd: tokens * .02 / 1e6 } };
        }
        assert(['answer', 'summary', 'judge'].includes(kind));
        if (kind === 'summary') {
            assert.equal(task.mode, 'summary');
            assert(ordinal < plan.cases.find(c => c.id === task.caseId).automaticSummaryCallCap, 'Summary call cap');
        } else assert.equal(ordinal, 0);
        assert(Object.keys(body).every(key => ['model', 'messages', 'temperature', 'max_tokens', 'stream', 'presence_penalty', 'frequency_penalty', 'top_p'].includes(key)), 'Unsupported completion options');
        assert.equal(body.presence_penalty ?? 0, 0); assert.equal(body.frequency_penalty ?? 0, 0); assert.equal(body.top_p ?? 1, 1);
        const model = kind === 'judge' ? plan.judge : plan.generator;
        assert.equal(body.model, model.model); assert.equal(body.temperature, 0);
        assert.equal(body.max_tokens, model.maxOutputTokens); assert.equal(body.stream ?? false, false);
        const context = kind === 'judge' ? 4096 : task.context;
        assert(Array.isArray(body.messages) && body.messages.length > 0);
        const tokens = body.messages.reduce((sum, m) => {
            assert(Object.keys(m).every(key => ['role', 'content'].includes(key)), 'Unsupported message options');
            assert(['system', 'user', 'assistant'].includes(m.role));
            assert(typeof m.content === 'string'); const n = countTokens(m.content, 'completion');
            assert(Number.isInteger(n) && n >= 0); return sum + n + 6;
        }, 0);
        assert(tokens <= context, 'Input exceeds reservation');
        const usd = kind === 'judge' ? (4096 * 2.5 + 10 * 10) / 1e6 : (context * .4 + 1024 * 1.6) / 1e6;
        return { task, reservation: { completionAttempts: 1, openaiUsd: usd } };
    }
    function validate(receipt, kind, body, task, reservation) {
        assert.equal(receipt.status, 200, `Provider HTTP ${receipt.status}`);
        const result = JSON.parse(receipt.text);
        if (kind === 'embedding') {
            assert.equal(result.data?.length, body.input.length);
            assert.deepEqual(result.data.map(d => d.index).sort((a, b) => a - b), body.input.map((_, i) => i));
            assert(result.data.every(d => Array.isArray(d.embedding) && d.embedding.length === 1536 && d.embedding.every(Number.isFinite)), 'Invalid embedding vector');
            assert(Number.isInteger(result.usage?.total_tokens) && result.usage.total_tokens >= 0 && result.usage.total_tokens <= reservation.nativeEmbeddingTokens);
        } else {
            assert.equal(result.choices?.[0]?.finish_reason, 'stop', 'Incomplete model answer retained');
            assert(typeof result.choices[0].message?.content === 'string' && result.choices[0].message.content.length > 0);
            const u = result.usage, context = kind === 'judge' ? 4096 : task.context;
            assert(Number.isInteger(u?.prompt_tokens) && u.prompt_tokens >= 0 && u.prompt_tokens <= context);
            assert(Number.isInteger(u.completion_tokens) && u.completion_tokens > 0 && u.completion_tokens <= body.max_tokens);
            assert.equal(u.total_tokens, u.prompt_tokens + u.completion_tokens);
        }
        return result;
    }
    async function execute(kind, body, id, checked) {
        // Retain the complete request separately, before any external dispatch.
        await journal.call(`request/${id}`, { kind, body }, {}, async () => ({ kind, body }));
        const attempts = [], maxAttempts = kind === 'embedding' ? 1 : LEDGER_POLICY.maxAttempts;
        let firstStart;
        for (let n = 0; n < maxAttempts; n++) {
            const attemptId = `provider/${id}/${n}`, existing = journal.state.calls[attemptId];
            if (!existing) { expired(); uncertain(); }
            const perform = async () => {
                if (!existing && kind !== 'embedding') {
                    while (now() - lastCompletionStart < LEDGER_POLICY.completionIntervalMs) await wait(LEDGER_POLICY.completionIntervalMs - (now() - lastCompletionStart));
                }
                if (!existing) {
                    expired(); uncertain();
                    if (firstStart !== undefined) assert(now() - firstStart < LEDGER_POLICY.requestDeadlineMs, 'Logical request deadline exceeded');
                }
                activeAttempts.add(attemptId);
                try {
                    const delta = { ...checked.reservation, ...(n ? { extraAttempts: 1 } : {}) };
                    return await journal.call(attemptId, { kind, body }, delta, async () => {
                        expired();
                        const started = now();
                        if (kind !== 'embedding') lastCompletionStart = started;
                        let response, text;
                        try {
                            const remaining = firstStart === undefined ? LEDGER_POLICY.requestDeadlineMs : LEDGER_POLICY.requestDeadlineMs - (started - firstStart);
                            assert(remaining > 0, 'Logical request deadline exceeded');
                            response = await send({ kind, body: structuredClone(body), signal: AbortSignal.timeout(Math.max(1, Math.min(remaining, LEDGER_POLICY.attemptTimeoutMs))) });
                            text = await response.text();
                        } catch { throw new Error('Uncertain provider delivery; intent retained without automatic resend'); }
                        return { status: response.status, text, retryAfter: response.headers.get('retry-after'), startedAt: started, endedAt: now() };
                    });
                } finally { activeAttempts.delete(attemptId); }
            };
            let saved;
            if (kind === 'embedding') saved = await perform();
            else {
                const job = completionTail.then(perform); completionTail = job.then(() => {}, () => {}); saved = await job;
            }
            const receipt = saved.value; firstStart ??= receipt.startedAt;
            attempts.push({ id: attemptId, reused: saved.reused, status: receipt.status, startedAt: receipt.startedAt, endedAt: receipt.endedAt });
            if (receipt.status === 200) return { result: validate(receipt, kind, body, checked.task, checked.reservation), attempts, reused: attempts.every(a => a.reused) };
            if (kind === 'embedding' || !NATURAL_RETRY.statuses.includes(receipt.status) || n + 1 === maxAttempts) throw new Error(`Provider HTTP ${receipt.status}; response retained`);
            const delayId = `retry/${id}/${n}`;
            const retry = journal.state.observations[delayId]?.value || { waitMs: retryDelay(receipt.retryAfter, n + 1, random, () => receipt.endedAt) };
            await journal.observe(delayId, retry);
            assert(retry.waitMs <= NATURAL_RETRY.maxDelayMs, 'Retry delay exceeds bound');
            const remainingWait = Math.max(0, receipt.endedAt + retry.waitMs - now());
            if (!journal.state.calls[`provider/${id}/${n + 1}`]) {
                assert(now() + remainingWait - firstStart < LEDGER_POLICY.requestDeadlineMs, 'Logical request deadline exceeded');
                await wait(remainingWait);
            }
        }
    }
    return {
        get state() { return journal.state; },
        invoke(taskId, kind, ordinal, value) {
            assert(!closed, 'Provider ledger is closed');
            const body = structuredClone(value), checked = request(taskId, kind, ordinal, body);
            const id = `${taskId}/${kind}/${ordinal}`, hash = sha(JSON.stringify(body)), existing = inflight.get(id);
            if (existing) { assert.equal(existing.hash, hash, 'Concurrent logical request changed'); return existing.promise; }
            const promise = execute(kind, body, id, checked).finally(() => inflight.delete(id));
            inflight.set(id, { hash, promise }); return promise;
        },
        async close() {
            if (closed) return;
            assert.equal(inflight.size, 0, 'Cannot close active provider requests');
            closed = true; await journal.close();
        },
    };
}
