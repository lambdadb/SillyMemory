// Unit evidence for the private embedding client, using a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbeddingClient, EMBEDDING_PRESETS, EMBEDDING_BATCH, compactVector, embeddingConfig, embeddingIdentity, embeddingPreset, localEndpoint } from '../src/embedding.js';
import { LOCAL_MODELS, OLLAMA_MODELS, OPENAI_MODEL } from '../benchmark/text-private/embed.mjs';

const ollama = { baseUrl: 'http://localhost:11434/v1/', model: 'embeddinggemma', queryPrefix: 'task: search result | query: ', documentPrefix: 'title: none | text: ' };
const reply = (vectors, extra = {}) => Response.json({ data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })), ...extra });
function fake(respond = body => reply(body.input.map(() => [3, 4, 0]))) {
    const calls = [];
    return { calls, fetcher: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return respond(JSON.parse(init.body), calls.length); } };
}

test('presets use the exact model-card prefixes of the validated experiment harness', () => {
    const harness = { 'ollama-qwen3': ['qwen3', LOCAL_MODELS.qwen3], 'ollama-gemma': ['gemma', LOCAL_MODELS.gemma] };
    for (const [id, [provider, spec]] of Object.entries(harness)) {
        assert.equal(EMBEDDING_PRESETS[id].model, OLLAMA_MODELS[provider]);
        assert.equal(EMBEDDING_PRESETS[id].queryPrefix, spec.queryPrefix);
        assert.equal(EMBEDDING_PRESETS[id].documentPrefix, spec.passagePrefix);
    }
    assert.deepEqual([EMBEDDING_PRESETS['openai-small'].model, EMBEDDING_PRESETS['openai-small'].queryPrefix, EMBEDDING_PRESETS['openai-small'].documentPrefix], [OPENAI_MODEL, '', '']);
    assert.equal(embeddingPreset(ollama), 'ollama-gemma');
    assert.equal(embeddingPreset({ ...ollama, documentPrefix: '' }), undefined, 'changed prefixes are a custom, unvalidated model');
    assert.equal(embeddingPreset({ model: 'nomic-embed-text', queryPrefix: '', documentPrefix: '' }), undefined);
});

