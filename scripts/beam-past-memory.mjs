// Benchmark-only storage/recall adapter. No evaluation annotations enter this process.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, lstat, mkdtemp, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { LambdaClient, schema, scopeFilter } from '../src/client.js';
import { chunkSpans } from '../src/chunking.js';

const sha = value => createHash('sha256').update(value).digest('hex');
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

async function main() {
    const [inputFile, outputDirectory, envFile, tokenizerPackage, flag] = process.argv.slice(2);
    assert(inputFile && outputDirectory && envFile && tokenizerPackage, 'Usage: node scripts/beam-past-memory.mjs input.json output-directory env-file tokenizer-package.json');
    const inputBytes = await readFile(inputFile), input = JSON.parse(inputBytes);
    assert.equal(input.conversations.length, 20);
    assert.equal(input.conversations.reduce((n, c) => n + c.questions.length, 0), 400);
    const require = createRequire(path.resolve(tokenizerPackage)), encoder = require('tiktoken').get_encoding('cl100k_base');
    assert.equal(JSON.parse(await readFile(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
    const countTokens = text => encoder.encode(text, [], []).length;
    assert(!flag || ['--preflight', '--repack'].includes(flag), 'Unexpected argument');
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
    if (flag === '--repack') {
        const memoryRoot = path.resolve(outputDirectory), parent = path.dirname(memoryRoot);
        const stateBytes = await readFile(path.join(memoryRoot, 'memory-state.json')), state = JSON.parse(stateBytes);
        assert.equal(state.status, 'completed'); assert.equal(state.completed.length, 20);
        assert(state.owned.every(item => item.absent404)); assert.equal(state.inputSha256, sha(inputBytes));
        const { readdir } = await import('node:fs/promises');
        const receipts = await Promise.all((await readdir(memoryRoot)).filter(name => /^http-\d+\.json$/.test(name)).sort()
            .map(async name => JSON.parse(await readFile(path.join(memoryRoot, name)))));
        const lock = { inputSha256: sha(inputBytes), memoryStateSha256: sha(stateBytes),
            packingSourceSha256: sha(await readFile(new URL(import.meta.url))), files: {} };
        await publishRepackedRecall(parent, async staging => {
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
                const name = `recall-${conversation.id}.json`, bytes = JSON.stringify(recalls);
                await writeFile(path.join(staging, name), bytes); lock.files[`recall/${name}`] = sha(bytes);
            }
            await writeFile(path.join(staging, 'lock.json'), JSON.stringify(lock, null, 2));
        });
        console.log('REPACKED: all 400 saved queries, matched evidence accounting; no provider calls');
        encoder.free(); return;
    }
    const env = { ...parseEnv(await readFile(envFile, 'utf8')), ...process.env };
    assert(env.LAMBDADB_BASE_URL && env.LAMBDADB_PROJECT_NAME && env.LAMBDADB_PROJECT_API_KEY);
    assert(env.LLM_API_KEY, 'Prepare the matching model credentials before creating memory');
    const root = path.resolve(outputDirectory);
    await mkdir(root, { recursive: true });
    // Never replay a partial run or adopt an existing collection automatically.
    const statePath = path.join(root, 'memory-state.json');
    const state = { inputSha256: sha(inputBytes), startedAt: new Date().toISOString(), status: 'running',
        owned: [], completed: [], operations: 0, retries: [], errors: [] };
    await writeFile(statePath, JSON.stringify(state, null, 2), { flag: 'wx' });
    const save = async () => { await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2)); await rename(statePath + '.tmp', statePath); };
    const deadline = Date.now() + 8 * 3600000;
    let receiptNumber = 0, stopped = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
    const client = new LambdaClient({ endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME }, env.LAMBDADB_PROJECT_API_KEY,
        { timeoutMs: 180000, fetcher: async (url, options) => {
            assert(state.operations++ < 10000, 'Memory operation bound exceeded');
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
            try { return await job(); }
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
