// Stage 3 retrieval: ingest each LongMemEval-S question into its own owned
// collection, issue every arm's query, record returned IDs/scores, then delete
// the collection with a verified 404. Resumable per question.
//   node run.mjs --layout native|private --dataset FILE --out DIR --env-file FILE [--limit N]
// native  (text + managed OpenAI small, product schema): A (historical query with
//         Jev rerank), B (Bayesian, no rerank), F (knn only), L (server BM25 only).
// private (no text; client vectors + hashed sparse BM25): C (OpenAI vector + sparse),
//         D (bge + sparse), E (bge knn only), K (OpenAI knn only), S (sparse only).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { schema } from '../../src/client.js';
import { prepareCase, recallQuery, sha256 } from '../longmemeval/protocol.mjs';
import { analyze } from './analyzer.mjs';
import { LOCAL_DIMENSIONS, OPENAI_DIMENSIONS } from './embed.mjs';
import { Lambda } from './lambda.mjs';
import { documentFrequencies, documentWeights, queryWeights, termKey } from './sparse.mjs';

const { values: args } = parseArgs({ options: { layout: { type: 'string' }, dataset: { type: 'string' }, out: { type: 'string' },
    'env-file': { type: 'string' }, vectors: { type: 'string' }, limit: { type: 'string' }, concurrency: { type: 'string', default: '3' },
    'max-operations': { type: 'string', default: '30000' }, rps: { type: 'string', default: '4' }, cleanup: { type: 'boolean', default: false } } });
const layout = args.layout; assert(['native', 'private'].includes(layout));
const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(await readFile(path.join(here, '../longmemeval/config.json')));
const root = path.join(args.out, layout); await mkdir(path.join(root, 'recall'), { recursive: true });
const atomic = async (file, value) => { await writeFile(file + '.tmp', JSON.stringify(value)); await rename(file + '.tmp', file); };
const stateFile = path.join(root, 'state.json');
let state;
try { state = JSON.parse(await readFile(stateFile)); }
catch { state = { layout, owner: randomBytes(32).toString('hex'), owned: {}, operations: 0, startedAt: new Date().toISOString() }; await atomic(stateFile, state); }
const env = parseEnv(await readFile(args['env-file'], 'utf8'));
const db = new Lambda(env, { receipts: path.join(root, 'http.jsonl'), maxOperations: Number(args['max-operations']) - state.operations, rps: Number(args.rps) });
const experiment = `text-private-retrieval-v1-${layout}`;
const tagsFor = scope => ({ application: 'sillymemory', owner: state.owner, chat: scope, experiment });
let saving = Promise.resolve(), seen = 0;
const saveState = () => (saving = saving.then(async () => { state.operations += db.operations - seen; seen = db.operations; await atomic(stateFile, state); }));

if (args.cleanup) {
    for (const [id, entry] of Object.entries(state.owned)) if (!entry.absent404) {
        Object.assign(entry, await db.deleteOwned(entry.collection, tagsFor(entry.scope))); await saveState(); console.error(`cleaned ${id}`);
    }
    const leftovers = (await db.listCollections()).filter(c => c.tags?.experiment === experiment && c.tags?.owner === state.owner);
    state.listingCheck = { at: new Date().toISOString(), leftovers: leftovers.map(c => c.collectionName) }; await saveState();
    console.log(JSON.stringify(state.listingCheck));
    process.exit(0);
}

const bytes = await readFile(args.dataset);
assert.equal(sha256(bytes), config.dataset.sha256);
let rows = JSON.parse(bytes).sort((a, b) => a.question_id < b.question_id ? -1 : 1);
if (args.limit) rows = rows.slice(0, Number(args.limit));

// Client vectors: precomputed float32 rows keyed by sha256(text).
async function vectorStore(provider, dims) {
    const index = new Map(JSON.parse(await readFile(path.join(args.vectors, `${provider}-index.json`))).map((k, i) => [k, i]));
    const fd = await open(path.join(args.vectors, `${provider}.f32`));
    return async text => {
        const row = index.get(sha256(text)); assert(row !== undefined, `Missing ${provider} vector`);
        const buffer = Buffer.alloc(dims * 4); await fd.read(buffer, 0, dims * 4, row * dims * 4);
        return Array.from({ length: dims }, (_, i) => Number(buffer.readFloatLE(i * 4).toPrecision(8)));
    };
}
const vectors = layout === 'private' ? { openai: await vectorStore('openai', OPENAI_DIMENSIONS), bge: await vectorStore('local', LOCAL_DIMENSIONS) } : null;

