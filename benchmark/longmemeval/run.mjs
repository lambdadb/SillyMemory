import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fetchVerifiedFile } from '../../scripts/fetch-benchmark-data.mjs';
import { prepareCase, judgeRequest, verdict, sha256, recordResponse } from './protocol.mjs';
import { memoryPhase, verifyRecall } from './storage.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    root: { type: 'string' }, 'env-file': { type: 'string' }, limit: { type: 'string' },
} });
const [phase] = positionals;
assert(positionals.length === 1 && ['setup', 'prepare', 'recall', 'score', 'verify', 'cleanup'].includes(phase) && values.root,
    'Usage: node benchmark/longmemeval/run.mjs <setup|prepare|recall|score|verify|cleanup> --root <directory> [--env-file <file>] [prepare: --limit <1..500>]');
assert(!values.limit || phase === 'prepare', '--limit is only accepted during prepare');
const directory = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(directory, '../..'), root = path.resolve(values.root);
const configBytes = await readFile(path.join(directory, 'config.json')), config = JSON.parse(configBytes);
const readJSON = async file => JSON.parse(await readFile(file));
const rulesBytes = await readFile(path.join(directory, 'judge-rules.json'));
assert.equal(sha256(rulesBytes), config.rulesSha256); const rules = JSON.parse(rulesBytes);
const tokenRoot = path.join(root, 'tokenizer');
const sourceFiles = ['benchmark/longmemeval/run.mjs', 'benchmark/longmemeval/protocol.mjs', 'benchmark/longmemeval/storage.mjs',
    'benchmark/longmemeval/judge-rules.json', 'benchmark/tokenizer/package.json', 'benchmark/tokenizer/package-lock.json',
    'scripts/benchmark-audit.mjs', 'scripts/benchmark-development-input.mjs', 'scripts/benchmark-host-input.mjs',
    'scripts/fetch-benchmark-data.mjs', 'scripts/beam-past-memory.mjs',
    'src/client.js', 'src/memory.js', 'src/context.js', 'src/time.js', 'src/chunking.js', 'src/commit.js', 'vendor/lambdadb.js'];
