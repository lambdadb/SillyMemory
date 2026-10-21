import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { cleanupMemory } from '../benchmark/beam/adapter.mjs';
import { collectionResponse } from './helpers/lambdadb-responses.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const env = { LAMBDADB_BASE_URL: 'https://example.test', LAMBDADB_PROJECT_NAME: 'synthetic', LAMBDADB_PROJECT_API_KEY: 'synthetic-key' };
async function fixture(t, count = 1, operations = 0) {
    const directory = await mkdtemp(path.join(tmpdir(), 'beam-cleanup-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'memory-state.json');
    const state = { split: '100k', connection: sha(JSON.stringify([env.LAMBDADB_BASE_URL, env.LAMBDADB_PROJECT_NAME])),
        status: 'blocked', operations, completed: [], errors: [{ message: 'Original failure' }],
        owned: Array.from({ length: count }, (_, i) => ({ collection: `smbpast_${String(i).padStart(24, '0')}`,
            conversationId: String(i), owner: sha(`owner-${i}`), scope: sha(String(i)), deleted: false })) };
    await writeFile(file, JSON.stringify(state));
    const load = async () => JSON.parse(await readFile(file));
    return { directory, file, state, load };
}
const present = entry => Response.json({ collection: collectionResponse({ collectionName: entry.collection,
    tags: { application: 'sillymemory', owner: entry.owner, chat: entry.scope } }) });
const absent = () => new Response('{}', { status: 404 });

test('BEAM cleanup retains failed ownership records, continues other deletions and resumes without recall', async t => {
    const { directory, state, load } = await fixture(t, 2);
    const remaining = new Map(state.owned.map(entry => [entry.collection, entry]));
    let fail = true, calls = 0;
    const fetcher = async (url, options) => {
        calls++;
        const entry = remaining.get(new URL(url).pathname.split('/').at(-1));
        if (!entry) return absent();
        if (options.method === 'GET') return present(entry);
        assert.equal(options.method, 'DELETE');
        if (fail && entry.conversationId === '0') return new Response('{}', { status: 503 });
        remaining.delete(entry.collection);
        return Response.json({ message: 'Deleted' });
    };
    await assert.rejects(cleanupMemory(directory, env, fetcher), /Cleanup incomplete/);
    let saved = await load();
    assert.equal(saved.status, 'blocked');
    assert.equal(saved.owned[0].deleted, false);
    assert.equal(saved.owned[1].absent404, true);
    assert.equal(saved.operations, 5);
    fail = false;
    await cleanupMemory(directory, env, fetcher);
    saved = await load();
    assert.equal(saved.status, 'cleaned');
    assert(saved.owned.every(entry => entry.deleted && entry.absent404));
    assert.equal(saved.operations, 8);
    assert.deepEqual(saved.errors, state.errors);
    assert.deepEqual(saved.completed, []);
    await cleanupMemory(directory, env, () => assert.fail('Already absent collections must not be queried'));
    assert.equal(calls, 8);
    assert.equal(remaining.size, 0);
});

test('BEAM cleanup rejects a different connection and refuses remote ownership mismatches', async t => {
    const { directory, state, load } = await fixture(t);
    await assert.rejects(cleanupMemory(directory, { ...env, LAMBDADB_PROJECT_NAME: 'other' },
        () => assert.fail('Wrong connection must fail before HTTP')), /connection differs/);
    const methods = [];
    await assert.rejects(cleanupMemory(directory, env, async (_url, options) => {
        methods.push(options.method);
        return present({ ...state.owned[0], owner: sha('other-owner') });
    }), /Cleanup incomplete/);
    assert.deepEqual(methods, ['GET']);
    assert.equal((await load()).owned[0].deleted, false);
});

test('BEAM cleanup persists attempts before transport failure and never resets the request cap', async t => {
    const { directory, load } = await fixture(t, 1, 9999);
    await assert.rejects(cleanupMemory(directory, env, async () => {
        assert.equal((await load()).operations, 10000);
        throw new Error('Synthetic network failure');
    }), /Cleanup incomplete/);
    await assert.rejects(cleanupMemory(directory, env, () => assert.fail('Budget must remain exhausted')), /Cleanup incomplete/);
    const saved = await load();
    assert.equal(saved.operations, 10000);
    assert.equal(saved.owned[0].deleted, false);
});

test('BEAM cleanup does not enter an active run or remove its lock', async t => {
    const { directory } = await fixture(t);
    const lock = path.join(directory, '.running');
    await mkdir(lock);
    await assert.rejects(cleanupMemory(directory, env, () => assert.fail('Active run must not be accessed')), { code: 'EEXIST' });
    await assert.rejects(mkdir(lock), { code: 'EEXIST' });
});
