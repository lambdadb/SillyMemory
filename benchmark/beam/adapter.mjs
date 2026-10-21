// Benchmark-only storage/recall adapter. No evaluation annotations enter this process.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, lstat, mkdtemp, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { LambdaClient, schema, scopeFilter } from '../../src/client.js';
import { memoryOperationBudget } from '../shared/memory-budget.mjs';
import { chunkSpans } from '../../src/chunking.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const cohorts = { '100k': [20, 10000], '500k': [35, 20000], '1m': [35, 20000], '10m': [10, 50000] };
const connection = env => sha(JSON.stringify([env.LAMBDADB_BASE_URL, env.LAMBDADB_PROJECT_NAME]));
export const serializeContext = context => JSON.stringify(context);
// This formula reconstructs usedEvidenceTokens in all 400 published 100K
// records. Metadata is outside that evidence budget. It is an observed accounting
// rule, not a claim about Past's unpublished service implementation.
export const evidenceTokens = results => results.reduce((sum, result) => sum + Math.ceil((
    Array.from(result.content).length + (result.sources || []).reduce((n, source) => n
        + (source.excerpts || []).reduce((m, excerpt) => m + Array.from(excerpt).length, 0), 0)
) / 4), 0);

export function successfulQueryReceipts(receipts, collection) {
    return receipts.filter(item => item.status === 200
        && item.request.pathname.includes(`/collections/${collection}/`)
        && item.request.pathname.endsWith('/query'));
}

export async function receiptBody(response) {
    // Logging must not turn a retryable HTTP status into a JSON parse failure.
    try { return await response.clone().json(); }
    catch { return { nonJsonResponse: true }; }
}

export async function publishRepackedRecall(parent, build) {
    const target = path.join(parent, 'recall');
    const existing = await lstat(target).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
    });
    assert(!existing, 'Repacked recall already exists');
    const staging = await mkdtemp(path.join(parent, '.recall-'));
    try {
        await build(staging);
        // Publish validated files and their lock together. A failed build leaves
        // neither partial recall nor a lock that could authorize partial data.
        await rename(staging, target);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

export async function verifyRepackedRecall(directory, records, provenance) {
    const expected = { ...provenance, files: {} };
    for (const { name, bytes } of records) {
        assert(await readFile(path.join(directory, name), 'utf8') === bytes,
            'Published recall differs from saved query receipts');
        expected.files[`recall/${name}`] = sha(bytes);
    }
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'lock.json'), 'utf8')), expected);
    return expected;
}

function* repackedRecallRecords(input, state, receipts, countTokens) {
    for (const conversation of input.conversations) {
        const owned = state.owned.find(item => item.conversationId === conversation.id);
        const docs = sourceDocuments(conversation, owned.owner, owned.scope);
        const queries = successfulQueryReceipts(receipts, owned.collection);
        assert.equal(queries.length, conversation.questions.length);
        const recalls = conversation.questions.map((question, i) => {
            const receipt = queries[i], expected = recallQuery(owned.owner, owned.scope, question.text, question.asOfMicros);
            assert.equal(receipt.status, 200); assert.deepEqual(receipt.request.body.query, expected.query);
            assert.deepEqual(receipt.request.body.rerank, expected.options.rerank); assert.equal(receipt.request.body.size, 100);
            const hits = receipt.response.docs.map(hit => hit.doc);
            return { questionId: question.id, queryMs: receipt.elapsedMs, hitIds: hits.map(doc => doc.id),
                ...packContext(hits, docs, question.asOf, question.asOfMicros, countTokens) };
        });
        yield { name: `recall-${conversation.id}.json`, bytes: JSON.stringify(recalls) };
    }
}