await mkdir(root, { recursive: true });
await mkdir(path.join(root, '.running'));
let encoder;
try {
    if (phase === 'setup') {
        await fetchVerifiedFile(config.dataset, root);
        await mkdir(tokenRoot, { recursive: true });
        for (const name of ['package.json', 'package-lock.json']) {
            const source = path.join(directory, '../tokenizer', name), target = path.join(tokenRoot, name);
            try { assert.deepEqual(await readFile(target), await readFile(source), 'Tokenizer lock differs'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; await copyFile(source, target); }
        }
        execFileSync('npm', ['ci', '--prefix', tokenRoot, '--no-audit', '--no-fund'], { stdio: 'inherit' });
        console.log('Dataset and tokenizer ready; run prepare next.');
    } else {
        let lock = phase === 'prepare' ? null : await readJSON(path.join(root, 'lock.json'));
        const binding = lock ? sha256(JSON.stringify(lock)) : null;
        const env = ['recall', 'score', 'cleanup'].includes(phase) ? (() => {
            assert(values['env-file'], 'Pass --env-file explicitly for paid phases or cleanup'); return values['env-file'];
        })() : null;
        const credentials = env ? parseEnv(await readFile(env, 'utf8')) : null;
        // Cleanup needs only the owned-resource journal, even if data or code has changed.
        if (phase === 'cleanup') {
            await memoryPhase({ phase, root, lock, binding, config, env: credentials });
        } else {
            const files = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha256(await readFile(path.join(repo, file)))])));
            for (const name of ['package.json', 'package-lock.json']) assert.deepEqual(await readFile(path.join(tokenRoot, name)), await readFile(path.join(directory, '../tokenizer', name)));
            const require = createRequire(path.join(tokenRoot, 'package.json'));
            assert.equal((await readJSON(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
            for (const name of ['tiktoken.cjs', 'tiktoken_bg.cjs', 'tiktoken_bg.wasm']) {
                files[`tokenizer/${name}`] = sha256(await readFile(path.join(tokenRoot, 'node_modules/tiktoken', name)));
            }
            encoder = require('tiktoken').get_encoding('cl100k_base');
            const countTokens = text => encoder.encode(text, [], []).length;
            const dataset = await readFile(path.join(root, config.dataset.localName));
            assert.equal(sha256(dataset), config.dataset.sha256);
            const rows = new Map(JSON.parse(dataset).map(row => [row.question_id, row]));
            assert.equal(rows.size, config.questions);
            const ruleFor = row => rules[row.question_type + (row.question_id.endsWith('_abs') ? ':abstention' : '')];
            for (const row of rows.values()) assert(ruleFor(row), `Missing judge rule: ${row.question_id}`);
            if (phase === 'prepare') {
                const limit = Number(values.limit || config.questions);
                assert(Number.isSafeInteger(limit) && limit >= 1 && limit <= config.questions);
                const owner = sha256(randomBytes(32));
                lock = { configSha256: sha256(configBytes), datasetSha256: config.dataset.sha256, files, owner,
                    ids: [...rows.keys()].sort().slice(0, limit), inputs: {} };
                for (const id of lock.ids) lock.inputs[id] = sha256(JSON.stringify(await prepareCase(rows.get(id), config, owner)));
                await writeFile(path.join(root, 'lock.json'), JSON.stringify(lock, null, 2), { flag: 'wx' });
                console.log(`Prepared ${lock.ids.length}/${config.questions} questions; no saved retrieval selection is used.`);
            } else {
                assert.equal(lock.configSha256, sha256(configBytes)); assert.equal(lock.datasetSha256, config.dataset.sha256);
                assert.deepEqual(lock.files, files, 'Runner or tokenizer changed; use a new run directory');
                assert(lock.ids.length > 0 && lock.ids.length <= config.questions);
                assert.deepEqual(lock.ids, [...rows.keys()].sort().slice(0, lock.ids.length));
                const prepare = async id => {
                    const prepared = await prepareCase(rows.get(id), config, lock.owner);
                    assert.equal(sha256(JSON.stringify(prepared)), lock.inputs[id]); return prepared;
                };
                if (phase === 'recall') await memoryPhase({ phase, root, lock, binding, config, env: credentials, prepare, countTokens });
                else {
                    const state = await readJSON(path.join(root, 'memory/state.json'));
                    assert.equal(state.binding, binding); assert.equal(state.status, 'completed');
                    assert.deepEqual(state.completed, lock.ids);
                    assert.equal(state.owned.length, lock.ids.length);
                    assert(state.owned.every(e => e.deleted && e.absent404 && e.owner === lock.owner));
                    const requests = new Map();
                    // Verify all source-bound recall and request bodies before any generation.
                    for (const id of lock.ids) requests.set(id, verifyRecall(await readJSON(path.join(root, 'recall', `${id}.json`)), await prepare(id), config, countTokens, binding));
                    const secrets = credentials ? Object.entries(credentials).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value.length >= 8).map(([, value]) => value) : [];
                    const clean = text => secrets.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), text);
                    if (phase === 'score') {
                        assert(credentials.LLM_API_KEY?.trim() && credentials.TYPESAFE_API_KEY?.trim(), 'Missing generation or judge key');
                        assert.equal(credentials.LLM_BASE_URL, 'https://api.openai.com/v1');
                    }
                    const deadline = Date.now() + config.limits.wallHours * 3600000, attempts = { answer: 0, judge: 0 };
                    async function receipt(kind, id, body) {
                        const folder = path.join(root, kind); await mkdir(folder, { recursive: true });
                        const file = path.join(folder, `${id}.json`), requestSha256 = sha256(JSON.stringify(body));
                        try {
                            const saved = await readJSON(file);
                            assert.equal(saved.requestSha256, requestSha256); assert.equal(saved.binding, binding);
                            assert.equal(saved.status, 200); return saved.response;
                        } catch (error) { if (error.code !== 'ENOENT') throw error; }
                        assert.equal(phase, 'score', `Missing ${kind} receipt: ${id}`);
                        assert(Date.now() < deadline && attempts[kind] < config.limits[`${kind}Calls`], 'Run limit reached');
                        await writeFile(file + '.pending', JSON.stringify({ requestSha256, binding, startedAt: new Date().toISOString() }), { flag: 'wx' });
                        attempts[kind]++;
                        const started = performance.now();
                        const response = await fetch(kind === 'answer' ? credentials.LLM_BASE_URL + '/chat/completions' : config.judge.endpoint, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (kind === 'answer' ? credentials.LLM_API_KEY : credentials.TYPESAFE_API_KEY) },
                            body: JSON.stringify(body), signal: AbortSignal.timeout(kind === 'answer' ? 240000 : 120000),
                        });
                        return recordResponse(file, response, { requestSha256, binding, milliseconds: performance.now() - started }, clean);
                    }
                    const scores = [];
                    for (const id of lock.ids) {
                        const row = rows.get(id), answer = await receipt('answer', id, requests.get(id));
                        assert.equal(answer.model, config.generator.model); assert.equal(answer.choices?.[0]?.finish_reason, 'stop');
                        const text = answer.choices?.[0]?.message?.content;
                        assert(typeof text === 'string' && text.trim());
                        assert(Number.isSafeInteger(answer.usage?.prompt_tokens) && Number.isSafeInteger(answer.usage?.completion_tokens));
                        const judgment = await receipt('judge', id, judgeRequest(row, text, ruleFor(row), config));
                        scores.push({ id, type: row.question_type, ...verdict(judgment, config) });
                    }
                    const correct = scores.filter(x => x.correct).length;
                    const summary = { questions: scores.length, fullCohort: scores.length === config.questions, correct,
                        accuracy: correct / scores.length, generator: config.generator, judge: config.judge, binding };
                    if (phase === 'verify') {
                        assert.deepEqual(await readJSON(path.join(root, 'scores.json')), scores);
                        assert.deepEqual(await readJSON(path.join(root, 'summary.json')), summary);
                    } else {
                        await writeFile(path.join(root, 'scores.json'), JSON.stringify(scores, null, 2));
                        await writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
                    }
                    console.log(JSON.stringify(summary, null, 2));
                }
            }
        }
    }
} finally { encoder?.free(); await rm(path.join(root, '.running'), { recursive: true }); }