const privateSchema = {
    openai: { type: 'vector', dimensions: OPENAI_DIMENSIONS, similarity: 'cosine' },
    bge: { type: 'vector', dimensions: LOCAL_DIMENSIONS, similarity: 'cosine' },
    sparse: { type: 'sparseVector' }, message: { type: 'long' },
    owner: { type: 'keyword' }, scope: { type: 'keyword' }, revision: { type: 'keyword' }, role: { type: 'keyword' },
};
const META = ['id', 'owner', 'scope', 'revision', 'message', 'chunk', 'start', 'end', 'role'];

function queriesFor(prepared, extra) {
    const base = recallQuery(prepared, config), [knn, bool] = base.query.bayesian;
    const filter = knn.knn.filter, size = config.retrieval.final, k = config.retrieval.k, candidateSize = config.retrieval.candidates;
    if (layout === 'native') {
        const { consistentRead, includeVectors, ref, ...a } = base;
        return { A: a, B: { size, candidateSize, query: base.query }, F: { size, query: knn }, L: { size, query: bool } };
    }
    const knnOf = (field, queryVector) => ({ knn: { field, queryVector, k, filter } });
    const sparse = extra.sparseQuery && { bool: [{ ...filter, occur: 'filter' }, { sparseVector: { field: 'sparse', queryVector: extra.sparseQuery }, occur: 'must' }] };
    // An empty sparse query cannot be sent; fall back to the dense leg alone.
    const fused = field => sparse ? { size, candidateSize, query: { bayesian: [knnOf(field, extra[field]), sparse] } } : { size, query: knnOf(field, extra[field]) };
    return { C: fused('openai'), D: fused('bge'), E: { size, query: knnOf('bge', extra.bge) }, K: { size, query: knnOf('openai', extra.openai) },
        ...(sparse ? { S: { size, query: sparse } } : {}) };
}

