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
    // Larger multilingual candidates (direct tokenizer + model path, full output dimension,
    // no MRL truncation). Prompts and pooling follow each model card:
    // EmbeddingGemma: retrieval query/document prompts; the ONNX graph's `sentence_embedding`
    // output already applies the Sentence Transformers mean pooling + dense projections.
    gemma: { model: 'onnx-community/embeddinggemma-300m-ONNX', pooling: 'sentence_embedding', dimensions: 768,
        maxLength: 2048, queryPrefix: 'task: search result | query: ', passagePrefix: 'title: none | text: ' },
    // BGE-M3 dense: CLS pooling, no instruction.
    bgem3: { model: 'Xenova/bge-m3', pooling: 'cls', dimensions: 1024, maxLength: 8192, queryPrefix: '', passagePrefix: '' },
    // Qwen3-Embedding: instruction on queries only, last-token pooling (the tokenizer appends <|endoftext|>).
    qwen3: { model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', pooling: 'last_token', dimensions: 1024, maxLength: 8192,
        queryPrefix: 'Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:', passagePrefix: '' },
});
export const LOCAL_DTYPE = 'q8', LOCAL_DIMENSIONS = 384;

// dtype: q8 by default; fp32 is a diagnostic for quantization loss.
export async function localEmbedder({ cacheDir, provider = 'local', threads, dtype = LOCAL_DTYPE } = {}) {
    const spec = LOCAL_MODELS[provider];
    const { pipeline, env, AutoTokenizer, AutoModel } = await import('@huggingface/transformers');
    if (cacheDir) env.cacheDir = cacheDir;
    const session_options = threads ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : undefined;
    if (spec.maxLength) {
        const tokenizer = await AutoTokenizer.from_pretrained(spec.model);
        const model = await AutoModel.from_pretrained(spec.model, { dtype, device: 'cpu', ...(session_options ? { session_options } : {}) });
        return async (texts, { query = false } = {}) => {
            const inputs = tokenizer(texts.map(t => (query ? spec.queryPrefix : spec.passagePrefix) + t),
                { padding: true, truncation: true, max_length: spec.maxLength });
            const output = await model(inputs), d = spec.dimensions, n = texts.length;
            const mask = inputs.attention_mask, [, len] = mask.dims;
            let pooled;
            if (spec.pooling === 'sentence_embedding') pooled = i => output.sentence_embedding.data.subarray(i * d, (i + 1) * d);
            else {
                const hidden = output.last_hidden_state; assert.deepEqual(hidden.dims.slice(0, 2), [n, len]); assert.equal(hidden.dims[2], d);
                pooled = i => {
                    // CLS: first position (right padding). Last token: last attended position, for either padding side.
                    let t = 0;
                    if (spec.pooling === 'cls') assert(Number(mask.data[i * len]), 'CLS pooling needs right padding');
                    if (spec.pooling === 'last_token') for (let j = 0; j < len; j++) if (Number(mask.data[i * len + j])) t = j;
                    return hidden.data.subarray((i * len + t) * d, (i * len + t + 1) * d);
                };
            }
            return Array.from({ length: n }, (_, i) => {
                const v = Array.from(pooled(i)), norm = Math.hypot(...v); assert.equal(v.length, d);
                return v.map(x => x / norm);
            });
        };
    }
    const extractor = await pipeline('feature-extraction', spec.model, { dtype, device: 'cpu', ...(session_options ? { session_options } : {}) });
    return async (texts, { query = false } = {}) => {
        const input = texts.map(t => (query ? spec.queryPrefix : spec.passagePrefix) + t);
        // L2-normalized pooled output; inputs beyond 512 tokens are truncated.
        const output = await extractor(input, { pooling: spec.pooling, normalize: true, truncation: true, max_length: 512 });
        const [n, d] = output.dims; assert.equal(n, texts.length); assert.equal(d, spec.dimensions);
        return Array.from({ length: n }, (_, i) => Array.from(output.data.subarray(i * d, (i + 1) * d)));
    };
}

// The same candidates served by Ollama through its OpenAI-compatible /v1/embeddings, as the
// product would call it. Ollama's embedding template is `{{ .Prompt }}` (no prompt is added),
// so the model-card prefixes above are applied client-side. Outputs are L2-normalized here;
// `norms` records the norms Ollama returned.
export const OLLAMA_MODELS = Object.freeze({ gemma: 'embeddinggemma', bgem3: 'bge-m3', qwen3: 'qwen3-embedding:0.6b' });

export function ollamaEmbedder({ provider, baseUrl = 'http://localhost:11434/v1', norms = [] }) {
    const spec = LOCAL_MODELS[provider], model = OLLAMA_MODELS[provider];
    return async (texts, { query = false } = {}) => {
        const response = await fetch(`${baseUrl}/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: texts.map(t => (query ? spec.queryPrefix : spec.passagePrefix) + t), encoding_format: 'float' }),
            signal: AbortSignal.timeout(600000) });
        if (!response.ok) throw new Error(`Ollama embeddings HTTP ${response.status}`);
        const body = await response.json();
        assert.equal(body.data.length, texts.length);
        return body.data.sort((a, b) => a.index - b.index).map(({ embedding: v }) => {
            assert.equal(v.length, spec.dimensions);
            const norm = Math.hypot(...v); norms.push(norm);
            return v.map(x => x / norm);
        });
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
