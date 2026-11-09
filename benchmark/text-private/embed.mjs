// Embedding providers for the text-private arms. Local: BAAI bge-small-en-v1.5
// through transformers.js with the q8 ONNX weights the browser WASM backend loads
// by default. Remote: OpenAI text-embedding-3-small called by the client.
import assert from 'node:assert/strict';

// Local models load the q8 ONNX weights the browser WASM backend uses by default.
// bge-small-en-v1.5 is English-only (diagnostic); multilingual-e5-small is the
// multilingual product candidate. Prefixes and pooling follow each model card.
export const LOCAL_MODELS = Object.freeze({
    local: { model: 'Xenova/bge-small-en-v1.5', pooling: 'cls', dimensions: 384,
        queryPrefix: 'Represent this sentence for searching relevant passages: ', passagePrefix: '' },
    e5: { model: 'Xenova/multilingual-e5-small', pooling: 'mean', dimensions: 384, queryPrefix: 'query: ', passagePrefix: 'passage: ' },
});
export const LOCAL_DTYPE = 'q8', LOCAL_DIMENSIONS = 384;

export async function localEmbedder({ cacheDir, provider = 'local', threads } = {}) {
    const spec = LOCAL_MODELS[provider];
    const { pipeline, env } = await import('@huggingface/transformers');
    if (cacheDir) env.cacheDir = cacheDir;
    const extractor = await pipeline('feature-extraction', spec.model, { dtype: LOCAL_DTYPE, device: 'cpu',
        ...(threads ? { session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } } : {}) });
    return async (texts, { query = false } = {}) => {
        const input = texts.map(t => (query ? spec.queryPrefix : spec.passagePrefix) + t);
        // L2-normalized pooled output; inputs beyond 512 tokens are truncated.
        const output = await extractor(input, { pooling: spec.pooling, normalize: true, truncation: true, max_length: 512 });
        const [n, d] = output.dims; assert.equal(n, texts.length); assert.equal(d, spec.dimensions);
        return Array.from({ length: n }, (_, i) => Array.from(output.data.subarray(i * d, (i + 1) * d)));
    };
}

export const OPENAI_MODEL = 'text-embedding-3-small', OPENAI_DIMENSIONS = 1536;

export async function openaiEmbed(texts, key, baseUrl = 'https://api.openai.com/v1') {
    const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: OPENAI_MODEL, input: texts, encoding_format: 'float' }),
        signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`OpenAI embeddings HTTP ${response.status}`);
    const body = await response.json();
    assert.equal(body.data.length, texts.length);
    const vectors = body.data.sort((a, b) => a.index - b.index).map(x => x.embedding);
    for (const v of vectors) assert.equal(v.length, OPENAI_DIMENSIONS);
    return { vectors, tokens: body.usage.prompt_tokens };
}