export function recallQuery(owner, scope, text, asOfMicros) {
    assert(Number.isSafeInteger(asOfMicros) && asOfMicros > 0);
    assert(Buffer.byteLength(text) <= 8192, 'Question exceeds the product query limit');
    const filter = scopeFilter(owner, scope);
    filter.queryString.query += ` AND beamTimeMicros:[0 TO ${asOfMicros}]`;
    return { query: { bayesian: [
        { knn: { field: 'embedding', queryText: text, k: 200, filter } },
        { bool: [{ ...filter, occur: 'filter' }, { queryString: { query: text, defaultField: 'text', skipSyntax: true }, occur: 'must' }] },
    ] }, options: { size: 100, rerank: { provider: 'typesafe', model: 'jev-1.13.0', queryText: text,
        fields: ['role', 'conversationTimeContext', 'text'], candidateSize: 200, onFailure: 'error' } } };
}

export function sourceDocuments(conversation, owner, scope) {
    const docs = conversation.messages.flatMap(message => {
        assert.deepEqual(Object.keys(message).sort(), ['author', 'content', 'ordinal', 'sourceId', 'timeMicros', 'timestamp', 'turnId'].sort());
        assert(Number.isSafeInteger(message.timeMicros) && message.timeMicros > 0);
        const { role, name } = message.author;
        assert(['user', 'assistant'].includes(role));
        const revision = sha(JSON.stringify(message));
        return chunkSpans(message.content, 800).filter(span => span.text.trim()).map((span, chunk) => ({
            id: `${scope}_${revision}_${chunk}`, owner, scope, revision, ...span, chunk,
            message: message.ordinal, speaker: name, role, beamTimeMicros: message.timeMicros,
            sourceId: message.sourceId, sourceTurnId: message.turnId || '', sourceKind: 'conversation', batchDate: message.timestamp.slice(0, 10),
            conversationTimeContext: `Conversation batch reference date: ${message.timestamp.slice(0, 10)}. This is not a message send time or an event date.`,
        }));
    });
    // Past registers these same dataset traits before ingestion. They are source
    // input, with no invented conversation time or turn identity.
    const profile = JSON.stringify(conversation.userTraits);
    if (profile !== '{}') for (const [chunk, span] of chunkSpans(profile, 800).entries()) docs.push({
        id: `${scope}_profile_${chunk}`, owner, scope, revision: sha(profile), ...span, chunk,
        message: -1, speaker: conversation.userIdentity, role: 'user', beamTimeMicros: 0,
        sourceId: `${conversation.id}_profile`, sourceTurnId: '', sourceKind: 'profile', batchDate: '',
        conversationTimeContext: 'User profile supplied separately from the conversation; no message time.',
    });
    return docs;
}

export function packContext(hits, documents, asOf, asOfMicros, countTokens) {
    const expected = new Map(documents.map(doc => [doc.id, doc])), seen = new Set(), selected = [];
    const resultFor = docs => { const results = docs.map(doc => ({
        content: doc.text, sourceId: doc.sourceId, turnId: doc.sourceTurnId,
        role: doc.role, author: doc.speaker, ordinal: doc.message, passage: doc.chunk,
        start: doc.start, end: doc.end, batchReferenceDate: doc.batchDate, sourceKind: doc.sourceKind,
        timeMeaning: doc.conversationTimeContext,
    })); return { asOf, usedEvidenceTokens: evidenceTokens(results), results }; };
    for (const hit of hits) {
        const doc = expected.get(hit.id);
        assert(doc && Object.entries(doc).every(([key, value]) => hit[key] === value), 'Retrieved source mismatch');
        assert(doc.beamTimeMicros <= asOfMicros, 'Future source returned');
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const next = [...selected, doc];
        if (resultFor(next).usedEvidenceTokens <= 8000) selected.push(doc);
        if (selected.length === 100) break;
    }
    const context = resultFor(selected), tokens = context.usedEvidenceTokens;
    assert(tokens <= 8000);
    return { context, tokens, serializedTokens: countTokens(serializeContext(context)), selectedIds: selected.map(doc => doc.id) };
}

export function cohortSettings(input) {
    const split = input.split || '100k';
    assert(Object.hasOwn(cohorts, split), 'Unsupported frozen split');
    const [conversations, memoryOperations] = cohorts[split], questions = conversations * 20;
    assert.equal(input.conversations.length, conversations);
    assert.equal(new Set(input.conversations.map(c => c.id)).size, conversations);
    assert(input.conversations.every(c => c.questions.length === 20));
    assert.equal(new Set(input.conversations.flatMap(c => c.questions.map(q => q.id))).size, questions);
    return { conversations, questions, memoryOperations };
}

