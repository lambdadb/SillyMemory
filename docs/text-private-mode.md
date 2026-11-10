# Text-private memory mode

Status: design accepted, implementation in progress on `feat/text-private-mode`.
Evidence and the adoption decision live in
[text-private-retrieval](text-private-retrieval.md).

## Product decision

Add an opt-in global mode in which raw chat text is not sent to or stored in
LambdaDB. The browser embeds chunks through a user-connected OpenAI-compatible
embedding endpoint, LambdaDB stores only vectors and metadata, and retrieved
chunks are restored from the open SillyTavern chat. LambdaDB remains required
in every mode.

Wording rule: say "raw text is not sent to or stored in LambdaDB". Do not say
vectors are unrecoverable or that text never leaves the device. For a local
endpoint, the UI may add that text stays on this machine.

## Scope

In the first version:

- One OpenAI-compatible `POST {baseUrl}/embeddings` adapter, used for local
  servers (Ollama, LM Studio, llama.cpp) and remote providers (OpenAI and others
  that allow browser CORS).
- Recommended models, labelled "validated on English LongMemEval-S only":
  - Remote: OpenAI `text-embedding-3-small`.
  - Local: Ollama `qwen3-embedding:0.6b`, with `embeddinggemma` as the lighter
    alternative.
  - Each recommended model carries its model-card query/document prefixes.
- Any other model name is allowed and labelled "quality not validated". It uses
  no prefix by default, with optional query/document prefix fields.
- Dense KNN only. No rerank (it needs text), no lexical or client sparse search.
- A global setting that selects the mode for newly created story collections.

Out of scope, follow-ups:

- In-browser models (transformers.js WASM/WebGPU). The Qwen3 q8 ONNX port is
  broken, and browser speed is unmeasured.
- Client sparse/BM25 hybrid.
- File and image uploads in this mode; they need a separate local text store.
- Automatic migration of existing stories; the user rebuilds instead.
- Any multilingual quality claim.

## Design

### Settings and credentials

- Store the mode, base URL, model and optional prefixes in ordinary extension
  settings. Never store an API key there.
- Save an embedding key, when one is given, in a dedicated browser record
  `sillymemory:embedding-credential:<owner>`. It follows the
  [saved connection](saved-connection.md) rules:
  - Scope it to the native account owner and the exact normalized base URL and
    model.
  - Restore it only on an exact match. Replacing the connection replaces the
    record.
  - Keep it out of logs, URLs and settings.
  - It persists across browser restarts until site data is cleared.
- A keyless endpoint, such as local Ollama, needs no record.
- AGENTS.md currently allows only the LambdaDB credential record. Widen that
  rule in this same change.

### Endpoint check

**Test endpoint** sends one short embedding request. It verifies:

- HTTP success.
- A `data[0].embedding` array of finite numbers.
- A stable dimension, recorded for the connection.

Requests use `mode: cors`, `credentials: omit` and `redirect: error`. They send
only `Content-Type` and, if a key is set, `Authorization: Bearer`. They never
send SillyTavern cookies or CSRF headers, and there is no proxy fallback.

### Collection schema and identity

A text-private story collection omits the `text` field and uses a plain vector
field:

```js
embedding: { type: 'vector', dimensions: <detected>, similarity: 'cosine' }
```

Other metadata fields stay unchanged: `message`, `role`, `owner`, `scope`,
`revision`, the time fields, and the chunk `start`/`end`/`chunk`.

Record the embedding identity in collection tags next to the existing
`application`/`owner`/`chat` tags:

- `memory_mode: text_private`
- `embedding_model`
- `embedding_prefix`, a short digest of the query and document prefixes
- `embedding_dimensions`

