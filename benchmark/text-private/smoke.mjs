// Stage 2: live text-private contract smoke on one owned collection with 30
// synthetic documents (no personal data), then verified deletion.
//   node smoke.mjs --env-file FILE --out DIR
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { analyze } from './analyzer.mjs';
import { localEmbedder } from './embed.mjs';
import { Lambda } from './lambda.mjs';
import { documentFrequencies, documentWeights, queryWeights, termKey } from './sparse.mjs';

const { values: args } = parseArgs({ options: { 'env-file': { type: 'string' }, out: { type: 'string' } } });
await mkdir(args.out, { recursive: true });
const env = parseEnv(await readFile(args['env-file'], 'utf8'));
const db = new Lambda(env, { receipts: path.join(args.out, 'smoke-http.jsonl'), maxOperations: 300 });
const owner = randomBytes(32).toString('hex'), scopes = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
const secret = randomBytes(32), key = term => termKey(secret, term);
const name = `smtp_smoke_${randomBytes(8).toString('hex')}`;
const tags = { application: 'sillymemory', owner, experiment: 'text-private-retrieval-v1-smoke' };
const topics = ['hiking trip to the mountain lake with my sister', 'baking sourdough bread with rye flour', 'repairing the bicycle chain and brakes',
    'planning a birthday party for my grandmother', 'learning to play jazz piano chords', 'adopting a rescue dog named Biscuit'];
