// Product-specific preparation, retrieval and prompt assembly for the Python runner.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { prepareCase, sha256 } from './protocol.mjs';
import { memoryPhase, verifyRecall } from './storage.mjs';

process.stdin.setEncoding('utf8');
let inputText = '';
for await (const chunk of process.stdin) inputText += chunk;
const input = JSON.parse(inputText);
const { action, root, lock, binding, ids, owner } = input;
assert(['prepare', 'recall', 'requests', 'cleanup', 'environment'].includes(action));
const readJSON = async file => JSON.parse(await readFile(file));
const config = await readJSON(new URL('./config.json', import.meta.url));
// Reserve stdout for the structured result consumed by Python.
console.log = (...args) => console.error(...args);
if (action === 'environment') {
    process.stdout.write(JSON.stringify(parseEnv(await readFile(input.envFile, 'utf8'))));
} else if (action === 'cleanup') {
    await memoryPhase({ phase: action, root, lock, binding, config,
        env: parseEnv(await readFile(input.envFile, 'utf8')) });
    process.stdout.write('{}');
} else {
    const dataset = await readFile(path.join(root, config.dataset.localName));
    assert.equal(sha256(dataset), config.dataset.sha256);
    const rows = new Map(JSON.parse(dataset).map(row => [row.question_id, row]));
    assert.equal(rows.size, config.questions);
    const prepare = async id => {
        const prepared = await prepareCase(rows.get(id), config, lock ? lock.owner : owner);
        if (lock) assert.equal(sha256(JSON.stringify(prepared)), lock.inputs[id]);
        return prepared;
    };
    if (action === 'prepare') {
        const inputs = {};
        for (const id of ids) inputs[id] = sha256(JSON.stringify(await prepare(id)));
        process.stdout.write(JSON.stringify(inputs));
    } else {
        const require = createRequire(path.join(root, 'tokenizer/package.json'));
        assert.equal((await readJSON(path.join(path.dirname(require.resolve('tiktoken')), 'package.json'))).version, '1.0.22');
        const encoder = require('tiktoken').get_encoding('cl100k_base');
        try {
            const countTokens = text => encoder.encode(text, [], []).length;
            if (action === 'recall') {
                await memoryPhase({ phase: action, root, lock, binding, config, prepare, countTokens,
                    env: parseEnv(await readFile(input.envFile, 'utf8')) });
                process.stdout.write('{}');
            } else {
                const requests = {};
                const state = await readJSON(path.join(root, 'memory/state.json'));
                assert.equal(state.binding, binding); assert.equal(state.status, 'completed');
                assert(Number.isSafeInteger(state.operations) && state.operations > 0
                    && state.operations <= config.limits.memoryOperations);
                const owned = new Map(state.owned.map(entry => [entry.id, entry]));
                assert.equal(owned.size, state.owned.length);
                assert.deepEqual([...owned.keys()].sort(), [...lock.ids].sort());
                let indexedDocuments = 0, memoryMilliseconds = 0;
                for (const id of lock.ids) {
                    const prepared = await prepare(id);
                    const record = await readJSON(path.join(root, 'recall', `${id}.json`));
                    const entry = owned.get(id);
                    assert.equal(entry.owner, prepared.owner); assert.equal(entry.scope, prepared.scope);
                    assert(entry.deleted && entry.absent404);
                    assert(Number.isSafeInteger(record.queryReceipt) && record.queryReceipt > 0
                        && record.queryReceipt <= state.operations, 'Invalid query receipt index');
                    const receipt = await readJSON(path.join(root, 'memory', `http-${record.queryReceipt}.json`));
                    requests[id] = verifyRecall(record, prepared, config, countTokens, binding, receipt, entry.collection);
                    assert(Number.isFinite(record.milliseconds) && record.milliseconds >= 0);
                    indexedDocuments += prepared.docs.length; memoryMilliseconds += record.milliseconds;
                }
                process.stdout.write(JSON.stringify({ requests, indexedDocuments, memoryMilliseconds }));
            }
        } finally { encoder.free(); }
    }
}