Before every sync or search, compare these tags with the current settings. On
mismatch, stop with an explicit error and offer **Rebuild story**. The existing
rebuild flow (#141) re-embeds every chunk from the open chat.

A story created in the default mode keeps it after the global setting changes.
Opening it under the other mode shows the same rebuild offer.

### Write path

- Chunking, document IDs, revisions, the sync journal and the 200-document
  batches stay unchanged.
- For each new or changed chunk, embed the document prefix plus the chunk text,
  then upsert the vector and metadata without `text`.
- Edits, swipes and deletions keep using the existing event-driven sync.
  Revisions change, stale documents are deleted, and new ones are embedded.
- Upload size is billed by the request body bytes (`requestBodySize` in
  LambdaDB `DocumentMutationService`). Serialize vectors compactly:
  - Round each component to 4 decimal places. Accept this only if the local
    ranking check below passes.
  - Otherwise fall back to the shortest float32 representation, which is
    lossless because LambdaDB stores float32.

### Search and restoration

- Embed the query prefix plus the existing role-labelled query, then run
  `knn { field: 'embedding', queryVector, k: 200, filter }` with `size: 50`.
- Keep the existing owner, scope and message-boundary filter and the branch of
  the open chat.
- Restoration already works from the open chat. Retrieval recomputes the
  expected local documents, matches each hit by document ID, and injects the
  local source text; the remote hit is only a ranking signal (`src/memory.js`).
  The identity check also compares `hit.text` with the local text. In this mode,
  drop only that comparison; ID, revision, scope and the time fields still
  match. A stale hit has no local counterpart and is skipped until the next sync.
- `revision` and the document ID contain an unsalted SHA-256 digest of
  `[index, name, user, swipe, text, time]`. That is not raw text, but a very
  short, guessable message could be confirmed by brute force. Accept this for
  the first version and say so in the docs. A keyed digest would need a local
  secret, which breaks on another browser or device.
- Search reads only the open chat's branch, and checkpoint branches carry their
  history in the open chat file, so no other chat file needs to be loaded.
- The token budget, packing and prompt delivery are unchanged.

### Failure behaviour

- Embedding failures during generation stop generation explicitly, like any
  other memory preparation failure. Disabling memory restores native history.
- Embedding failures during sync leave the journal intact for retry, as LambdaDB
  write failures do today.

### CORS

These preflights were checked on 2026-11-10:

- Ollama 0.40.15's default origins allow `http://localhost:*` and
  `http://127.0.0.1:*` (204), and reject LAN IP and remote origins (403). Users
  who open SillyTavern from another device must set `OLLAMA_ORIGINS`; the setup
  hint says so in one line.
- `api.openai.com/v1/embeddings` allows arbitrary origins and the
  `authorization` header.
- A provider that blocks browser CORS is unsupported; the endpoint check
  reports a network error.

## Implementation plan

Each step lists its verification.

1. **Vector rounding check** (local, $0):
   - Method: round the stored K (OpenAI small), Q3 and G vectors from the
     experiment evidence, then rerun local exact KNN on the 500 questions.
   - Accept rounding if top-50 overlap is at least 0.99 and delivered-complete
     coverage is within 0.2 points.
   - Record the result in this document.
2. **Embedding client** (`src/embedding.js`): request building, response
   validation, prefixes and compact serialization.
   - Verify with unit tests using a fake fetch for success, malformed responses,
     dimension change and the CORS/network error path.
3. **Credential record**: an embedding key store mirroring `SavedKey`.
   - Verify with unit tests for scope match and mismatch, replace, forget and
     storage failure.
4. **Schema, tags and mismatch guard** in `src/client.js` and
   `src/chat-collections.js`.
   - Verify with unit tests for schema shape, tag round-trip, and blocking on
     model, prefix or dimension mismatch.
5. **Write path**: embed before upsert, omit `text`, keep batches and journal.
   - Verify with unit tests on prepared documents; the existing sync tests must
     still pass.
6. **Search and restoration**: dense `queryVector` search and revision-checked
   local restoration.
   - Verify with unit tests for restoration, stale-revision drop and the
     message boundary.
7. **Settings UI**: mode toggle, endpoint, model preset or custom, prefixes,
   key, **Test endpoint**, mismatch and rebuild notice, and setup hints.
8. **Live check**: a real Chromium session against SillyTavern, local Ollama and
   a temporary LambdaDB collection.
   - Steps: create, sync, edit, delete, search, rebuild and cleanup.
   - Verify that no `text` field reaches LambdaDB by inspecting the request
     bodies.
9. **Docs**: update architecture, contracts, direct-cors, saved-connection and
   setup docs, and AGENTS.md (credential rule).