test('requests go direct with CORS, no host credentials and only the needed headers, with prefixes applied', async () => {
    const keyless = fake(), keyed = fake();
    const local = new EmbeddingClient(ollama, '', { fetcher: keyless.fetcher });
    assert.deepEqual(await local.query('User: where is the compass?'), [0.6, 0.8, 0]);
    await local.documents(['Mira hid the compass.']);
    const remote = new EmbeddingClient({ ...EMBEDDING_PRESETS['openai-small'] }, ' secret-test-only ', { fetcher: keyed.fetcher });
    await remote.documents(['Plain chunk.']);
    for (const { url, init } of [...keyless.calls, ...keyed.calls]) {
        assert.equal(init.method, 'POST'); assert.equal(init.mode, 'cors'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
        assert.ok(init.signal instanceof AbortSignal);
        assert.match(url, /\/embeddings$/);
    }
    assert.equal(keyless.calls[0].url, 'http://localhost:11434/v1/embeddings');
    assert.deepEqual(Object.keys(keyless.calls[0].init.headers), ['Content-Type']);
    assert.deepEqual(keyed.calls[0].init.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer secret-test-only' });
    assert.deepEqual(keyless.calls.map(c => c.body), [
        { model: 'embeddinggemma', input: ['task: search result | query: User: where is the compass?'], encoding_format: 'float' },
        { model: 'embeddinggemma', input: ['title: none | text: Mira hid the compass.'], encoding_format: 'float' }]);
    assert.deepEqual(keyed.calls[0].body.input, ['Plain chunk.'], 'no prefix by default');
    const qwen = fake();
    await new EmbeddingClient(EMBEDDING_PRESETS['ollama-qwen3'], '', { fetcher: qwen.fetcher }).query('User: hi');
    assert.equal(qwen.calls[0].body.input[0], 'Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:User: hi');
});

test('vectors are unit length and rounded to 4 decimals for compact JSON; response order follows index', async () => {
    assert.deepEqual(compactVector([1, 2, 2]), [0.3333, 0.6667, 0.6667]);
    assert.deepEqual(compactVector([-1e-9, 1]), [0, 1], 'negative zero serializes as 0');
    const v = compactVector(Array.from({ length: 1536 }, (_, i) => Math.sin(i + 1)));
    assert.ok(v.every(x => Math.abs(x * 1e4 - Math.round(x * 1e4)) < 1e-6));
    assert.ok(JSON.stringify(v).length / v.length < 8, 'about 7.4 characters per component');
    for (const bad of [[], [0, 0], [1, NaN], [1, Infinity], 'x', [1, '2']]) assert.equal(compactVector(bad), null);
    const swapped = fake(() => Response.json({ data: [{ index: 1, embedding: [0, 2] }, { index: 0, embedding: [2, 0] }] }));
    assert.deepEqual(await new EmbeddingClient(ollama, '', { fetcher: swapped.fetcher }).documents(['a', 'b']), [[1, 0], [0, 1]]);
});

test('malformed responses fail safely without exposing the body', async () => {
    const bodies = [
        { data: [] }, { data: 'x' }, {}, { data: [{ index: 0, embedding: [1, 'x'] }] }, { data: [{ index: 0, embedding: [] }] },
        { data: [{ index: 0, embedding: [0, 0] }] }, { data: [{ index: 3, embedding: [1, 0] }] }, { data: [{ index: 0 }] },
    ];
    for (const body of bodies) {
        const client = new EmbeddingClient(ollama, '', { fetcher: async () => Response.json(body) });
        await assert.rejects(client.query('x'), e => e.code === 'embedding' && e.status === 0 && /invalid/.test(e.message));
    }
    const notJson = new EmbeddingClient(ollama, '', { fetcher: async () => new Response('SECRET-BODY <html>') });
    await assert.rejects(notJson.query('x'), e => e.code === 'embedding' && !e.message.includes('SECRET'));
    for (const status of [401, 404, 500]) {
        const client = new EmbeddingClient(ollama, 'k', { fetcher: async () => Response.json({ error: 'SECRET-BODY' }, { status }) });
        // Status stays 0 so an embedding rejection never removes the LambdaDB key.
        await assert.rejects(client.query('x'), e => e.code === 'embedding' && e.status === 0 && e.message.includes(`HTTP ${status}`) && !e.message.includes('SECRET'));
    }
});

test('the endpoint check records a stable dimension and later responses must keep it', async () => {
    const steady = fake();
    const client = new EmbeddingClient(ollama, '', { fetcher: steady.fetcher });
    assert.equal(await client.check(), 3);
    assert.equal(steady.calls.length, 1); assert.equal(steady.calls[0].body.input.length, 2);
    const unstable = new EmbeddingClient(ollama, '', { fetcher: async () => reply([[1, 0, 0], [1, 0]]) });
    await assert.rejects(unstable.check(), /2-dimension vectors instead of 3/);
    const changed = new EmbeddingClient({ ...ollama, dimensions: 768 }, '', { fetcher: steady.fetcher });
    await assert.rejects(changed.documents(['a']), e => e.code === 'embedding' && /3-dimension vectors instead of 768/.test(e.message));
});

test('network/CORS failure, timeout and cancellation are explicit and distinct', async () => {
    const blocked = new EmbeddingClient(ollama, '', { fetcher: async () => { throw new TypeError('Failed to fetch http://secret'); } });
    await assert.rejects(blocked.query('x'), e => e.code === 'embedding' && /CORS/.test(e.message) && !e.message.includes('secret'));
    const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    await assert.rejects(new EmbeddingClient(ollama, '', { fetcher: hang, timeoutMs: 20 }).query('x'), e => e.code === 'embedding' && /timed out/.test(e.message));
    const controller = new AbortController();
    const pending = new EmbeddingClient(ollama, '', { fetcher: hang }).query('x', controller.signal);
    controller.abort();
    await assert.rejects(pending, e => e.code === 'canceled');
});

test('documents are embedded in bounded requests in order', async () => {
    const batches = fake(body => reply(body.input.map(text => [Number(text.split(' ').at(-1)) + 1, 1])));
    const client = new EmbeddingClient({ ...ollama, documentPrefix: '' }, '', { fetcher: batches.fetcher });
    const texts = Array.from({ length: EMBEDDING_BATCH * 2 + 6 }, (_, i) => `chunk ${i}`);
    const vectors = await client.documents(texts);
    assert.deepEqual(batches.calls.map(c => c.body.input.length), [EMBEDDING_BATCH, EMBEDDING_BATCH, 6]);
    assert.equal(vectors.length, texts.length);
    assert.ok(vectors.every((v, i) => i === 0 || v[0] >= vectors[i - 1][0]), 'vectors keep input order across requests');
    assert.deepEqual(vectors[0], [0.7071, 0.7071]);
});

test('configuration normalizes the base URL, keeps prefixes exact and rejects unsafe URLs', async () => {
    assert.deepEqual(embeddingConfig({ baseUrl: ' https://api.example.test/v1// ', model: ' m ', queryPrefix: 'Query:\n', documentPrefix: undefined }),
        { baseUrl: 'https://api.example.test/v1', model: 'm', queryPrefix: 'Query:\n', documentPrefix: '' });
    for (const baseUrl of ['', 'ftp://x.test', 'https://user:pass@x.test/v1', 'https://x.test/v1?key=1', 'https://x.test/v1#a']) assert.throws(() => embeddingConfig({ baseUrl, model: 'm' }));
    assert.throws(() => embeddingConfig({ baseUrl: 'http://localhost:11434/v1', model: ' ' }), /model name/);
    assert.equal(localEndpoint('http://127.0.0.1:11434/v1'), true);
    assert.equal(localEndpoint('http://192.168.1.4:11434/v1'), false);
    await assert.rejects(embeddingIdentity({ ...ollama }), e => e.code === 'embedding' && /Test endpoint/.test(e.message));
});

test('the embedding identity fits LambdaDB collection tag rules and changes with model, prefixes or dimension', async () => {
    const base = await embeddingIdentity({ ...ollama, dimensions: 768 });
    assert.equal(base.dimensions, 768);
    assert.equal(base.tags.memory_mode, 'private');
    // The pinned SDK allows five tags and no ':', '#' or ',' in values; three tags are already used.
    assert.equal(Object.keys({ application: 'sillymemory', owner: 'o', chat: 's', ...base.tags }).length, 5);
    for (const value of Object.values(base.tags)) assert.match(value, /^[^:#,]{1,127}$/);
    assert.deepEqual(await embeddingIdentity({ ...ollama, baseUrl: 'http://127.0.0.1:11434/v1', dimensions: 768 }), base, 'the endpoint location is not part of the identity');
    for (const changed of [{ model: 'qwen3-embedding:0.6b' }, { queryPrefix: '' }, { documentPrefix: '' }, { dimensions: 1024 }]) {
        assert.notEqual((await embeddingIdentity({ ...ollama, dimensions: 768, ...changed })).tags.embedding, base.tags.embedding);
    }
});
