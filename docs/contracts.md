# Pinned integration contracts

Source inspection and unit/emulator checks are distinct from live service
validation. Use [development](development.md) for the current verification paths.

## SillyTavern

Supported baseline: version **1.19.0**, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.

- [Extension loader and interceptor dispatcher](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions.js): manifest `js`, `css`, `minimum_client_version`, and `generate_interceptor`; awaited interceptor signature `(chat, contextSize, abort, type)`.
- [Context](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/st-context.js): `eventTypes`, `eventSource`, `chat`, `characters`, `characterId`, `getCurrentChatId`, `getRequestHeaders`, `getTokenCountAsync`, `setExtensionPrompt`, and template rendering.
- [Prompt construction](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js): creates a prompt-specific `coreChat` array with `index`, applies interceptors before prompt assembly, bypasses them in dry runs. The current adapter replaces eligible older entries with one new quoted archive object (`is_user: true`, `is_system: false`, `name: context().name1`), inserted at the latest selected source index. The archive starts with `[Recalled conversation excerpts]`; each embedded excerpt preserves its original role/speaker, message/passage coordinates and available sent-time label. Those source roles are provenance inside quoted text, not separate API message roles. Recent dialogue and special messages keep their native order/roles, and shared source message objects are not mutated. Final delivery verifies the complete archive in its user carrier role; see [the delivery contract](prompt-delivery.md#contract-and-limits). `setOpenAIMessages` in [openai.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/openai.js) maps `is_user` to the native user/assistant API role. World Info scanning follows the interceptor and can inspect the replaced history; interoperability is unverified. First initialization uses its awaited `saveSettings()` and verifies `/api/settings/get` before allowing remote collection creation, so an immediate reload cannot lose the new installation identity.
- [Events](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/events.js): changes invalidate results immediately, reconciliation is debounced. `MESSAGE_UPDATED` covers the post-edit text update; `GENERATION_ENDED` also catches final streaming content.
- [Official extension guide](https://docs.sillytavern.app/for-contributors/writing-extensions/) and [configuration reference](https://docs.sillytavern.app/administration/config-yaml/#cors-proxy-configuration) were reopened. Current online docs may advance beyond the pinned host.

## LambdaDB

The browser bundle is built from the exact SDK lock in `package-lock.json`.
The current pin is `0.8.1-dev.38730896042001`, supporting 200 rerank candidates.
`npm run check:sdk` verifies that the shipped bundle matches that lock.

| Operation | Contract used |
| --- | --- |
| Endpoint and authentication | Regional HTTPS origin + `/projects/{project}`, with `x-api-key` |
| Connection check | Authenticated list of one collection before adopting a saved/restored key; no collection creation or inference |
| Storage | Owned collection per story; separate `chat_<ID>` branch per writable chat |
| Embeddings | Native `text-embedding-3-small` from verbatim `text`; English lexical analyzer |
| Writes | Explicit selected branch; source documents carry owner, story scope, revision and source coordinates |
| Search | Bayesian vector/lexical fusion, k200, owner/scope/message-boundary filters, consistent reads |
| Reranking | Native Jev 1.13.0, 200 candidates, 50 returned; confirmed provider/model/status required |
| Results | Inline `docs[].doc`; external download responses fail closed without forwarding credentials |
| Ownership and cleanup | Validate application, owner and story tags before mutation; verify branch deletion or collection HTTP 404 |

Runtime search uses role/date/text reranking fields; the published LongMemEval
profile fixes text-only fields. Preserve that disclosed difference. Generic
transport tests and standalone benchmarks can use `main`; product memory uses
the selected chat branch. See [current defaults](conversation-memory-defaults.md),
[storage](versioned-memory.md) and [native workflows](native-chat-workflow.md).

## Browser transport and credentials

Memory requests use direct browser HTTPS/CORS with `credentials: omit`,
`redirect: error`, and no SillyTavern cookies or CSRF headers. Host chat/settings
requests remain same-origin. There is no server plugin or proxy fallback.
Validated credentials are saved only in the dedicated browser record scoped to
the native account and exact endpoint/project; see [saved connections](saved-connection.md)
and [direct CORS](direct-cors.md). Keys never belong in ordinary settings,
reports or source control.

## Historical contracts

The [original proxy and storage inspection](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/contracts.md)
remains at its producing revision. It is not an alternative transport or storage
mode supported by current code.
