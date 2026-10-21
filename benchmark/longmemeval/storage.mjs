import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { LambdaClient, schema } from '../../src/client.js';
import { memoryOperationBudget } from '../shared/memory-budget.mjs';
import { recallQuery, returnedDocs, requestFor, sha256 } from './protocol.mjs';

const readJSON = async file => JSON.parse(await readFile(file));
async function atomic(file, value, clean = text => text) {
    await writeFile(file + '.tmp', clean(JSON.stringify(value)));
    await rename(file + '.tmp', file);
}

export async function retrieveCase(client, collection, prepared, config) {
    await client.assertOwned(collection, prepared.owner, undefined, prepared.scope);
    const docs = prepared.docs;
    for (let i = 0; i < docs.length; i += config.retrieval.batchSize) {
        await client.upsert(collection, docs.slice(i, i + config.retrieval.batchSize));
    }
    for (let i = 0; i < docs.length; i += 100) {
        const expected = docs.slice(i, i + 100);
        const stored = new Map((await client.fetchDocs(collection, expected.map(d => d.id))).map(d => [d.id, d]));
        assert.equal(stored.size, expected.length, 'Stored source count differs');
        for (const doc of expected) for (const [key, value] of Object.entries(doc)) assert.deepEqual(stored.get(doc.id)?.[key], value);
    }
    const query = recallQuery(prepared, config);
    const response = await client.call((sdk, options) => sdk.collection(collection).query(query, options));
    returnedDocs(response, prepared, config);
    return { query, response };
}

export function verifyRecall(record, prepared, config, countTokens, binding) {
    assert.equal(record.binding, binding); assert.equal(record.id, prepared.id);
    assert.equal(record.sourceSha256, sha256(JSON.stringify(prepared)));
    assert.deepEqual(record.query, recallQuery(prepared, config));
    const packed = requestFor(prepared, returnedDocs(record.response, prepared, config), config, countTokens);
    assert.deepEqual(record.packed, packed);
    return packed.body;
}

export async function memoryPhase({ phase, root, lock, binding, config, env, prepare, countTokens }) {
    assert.equal(schema.embedding.embedding.model, config.retrieval.embedding);
    assert.equal(schema.embedding.embedding.sourceField, 'text');
    for (const key of ['LAMBDADB_BASE_URL', 'LAMBDADB_PROJECT_NAME', 'LAMBDADB_PROJECT_API_KEY']) assert(env[key]?.trim(), `Missing ${key}`);
    const connection = sha256(JSON.stringify([env.LAMBDADB_BASE_URL, env.LAMBDADB_PROJECT_NAME]));
    const secrets = Object.entries(env).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value.length >= 8).map(([, value]) => value);
    const clean = text => secrets.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), text);
    const directory = path.join(root, 'memory'); await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'state.json');
    let state;
    if (phase === 'recall') {
        state = { binding, connection, status: 'running', operations: 0, owned: [], completed: [] };
        await writeFile(file, JSON.stringify(state), { flag: 'wx' });
        await mkdir(path.join(root, 'recall'));
    } else {
        state = await readJSON(file); assert.equal(state.binding, binding); assert.equal(state.connection, connection);
    }
    const save = () => atomic(file, state, clean);
    const deadline = Date.now() + config.limits.wallHours * 3600000;
    const budget = memoryOperationBudget(state, config.limits.memoryOperations);
    let stopped = false, cleaning = false;
    const stop = () => { stopped = true; };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    const client = new LambdaClient({ endpoint: env.LAMBDADB_BASE_URL, project: env.LAMBDADB_PROJECT_NAME }, env.LAMBDADB_PROJECT_API_KEY, {
        timeoutMs: 180000,
        fetcher: async (url, options) => {
            assert(cleaning || (!stopped && Date.now() < deadline), 'Memory run stopped or exceeded time limit');
            budget.consume(); await save();
            const number = state.operations, started = performance.now();
            const receipt = { pathname: new URL(url).pathname, method: options.method,
                request: options.body ? JSON.parse(options.body) : null };
            try {
                const response = await fetch(url, options);
                const rawResponse = await response.clone().text();
                await atomic(path.join(directory, `http-${number}.json`), {
                    ...receipt, status: response.status, milliseconds: performance.now() - started, rawResponse,
                }, clean);
                return response;
            } catch (error) {
                await atomic(path.join(directory, `http-${number}-error.json`), { ...receipt, error: 'Transport or receipt persistence failed' }, clean);
                throw error;
            }
        },
    });
    const cleanup = async entry => {
        assert.equal(entry.owner, lock.owner);
        assert(/^smlme_[a-f0-9]{24}$/.test(entry.collection) && /^[a-f0-9]{64}$/.test(entry.scope));
        cleaning = true;
        try {
            await budget.run(() => client.deleteOwnedCollection(entry.collection, entry.owner, entry.scope), true);
            entry.deleted = true; entry.absent404 = true; await save();
        } finally { cleaning = false; }
    };
    try {
        if (phase === 'cleanup') {
            for (const entry of state.owned.filter(e => !e.deleted)) await cleanup(entry);
            state.status = state.status === 'completed' ? 'completed' : 'cleaned';
        } else {
            for (const id of lock.ids) {
                const prepared = await prepare(id), collection = `smlme_${randomBytes(12).toString('hex')}`;
                const entry = { id, collection, owner: prepared.owner, scope: prepared.scope, deleted: false };
                state.owned.push(entry); await save();
                try {
                    console.log(`RECALL ${id}: ${prepared.docs.length} chunks`);
                    await client.create(collection, entry.owner, entry.scope);
                    const started = performance.now(), result = await retrieveCase(client, collection, prepared, config);
                    const packed = requestFor(prepared, returnedDocs(result.response, prepared, config), config, countTokens);
                    const record = { id, binding, sourceSha256: sha256(JSON.stringify(prepared)), ...result,
                        packed, milliseconds: performance.now() - started };
                    await atomic(path.join(root, 'recall', `${id}.json`), record, clean);
                    state.completed.push(id);
                } finally { await cleanup(entry); }
            }
            state.status = 'completed';
        }
    } catch (error) {
        state.status = 'blocked'; state.error = clean(error.message); throw error;
    } finally {
        await save(); client.forget(); process.off('SIGINT', stop); process.off('SIGTERM', stop);
    }
    console.log(`Memory ${state.status}; ${state.completed.length} questions; ${state.operations} operations; all owned collections absent.`);
}