async function withMemoryLock(directory, work) {
    await mkdir(directory, { recursive: true });
    const lock = path.join(directory, '.running');
    await mkdir(lock);
    try { return await work(); }
    finally { await rm(lock, { recursive: true }); }
}

export async function cleanupMemory(directory, env, fetcher = globalThis.fetch) {
    for (const key of ['LAMBDADB_BASE_URL', 'LAMBDADB_PROJECT_NAME', 'LAMBDADB_PROJECT_API_KEY']) assert(env[key]?.trim(), `Missing ${key}`);
    return withMemoryLock(directory, async () => {
        const file = path.join(directory, 'memory-state.json');
        const state = JSON.parse(await readFile(file));
        assert.equal(state.connection, connection(env), 'Cleanup connection differs from the recorded run');
        assert(Object.hasOwn(cohorts, state.split), 'Missing or invalid recorded split');
        const [conversations, limit] = cohorts[state.split];
        assert(Number.isSafeInteger(state.operations) && state.operations >= 0 && state.operations <= limit);
        assert(Array.isArray(state.owned) && state.owned.length <= conversations);
        assert(Array.isArray(state.completed));
        for (const entry of state.owned) {
            assert(/^smbpast_[a-f0-9]{24}$/.test(entry.collection) && /^[a-f0-9]{64}$/.test(entry.owner));
            assert.equal(entry.scope, sha(entry.conversationId));
        }
        const save = async () => {
            await writeFile(file + '.tmp', JSON.stringify(state, null, 2));
            await rename(file + '.tmp', file);
        };
        const budget = memoryOperationBudget(state, limit), failures = [], deadline = Date.now() + 8 * 3600000;
        const client = new LambdaClient({ endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME }, env.LAMBDADB_PROJECT_API_KEY, {
            timeoutMs: 180000,
            fetcher: async (url, options) => {
                assert(Date.now() < deadline, 'Cleanup exceeded eight hours');
                budget.consume(); await save();
                const started = Date.now(), number = state.operations;
                const response = await fetcher(url, options);
                await writeFile(path.join(directory, `cleanup-http-${number}.json`), JSON.stringify({
                    request: { pathname: new URL(url).pathname, method: options.method },
                    status: response.status, elapsedMs: Date.now() - started,
                }), { flag: 'wx' });
                return response;
            },
        });
        try {
            for (const entry of state.owned.filter(item => !item.absent404)) {
                try {
                    await budget.run(() => client.deleteOwnedCollection(entry.collection, entry.owner, entry.scope), true);
                    entry.deleted = true; entry.absent404 = true; await save();
                } catch {
                    failures.push(entry.collection);
                }
            }
            const ownedIds = new Set(state.owned.map(entry => entry.conversationId));
            const complete = ownedIds.size === conversations && state.completed.length === conversations
                && new Set(state.completed).size === conversations && state.completed.every(id => ownedIds.has(id))
                && state.owned.every(entry => entry.absent404);
            state.status = failures.length ? 'blocked' : complete ? 'completed' : 'cleaned';
            await save();
        } finally { client.forget(); }
        assert.equal(failures.length, 0, `Cleanup incomplete for ${failures.length} owned collections; inspect memory-state.json and retry cleanup`);
    });
}

