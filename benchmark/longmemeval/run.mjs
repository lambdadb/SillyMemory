import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchVerifiedFile } from '../../scripts/fetch-benchmark-data.mjs';
import { requestFor, judgeRequest, verdict, sha256 } from './protocol.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    root: { type: 'string' }, 'env-file': { type: 'string' },
} });
const [phase] = positionals;
assert(positionals.length === 1 && ['prepare', 'answer', 'judge', 'verify'].includes(phase) && values.root,
    'Usage: node benchmark/longmemeval/run.mjs <prepare|answer|judge|verify> --root <directory> [--env-file <file>]');
const directory = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(values.root);
const configBytes = await readFile(path.join(directory, 'config.json')), config = JSON.parse(configBytes);
const selectionBytes = await readFile(path.join(directory, 'selection.jsonl'));
assert.equal(sha256(selectionBytes), config.selectionSha256);
const selections = selectionBytes.toString().trim().split('\n').map(JSON.parse);
assert.equal(selections.length, config.questions); assert.equal(new Set(selections.map(x => x.id)).size, config.questions);
const ruleBytes = await readFile(path.join(directory, 'judge-rules.json'));
assert.equal(sha256(ruleBytes), config.rulesSha256); const rules = JSON.parse(ruleBytes);
const readJSON = async file => JSON.parse(await readFile(file));
const binding = sha256(configBytes);
await mkdir(root, { recursive: true });
await mkdir(path.join(root, '.running')); // Exclusive run; a crashed run requires inspection before removal.
try {
    if (phase === 'prepare') await fetchVerifiedFile(config.dataset, root);
    const dataset = await readFile(path.join(root, config.dataset.localName));
    assert.equal(sha256(dataset), config.dataset.sha256);
    const rows = new Map(JSON.parse(dataset).map(row => [row.question_id, row]));
    assert.equal(rows.size, config.questions);
    // Validate every frozen request before any paid call, including on resume.
    const requests = new Map(selections.map(s => [s.id, requestFor(rows.get(s.id), s, config)]));
    for (const s of selections) assert(rules[s.rule], `Missing judge rule: ${s.id}`);
    if (phase === 'prepare') {
        await writeFile(path.join(root, 'lock.json'), JSON.stringify({ configSha256: binding,
            datasetSha256: config.dataset.sha256, requests: Object.fromEntries(selections.map(s => [s.id, s.requestSha256])) }, null, 2), { flag: 'wx' });
        console.log(`Prepared ${selections.length} exact answer requests.`);
    } else {
        const lock = await readJSON(path.join(root, 'lock.json'));
        assert.equal(lock.configSha256, binding); assert.equal(lock.datasetSha256, config.dataset.sha256);
        assert.deepEqual(lock.requests, Object.fromEntries(selections.map(s => [s.id, s.requestSha256])));
        let env, secrets = [], attempts = 0;
        const deadline = Date.now() + config.limits.wallHours * 3600000;
        if (phase !== 'verify') {
            assert(values['env-file'], 'Pass --env-file explicitly for paid phases');
            env = parseEnv(await readFile(values['env-file'], 'utf8'));
            assert(env[phase === 'answer' ? 'LLM_API_KEY' : 'TYPESAFE_API_KEY']?.trim(), 'Missing provider key');
            if (phase === 'answer') assert.equal(env.LLM_BASE_URL, 'https://api.openai.com/v1');
            secrets = Object.entries(env).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value.length >= 8).map(([, value]) => value);
        }
        const clean = text => secrets.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), text);
        async function receipt(kind, id, body, send = false) {
            const folder = path.join(root, kind); await mkdir(folder, { recursive: true });
            const file = path.join(folder, `${id}.json`), requestSha256 = sha256(JSON.stringify(body));
            try {
                const saved = await readJSON(file);
                assert.equal(saved.requestSha256, requestSha256); assert.equal(saved.configSha256, binding);
                assert.equal(saved.status, 200); return saved.response;
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
            assert(send, `Missing ${kind} receipt: ${id}`);
            assert(Date.now() < deadline && attempts < config.limits[`${kind}Calls`], 'Run limit reached');
            const pending = file + '.pending';
            await writeFile(pending, JSON.stringify({ requestSha256, configSha256: binding, startedAt: new Date().toISOString() }), { flag: 'wx' });
            attempts++;
            const start = performance.now();
            const response = await fetch(kind === 'answer' ? env.LLM_BASE_URL + '/chat/completions' : config.judge.endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (kind === 'answer' ? env.LLM_API_KEY : env.TYPESAFE_API_KEY) },
                body: JSON.stringify(body), signal: AbortSignal.timeout(kind === 'answer' ? 240000 : 120000),
            });
            const result = await response.json();
            const saved = { requestSha256, configSha256: binding, status: response.status, milliseconds: performance.now() - start, response: result };
            await writeFile(file + '.tmp', clean(JSON.stringify(saved)));
            await rename(file + '.tmp', file);
            assert.equal(response.status, 200, `Provider HTTP ${response.status}; receipt retained`);
            return result;
        }
        const scores = [];
        for (const selection of selections) {
            const row = rows.get(selection.id), request = requests.get(selection.id);
            const answer = await receipt('answer', selection.id, request, phase === 'answer');
            assert.equal(answer.model, config.generator.model);
            assert.equal(answer.choices?.[0]?.finish_reason, 'stop');
            const text = answer.choices?.[0]?.message?.content;
            assert(typeof text === 'string' && text.trim());
            assert(Number.isSafeInteger(answer.usage?.prompt_tokens) && Number.isSafeInteger(answer.usage?.completion_tokens));
            if (phase !== 'answer') {
                const judgment = await receipt('judge', selection.id, judgeRequest(row, text, rules[selection.rule], config), phase === 'judge');
                scores.push({ id: selection.id, type: row.question_type, ...verdict(judgment, config) });
            }
        }
        if (phase !== 'answer') {
            assert.equal(scores.length, config.questions);
            const correct = scores.filter(x => x.correct).length;
            const summary = { questions: scores.length, correct, accuracy: correct / scores.length,
                generator: config.generator, judge: config.judge, configSha256: binding };
            const serialized = JSON.stringify(summary, null, 2) + '\n';
            if (phase === 'verify') assert.deepEqual(await readJSON(path.join(root, 'summary.json')), summary);
            else {
                await writeFile(path.join(root, 'scores.json'), JSON.stringify(scores, null, 2));
                await writeFile(path.join(root, 'summary.json'), serialized);
            }
            console.log(serialized);
        } else console.log(`Answered ${selections.length} questions; run judge next.`);
    }
} finally { await rm(path.join(root, '.running'), { recursive: true }); }