async function runQuestion(row) {
    const file = path.join(root, 'recall', `${row.question_id}.json`);
    try { await readFile(file); return; } catch {}
    const prepared = await prepareCase(row, config, state.owner);
    const collection = `smtp_${randomBytes(12).toString('hex')}`, tags = tagsFor(prepared.scope);
    const entry = state.owned[row.question_id] = { collection, scope: prepared.scope, absent404: false };
    await saveState();
    const started = performance.now(), timing = {};
    try {
        let docs, extra = {};
        if (layout === 'native') {
            await db.create(collection, schema(), tags);
            docs = prepared.docs;
        } else {
            await db.create(collection, privateSchema, tags);
            const secret = randomBytes(32), key = term => termKey(secret, term);
            const terms = prepared.docs.map(d => analyze(d.text));
            const queryText = recallQuery(prepared, config).query.bayesian[0].knn.queryText;
            extra.sparseQuery = queryWeights(queryText, documentFrequencies(terms), key);
            extra.openai = await vectors.openai(queryText); extra.bge = await vectors.bge(queryText);
            docs = [];
            for (const [i, d] of prepared.docs.entries()) {
                const sparse = documentWeights(terms[i], key);
                docs.push({ ...Object.fromEntries(META.map(f => [f, d[f]])), openai: await vectors.openai(d.text), bge: await vectors.bge(d.text), ...(sparse ? { sparse } : {}) });
            }
            entry.docsWithoutSparse = docs.filter(d => !d.sparse).length;
            entry.sparseQueryTerms = extra.sparseQuery ? Object.keys(extra.sparseQuery).length : 0;
        }
        let t = performance.now();
        for (let i = 0; i < docs.length; i += config.retrieval.batchSize) await db.upsert(collection, docs.slice(i, i + config.retrieval.batchSize));
        timing.upsertMs = performance.now() - t; t = performance.now();
        // Source readback with consistentRead: every stored field except vectors must match.
        for (let i = 0; i < docs.length; i += 100) {
            const expected = docs.slice(i, i + 100);
            const stored = new Map((await db.fetch(collection, expected.map(d => d.id))).docs.map(x => [x.doc.id, x.doc]));
            assert.equal(stored.size, expected.length, 'Stored source count differs');
            for (const doc of expected) for (const [k, v] of Object.entries(doc)) {
                if (!['openai', 'bge', 'sparse'].includes(k)) assert.deepEqual(stored.get(doc.id)[k], v, `Stored field differs: ${k}`);
            }
        }
        timing.readbackMs = performance.now() - t;
        if (layout === 'native' && Object.keys(state.owned).length <= 3) {
            // Small native-vector sample for the native-versus-client cosine check.
            const sample = prepared.docs.slice(0, 100);
            const got = (await db.fetch(collection, sample.map(d => d.id), true)).docs.map(x => ({ id: x.doc.id, embedding: x.doc.embedding }));
            await writeFile(path.join(root, `native-vectors-${row.question_id}.json`), JSON.stringify(got.map(g => ({ ...g, textSha256: sha256(sample.find(d => d.id === g.id).text) }))));
        }
        const byId = new Map(prepared.docs.map(d => [d.id, d])), results = {};
        for (const [arm, body] of Object.entries(queriesFor(prepared, extra))) {
            t = performance.now();
            const response = await db.query(collection, body);
            assert(response.isDocsInline !== false && Array.isArray(response.docs) && response.docs.length <= config.retrieval.final);
            for (const hit of response.docs) {
                const source = byId.get(hit.doc.id); assert(source, 'Unknown returned source');
                for (const f of META) assert.deepEqual(hit.doc[f], source[f], `Returned metadata differs: ${f}`);
                if (layout === 'native') assert.equal(hit.doc.text, source.text);
                else assert(!('text' in hit.doc) && !('openai' in hit.doc) && !('sparse' in hit.doc));
            }
            if (arm === 'A') assert(response.rerank?.status === 'applied' && response.rerank.model === config.retrieval.reranker && response.rerank.scoredCount === response.rerank.candidateCount);
            assert.equal(new Set(response.docs.map(h => h.doc.id)).size, response.docs.length);
            results[arm] = { ids: response.docs.map(h => h.doc.id), scores: response.docs.map(h => h.score),
                retrievalScores: response.docs.map(h => h.retrievalScore ?? null), took: response.took ?? null, total: response.total ?? null,
                rerank: response.rerank ?? null, clientMs: performance.now() - t, fallbackKnnOnly: layout === 'private' && !extra.sparseQuery && ['C', 'D'].includes(arm),
                requestSha256: sha256(JSON.stringify(body)) };
        }
        await atomic(file, { id: row.question_id, collection, sourceSha256: sha256(JSON.stringify(prepared)), documents: docs.length,
            uploadBytes: docs.reduce((n, d) => n + Buffer.byteLength(JSON.stringify(d)), 0), timing, results, milliseconds: performance.now() - started });
    } finally {
        Object.assign(entry, await db.deleteOwned(collection, tags));
        await saveState();
    }
}

const queue = [...rows];
let completed = 0, failure = null;
await Promise.all(Array.from({ length: Number(args.concurrency) }, async () => {
    while (queue.length && !failure) {
        const row = queue.shift();
        try { await runQuestion(row); }
        catch (error) { failure = error; console.error(`FAILED ${row.question_id}: ${error.message} ${error.body || ''}`); }
        if (++completed % 10 === 0) console.error(`${layout}: ${completed}/${rows.length} questions; ${state.operations} operations; 429 retries ${db.retries429}`);
    }
}));
state.completedAt = new Date().toISOString(); state.byKind = { ...(state.byKind || {}) };
for (const [k, v] of Object.entries(db.byKind)) state.byKind[k] = (state.byKind[k] || 0) + v;
state.bytesSent = (state.bytesSent || 0) + db.bytesSent; state.retries429 = (state.retries429 || 0) + db.retries429;
await saveState();
if (failure) throw failure;
const done = (await readdir(path.join(root, 'recall'))).filter(f => f.endsWith('.json')).length;
console.log(JSON.stringify({ layout, questions: done, operations: state.operations, allAbsent: Object.values(state.owned).every(e => e.absent404) }));