async function main() {
    const [inputFile, outputDirectory, envFile, tokenizerPackage, flag] = process.argv.slice(2);
    if (inputFile === '--cleanup') {
        assert(outputDirectory && envFile && !tokenizerPackage, 'Usage: node benchmark/beam/adapter.mjs --cleanup memory-directory env-file');
        await cleanupMemory(path.resolve(outputDirectory), { ...parseEnv(await readFile(envFile, 'utf8')), ...process.env });
        console.log('CLEANED: all recorded owned collections confirmed absent');
        return;
    }
    assert(inputFile && outputDirectory && envFile && tokenizerPackage, 'Usage: node benchmark/beam/adapter.mjs input.json output-directory env-file tokenizer-package.json');
    const inputBytes = await readFile(inputFile), input = JSON.parse(inputBytes);
    const cohort = cohortSettings(input);
    const require = createRequire(path.resolve(tokenizerPackage)), encoder = require('tiktoken').get_encoding('cl100k_base');
    assert.equal(JSON.parse(await readFile(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
    const countTokens = text => encoder.encode(text, [], []).length;
    assert(!flag || ['--preflight', '--repack', '--verify-recall'].includes(flag), 'Unexpected argument');
    const preflight = [];
    for (const conversation of input.conversations) {
        const owner = sha('preflight'), scope = sha(conversation.id), docs = sourceDocuments(conversation, owner, scope);
        assert.equal(new Set(docs.map(doc => doc.id)).size, docs.length);
        for (const question of conversation.questions) {
            assert.deepEqual(Object.keys(question).sort(), ['asOf', 'asOfMicros', 'id', 'text'].sort());
            recallQuery(owner, scope, question.text, question.asOfMicros);
        }
        preflight.push({ id: conversation.id, chunks: docs.length, embeddingTokens: docs.reduce((n, doc) => n + countTokens(doc.text), 0) });
    }
    if (flag === '--preflight') { console.log(JSON.stringify({ inputSha256: sha(inputBytes), conversations: preflight }, null, 2)); encoder.free(); return; }
    if (flag === '--repack' || flag === '--verify-recall') {
        const memoryRoot = path.resolve(outputDirectory), parent = path.dirname(memoryRoot);
        const stateBytes = await readFile(path.join(memoryRoot, 'memory-state.json')), state = JSON.parse(stateBytes);
        assert.equal(state.status, 'completed'); assert.deepEqual([...state.completed].sort(), input.conversations.map(c => c.id).sort());
        assert(state.owned.every(item => item.absent404)); assert.equal(state.inputSha256, sha(inputBytes));
        const { readdir } = await import('node:fs/promises');
        const receipts = await Promise.all((await readdir(memoryRoot)).filter(name => /^http-\d+\.json$/.test(name)).sort()
            .map(async name => JSON.parse(await readFile(path.join(memoryRoot, name)))));
        const provenance = { inputSha256: sha(inputBytes), memoryStateSha256: sha(stateBytes),
            packingSourceSha256: sha(await readFile(new URL(import.meta.url))) };
        const records = repackedRecallRecords(input, state, receipts, countTokens);
        if (flag === '--verify-recall') {
            const verified = await verifyRepackedRecall(path.join(parent, 'recall'), records, provenance);
            console.log(JSON.stringify(verified));
            encoder.free(); return;
        }
        const lock = { ...provenance, files: {} };
        await publishRepackedRecall(parent, async staging => {
            for (const { name, bytes } of records) {
                await writeFile(path.join(staging, name), bytes); lock.files[`recall/${name}`] = sha(bytes);
            }
            await writeFile(path.join(staging, 'lock.json'), JSON.stringify(lock, null, 2));
        });
        console.log(`REPACKED: all ${cohort.questions} saved queries, matched evidence accounting; no provider calls`);
        encoder.free(); return;
    }
    const env = { ...parseEnv(await readFile(envFile, 'utf8')), ...process.env };
    assert(env.LAMBDADB_BASE_URL && env.LAMBDADB_PROJECT_NAME && env.LAMBDADB_PROJECT_API_KEY);
    assert(env.LLM_API_KEY, 'Prepare the matching model credentials before creating memory');
    const root = path.resolve(outputDirectory);
    await mkdir(root, { recursive: true });
    await withMemoryLock(root, async () => {
        // Never replay a partial run or adopt an existing collection automatically.
        const statePath = path.join(root, 'memory-state.json');
        const state = { inputSha256: sha(inputBytes), split: input.split || '100k', connection: connection(env), startedAt: new Date().toISOString(), status: 'running',
            owned: [], completed: [], operations: 0, retries: [], errors: [] };
        await writeFile(statePath, JSON.stringify(state, null, 2), { flag: 'wx' });
        const save = async () => { await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2)); await rename(statePath + '.tmp', statePath); };
        const deadline = Date.now() + 8 * 3600000;
        let receiptNumber = 0, stopped = false;
        const budget = memoryOperationBudget(state, cohort.memoryOperations);
        for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
        const client = new LambdaClient({ endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME }, env.LAMBDADB_PROJECT_API_KEY,
            { timeoutMs: 180000, fetcher: async (url, options) => {
                budget.consume(); await save();
                const number = receiptNumber++, started = Date.now();
                const request = { number, pathname: new URL(url).pathname, method: options.method,
                    body: options.body ? JSON.parse(options.body) : null };
                const response = await fetch(url, options);
                await writeFile(path.join(root, `http-${String(number).padStart(5, '0')}.json`), JSON.stringify({
                    request, status: response.status, elapsedMs: Date.now() - started, response: await receiptBody(response),
                }));
                return response;
            } });
        const operation = async (job, cleanup = false) => {
            for (let attempt = 0; ; attempt++) {
                if (!cleanup) assert(!stopped && Date.now() < deadline, 'Memory run stopped or exceeded eight hours');
                try { return await budget.run(job, cleanup); }
                catch (error) {
                    if (attempt >= 2 || ![429, 500, 502, 503, 504].includes(error.status)) throw error;
                    state.retries.push({ status: error.status, attempt }); await save();
                    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
                }
            }
        };
        try {
            for (const conversation of input.conversations) {
                const owner = sha(state.startedAt + randomBytes(16).toString('hex')), scope = sha(conversation.id);
                const collection = `smbpast_${randomBytes(12).toString('hex')}`, docs = sourceDocuments(conversation, owner, scope);
                const entry = { conversationId: conversation.id, collection, owner, scope, deleted: false };
                state.owned.push(entry); await save();
                console.log(`INGEST ${conversation.id}: ${docs.length} chunks`);
                try {
                    await operation(() => client.call((sdk, opts) => sdk.createCollection({ collectionName: collection,
                        indexConfigs: { ...schema, beamTimeMicros: { type: 'long' } },
                        description: 'SillyMemory BEAM public-protocol comparison',
                        tags: { application: 'sillymemory', owner, chat: scope }, snapshotRetentionInDays: 1 }, opts)));
                    await operation(() => client.assertOwned(collection, owner, undefined, scope));
                    for (let start = 0; start < docs.length; start += 50) await operation(() => client.upsert(collection, docs.slice(start, start + 50)));
                    for (let start = 0; start < docs.length; start += 100) {
                        const expected = docs.slice(start, start + 100);
                        const actual = new Map((await operation(() => client.fetchDocs(collection, expected.map(doc => doc.id)))).map(doc => [doc.id, doc]));
                        for (const doc of expected) assert(Object.entries(doc).every(([key, value]) => actual.get(doc.id)?.[key] === value), 'Stored source mismatch');
                    }
                    const recalls = [];
                    for (const question of conversation.questions) {
                        assert.deepEqual(Object.keys(question).sort(), ['asOf', 'asOfMicros', 'id', 'text'].sort());
                        const { query, options } = recallQuery(owner, scope, question.text, question.asOfMicros), started = Date.now();
                        const hits = await operation(() => client.query(collection, query, options));
                        const queryMs = Date.now() - started;
                        recalls.push({ questionId: question.id, queryMs, hitIds: hits.map(doc => doc.id),
                            ...packContext(hits, docs, question.asOf, question.asOfMicros, countTokens) });
                    }
                    await writeFile(path.join(root, `recall-${conversation.id}.json`), JSON.stringify(recalls));
                    state.completed.push(conversation.id); await save();
                    console.log(`RECALL ${conversation.id}: ${recalls.length} questions`);
                } finally {
                    await operation(() => client.deleteOwnedCollection(collection, owner, scope), true);
                    entry.deleted = true; entry.absent404 = true; await save();
                }
            }
            state.status = 'completed';
        } catch (error) {
            state.status = 'blocked'; state.errors.push({ message: error.message, status: error.status, code: error.code });
            throw error;
        } finally { await save(); client.forget(); encoder.free(); }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
