# Text-private memory mode

Status: implemented on `feat/text-private-mode` (plan steps 1–9); not yet merged
or released. See [implementation notes](#implementation-notes) for deviations
and [validation](#validation) for what was checked.
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
- `embedding`, the first 16 hex characters of SHA-256 over the JSON array
  `[model, queryPrefix, documentPrefix, dimensions]`

The design first named four tags (`embedding_model`, `embedding_prefix`,
`embedding_dimensions` next to `memory_mode`). The pinned SDK allows at most
five tags per collection and rejects `:`, `#` and `,` in tag values, so
`qwen3-embedding:0.6b` cannot be a tag value and seven tags cannot be sent. One
digest keeps the same guard within those rules.

Before every sync or search, compare these tags with the current settings. On
mismatch, stop with an explicit error and offer **Rebuild story**. The existing
rebuild flow (#141) re-embeds every chunk from the open chat.

A story created in the default mode keeps it after the global setting changes.
Opening it under the other mode shows the same rebuild offer. A default-mode
story has no `memory_mode` tag.

### Write path

- Chunking, document IDs, revisions, the sync journal and the 200-document
  batches stay unchanged.
- For each new or changed chunk, embed the document prefix plus the chunk text,
  then upsert the vector and metadata without `text`.
- Edits, swipes and deletions keep using the existing event-driven sync.
  Revisions change, stale documents are deleted, and new ones are embedded.
- Upload size is billed by the request body bytes (`requestBodySize` in
  LambdaDB `DocumentMutationService`). Serialize every vector component rounded
  to 4 decimal places (`Math.round(x * 1e4) / 1e4`).
  - This takes about 7.4 JSON characters per component, against about 16.7 in
    the experiment's client JSON.
  - A 1536-dimension chunk drops from about 25.7 KB to about 11.4 KB, so the
    upload is about 9× the raw text rather than 19×. A 768-dimension model
    halves that again.
  - Accepted by the check below.

#### Rounding check (2026-11-10)

Method: the stored experiment vectors were rounded to 4 decimal places
(maximum absolute error 5e-5), and local exact KNN was rerun on all 500
LongMemEval-S questions. Queries were not rounded, as in the product.

| Arm | Top-10 overlap | Top-50 overlap | Delivered-complete, rounded vs original | Questions whose delivered coverage changed |
|---|---:|---:|---:|---:|
| K, OpenAI small (vs live LambdaDB results) | 1.000 | 0.9998 | 95.30% vs 95.30% | 0 |
| Q3, `qwen3-embedding:0.6b` | 1.000 | 0.9995 | 95.64% vs 95.64% | 0 |
| G, `embeddinggemma` | 0.9998 | 0.9998 | 95.41% vs 95.41% | 0 |

The acceptance bar, set before the run, was top-50 overlap ≥ 0.99 and
delivered-complete within 0.2 points. All three arms pass. Only near-tied
neighbours swap order: 333–341 of 500 questions keep an identical top-50 order.

Evidence (local, ignored, with SHA256SUMS):
`artifacts/text-private-retrieval-v1/rounding-4dp/`.

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
  `http://127.0.0.1:*` (204), and reject LAN IP and remote origins (403).
  - Same-computer use needs no setup.
  - Opening SillyTavern from another device needs three things: the Ollama
    computer's LAN endpoint, `OLLAMA_HOST=0.0.0.0` and `OLLAMA_ORIGINS`. The
    setup hint points to the setup guide.
  - Other UI-only memory extensions (Smart Memory, OpenVault,
    SillyTavern-VectorMemory) call Ollama from the browser with the same limits.
    Only VectFox's optional Similharity server plugin and SillyTavern's built-in
    Vector Storage relay through the server.
- `api.openai.com/v1/embeddings` allows arbitrary origins and the
  `authorization` header.
- A provider that blocks browser CORS is unsupported; the endpoint check
  reports a network error.

## Implementation plan

Each step lists its verification.

1. **Vector rounding check**: done; see the rounding check above.
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

## Implementation notes

Code: `src/embedding.js` (client, presets, identity), `EmbeddingKey` in
`src/credentials.js`, `textPrivateSchema`/`searchVector` in `src/client.js`,
`checkStoryMode` in `src/chat-collections.js`, the optional `embedder` of
`MemoryEngine` in `src/memory.js`, and the settings section in `settings.html`
and `index.js`.

Choices made where the design was silent, and deviations:

- **Identity tags**: one `embedding` digest instead of three tags; see
  [collection schema and identity](#collection-schema-and-identity). The base
  URL is not part of the identity, as designed: the same model served
  elsewhere keeps the story.
- **Normalization**: vectors are L2-normalized before 4-decimal rounding. The
  rounding check measured normalized experiment vectors (the harness normalized
  Ollama output), and cosine ranking does not depend on scale, so this keeps the
  accepted error bound for endpoints that return unnormalized vectors.
- **Request shape**: `{ model, input, encoding_format: 'float' }`, as in the
  harness, with at most 32 inputs per request inside each 200-document upsert
  batch and a 120-second timeout per request.
- **Test endpoint is required.** The tested dimension is stored with the
  endpoint settings; without it, text-private sync and generation stop with
  an explicit error. Form edits are drafts until a test succeeds. A keyless
  test for a different base URL or model removes the older key record.
- **Errors**: embedding failures use status 0 and code `embedding`, so a 401
  from an embedding provider never triggers the LambdaDB key removal path.
  Response bodies are never shown.
- **Query size**: the 8 KiB limit is a LambdaDB `queryText` and rerank limit and
  is not applied to the text-private query, which goes to the embedding
  endpoint. An endpoint that truncates long inputs (Ollama does by default) does
  so silently; that is a known limitation, not a detected condition.
- **Mismatch display**: the failure status explains the mismatch and the chat
  panel shows **Rebuild story memory**. The rebuild confirmation names the
  current mode. Text search languages are hidden in this mode; a text-private
  story has no text field or analyzers.
- **Setup test**: the LambdaDB connection test is unchanged. It still uses
  synthetic text with managed embedding and reranking; no chat text is sent.
- **Revision digest**: `revision` and the document ID contain an unsalted
  SHA-256 digest of the source message, as described under
  [search and restoration](#search-and-restoration). A very short, guessable
  message can be confirmed by brute force; this first version accepts that.
- Speaker names, roles, message positions and conversation-time metadata are
  stored as in the default mode.

## Validation

Unit, browser-emulator and live results are separate. All were run on
2026-11-10 at the implementation commits on `feat/text-private-mode`.

- `npm test`: the full suite passes, with focused tests for the embedding
  client (fake fetch: request shape, prefixes, malformed responses, dimension
  change, CORS/network, timeout and cancellation), the key record, schema and
  identity tags, the mismatch guard, the write path and journal retention, dense
  search and text-free restoration. `npm run check`, `npm run check:sdk`, `npm
  run check:release` and the benchmark protocol tests pass.
- Source inspection: default-mode create, branch, list, fetch, upsert and query
  request bodies from the base revision `d5c6ffd` and this branch were compared
  byte for byte on a synthetic chat; they are identical.
- `npm run test:browser` (pinned SillyTavern, real Chromium, local HTTPS
  emulator): all default-mode checks pass with the new settings section present.
  The emulator has no text-private coverage.
- `npm run test:text-private:live` (pinned SillyTavern 1.19.0, real Chromium,
  live LambdaDB, local Ollama 0.40.15, deterministic model fixture): 24 checks
  pass. `embeddinggemma` stories are created, synchronized, edited, deleted and
  searched; turning the mode off and changing the model to
  `qwen3-embedding:0.6b` each stop the story with the rebuild offer and stop
  generation; **Rebuild story memory** recreates a 1,024-dimension story that
  searches correctly. No LambdaDB request body after enabling the mode
  contained a `text` field, `queryText`, rerank or any seeded chat phrase, and
  no LambdaDB or embedding request carried host cookies or CSRF headers. Every
  created collection answered HTTP 404 after cleanup. Evidence, local and
  ignored, with SHA256SUMS: `artifacts/text-private-mode-v1/`.

Not checked: the OpenAI preset against the live OpenAI API (no paid embedding
call was made; its CORS preflight was checked as recorded above), LM Studio and
llama.cpp, opening SillyTavern from another device with `OLLAMA_ORIGINS`,
browsers other than Chromium, group chats and native branches in this mode
(only the text-free fork wait is unit-tested), and answer quality beyond the recorded
English LongMemEval-S retrieval evidence. No multilingual quality claim is made.