const texts = Array.from({ length: 30 }, (_, i) => i === 29 ? 'the and of to' : `Synthetic note ${i}: I talked about ${topics[i % topics.length]} on day ${i}.`);
const embed = await localEmbedder({ cacheDir: path.join(args.out, '../model-cache') });
const vectors = await embed(texts);
const docs = texts.map((text, i) => {
    const sparse = documentWeights(analyze(text), key);
    return { id: `doc-${i}`, owner, scope: scopes[i < 24 ? 0 : 1], revision: `r${i}`, message: i, chunk: 0, start: 0, end: text.length,
        role: i % 2 ? 'assistant' : 'user', dense: vectors[i], ...(sparse ? { sparse } : {}) };
});
assert(!docs[29].sparse, 'Stop-word-only document should have no sparse terms');
const filter = (scope, before) => ({ queryString: { query: `owner:${owner} AND scope:${scope}${before ? ` AND message:[0 TO ${before - 1}]` : ''}` } });
const results = { collection: name, checks: {} };
const check = async (label, job) => {
    try { results.checks[label] = { ok: true, ...(await job()) }; }
    catch (error) { results.checks[label] = { ok: false, status: error.status, error: String(error.body || error.message).slice(0, 500) }; }
};
const indexConfigs = {
    dense: { type: 'vector', dimensions: 384, similarity: 'cosine' }, sparse: { type: 'sparseVector' },
    message: { type: 'long' }, owner: { type: 'keyword' }, scope: { type: 'keyword' }, revision: { type: 'keyword' }, role: { type: 'keyword' },
};
let created = false;
try {
    await db.create(name, indexConfigs, tags); created = true;
    await check('collectionSchema', async () => ({ indexConfigs: (await db.get(name)).collection.indexConfigs }));
    await check('emptySparseDocumentRejected', async () => { await db.upsert(name, [{ ...docs[0], id: 'bad-empty', sparse: {} }]); return { accepted: true }; });
    await check('zeroWeightDocumentRejected', async () => { await db.upsert(name, [{ ...docs[0], id: 'bad-zero', sparse: { abc: 0 } }]); return { accepted: true }; });
    await db.upsert(name, docs);
    await check('consistentReadAfterWrite', async () => {
        const fetched = (await db.fetch(name, docs.map(d => d.id))).docs.map(x => x.doc);
        assert.equal(fetched.length, 30);
        const sample = fetched.find(d => d.id === 'doc-0');
        return { fetched: fetched.length, returnedFields: Object.keys(sample).sort(), sparseReturned: 'sparse' in sample, denseReturned: 'dense' in sample,
            noTextField: fetched.every(d => !('text' in d)) };
    });
    const scope0 = docs.filter(d => d.scope === scopes[0]);
    const stats = documentFrequencies(scope0.map((d, i) => analyze(texts[docs.indexOf(d)])));
    const queryText = 'User: When did I bake sourdough bread?';
    const q = queryWeights(queryText, stats, key), [qv] = await embed([queryText], { query: true });
    const bayes = (f, sparseVector = q, extra = {}) => ({ size: 5, candidateSize: 20, ...extra, query: { bayesian: [
        { knn: { field: 'dense', queryVector: qv, k: 20, filter: f } },
        { bool: [{ ...f, occur: 'filter' }, { sparseVector: { field: 'sparse', queryVector: sparseVector }, occur: 'must' }] }] } });
    await check('bayesianDenseSparse', async () => {
        const r = await db.query(name, bayes(filter(scopes[0])));
        const ids = r.docs.map(h => h.doc.id);
        assert(ids.every(id => Number(id.slice(4)) < 24), 'Scope filter leaked');
        return { ids, scores: r.docs.map(h => h.score), topTopic: texts[Number(ids[0].slice(4))], sensible: Number(ids[0].slice(4)) % 6 === 1 };
    });
    await check('sparseOnlyFilterAndRange', async () => {
        const r = await db.query(name, { size: 10, query: { bool: [{ ...filter(scopes[0], 10), occur: 'filter' }, { sparseVector: { field: 'sparse', queryVector: q }, occur: 'must' }] } });
        const ids = r.docs.map(h => h.doc.id);
        assert(ids.every(id => Number(id.slice(4)) < 10), 'Message range filter leaked');
        return { ids, scores: r.docs.map(h => h.score) };
    });
    await check('otherScopeIsolation', async () => {
        const r = await db.query(name, bayes(filter(scopes[1])));
        const ids = r.docs.map(h => h.doc.id); assert(ids.every(id => Number(id.slice(4)) >= 24)); return { ids };
    });
    await check('bayesianWithoutCandidateSizeRejected', async () => { const b = bayes(filter(scopes[0])); delete b.candidateSize; await db.query(name, b); return { accepted: true }; });
    const k0 = Object.keys(q)[0];
    await check('queryWeight64Accepted', async () => { await db.query(name, bayes(filter(scopes[0]), { [k0]: 64 })); return {}; });
    await check('queryWeightAbove64Rejected', async () => { await db.query(name, bayes(filter(scopes[0]), { [k0]: 64.01 })); return { accepted: true }; });
    await check('queryWeightZero', async () => { await db.query(name, bayes(filter(scopes[0]), { [k0]: 0 })); return { accepted: true }; });
    await check('emptySparseQueryRejected', async () => { await db.query(name, bayes(filter(scopes[0]), {})); return { accepted: true }; });
    const many = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i ? `t${i}` : k0, 1]));
    await check('query4096TermsAccepted', async () => { await db.query(name, bayes(filter(scopes[0]), many(4096))); return {}; });
    await check('query4097TermsRejected', async () => { await db.query(name, bayes(filter(scopes[0]), many(4097))); return { accepted: true }; });
    await check('largeDocumentWeightAccepted', async () => {
        await db.upsert(name, [{ ...docs[0], id: 'big-weight', sparse: { [k0]: 1e6 } }]);
        const r = await db.query(name, { size: 1, query: { bool: [{ ...filter(scopes[0]), occur: 'filter' }, { sparseVector: { field: 'sparse', queryVector: { [k0]: 1 } }, occur: 'must' }] } });
        return { top: r.docs[0]?.doc.id, score: r.docs[0]?.score };
    });
} finally {
    if (created) results.cleanup = await db.deleteOwned(name, tags);
    results.operations = db.operations; results.byKind = db.byKind; results.bytesSent = db.bytesSent;
    await writeFile(path.join(args.out, 'smoke.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
}
