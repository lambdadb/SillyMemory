# Pinned integration contracts

Reviewed on 2026-09-27. Source inspection is not a live LambdaDB integration test.

## SillyTavern

Supported baseline: version **1.19.0**, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`.

- [Extension loader and interceptor dispatcher](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/extensions.js): manifest `js`, `css`, `minimum_client_version`, and `generate_interceptor`; awaited interceptor signature `(chat, contextSize, abort, type)`.
- [Context](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/st-context.js): `eventTypes`, `eventSource`, `chat`, `characters`, `characterId`, `getCurrentChatId`, `getRequestHeaders`, `getTokenCountAsync`, `setExtensionPrompt`, and template rendering.
- [Prompt construction](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/script.js): creates a prompt-specific `coreChat` array with `index`, applies interceptors before prompt assembly, bypasses them in dry runs. The adapter replaces eligible older entries with new excerpt objects carrying the source `is_user`, `name` and `index`; it avoids mutating shared message objects. `setOpenAIMessages` in [openai.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/openai.js) maps `is_user` to the native user/assistant API role. World Info scanning follows the interceptor and can inspect the replaced history; interoperability is unverified. First initialization uses its awaited `saveSettings()` and verifies `/api/settings/get` before allowing remote collection creation, so an immediate reload cannot lose the new installation identity.
- [Events](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts/events.js): changes invalidate results immediately, reconciliation is debounced. `MESSAGE_UPDATED` covers the post-edit text update; `GENERATION_ENDED` also catches final streaming content.
- [Proxy middleware](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/middleware/corsProxy.js) and [server route](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/server-main.js): `/proxy/:url(*)`, enabled with `enableCorsProxy`; preserves methods and `x-api-key`, serializes JSON bodies for POST/PUT/PATCH, strips cookies/origin/CSRF before forwarding. Document deletion therefore uses POST `/docs/delete`, not a DELETE request body. Disabled proxy returns 404. The shared response forwarder rewrites upstream 401 to `400 Unauthorized`; the client normalizes that to an authentication error without logging the response body.
- [Official extension guide](https://docs.sillytavern.app/for-contributors/writing-extensions/) and [configuration reference](https://docs.sillytavern.app/administration/config-yaml/#cors-proxy-configuration) were reopened. Current online docs may advance beyond the pinned host.

## LambdaDB

The official [managed embedding guide](https://docs.lambdadb.ai/guides/collections/managed-embeddings) and [quickstart](https://docs.lambdadb.ai/guides/get-started/quickstart) were reopened. Request/response details were also inspected in the local docs OpenAPI at docs revision `c9bf7d49de6565e15f06fe6491189cab0c00b228` and generated TypeScript client revision `b516aac7b449830e9c3247eea12b31130a889d85`. These are contract evidence, not proof of the endpoint's deployed version.

| Operation | Contract used |
| --- | --- |
| Endpoint | User-supplied regional HTTPS origin + `/projects/{project}` |
| Authentication | `x-api-key` request header |
| Create | POST `/collections`, managed `embedding` with `sourceField: text`; text uses English and Korean analyzers |
| Upsert | POST `/collections/{name}/docs/upsert`, `{docs, branch: "main"}`; no bulk import |
| Query | POST `/collections/{name}/query`, `knn.queryText`, `knn.filter.queryString`, `consistentRead: true`, `ref: {kind: "branch", name: "main"}` |
| Result | `docs[].doc`; external `docsUrl` responses fail closed without forwarding credentials |
| Document delete | POST `/collections/{name}/docs/delete`, `{ids, branch: "main"}` |
| Ownership | GET collection metadata; match `tags.application` and `tags.owner` |
| Collection delete | DELETE collection, then poll GET for 404 |

The 2026-09-27 live proxy test subsequently confirmed authenticated creation/upsert, managed query-text visibility, scope filtering, edit/swipe/deletion reconciliation, invalid-key rejection, and owned collection cleanup in the supplied project. This does not establish all error paths, load behavior, or service performance. The emulator and live evidence remain separate in the validation record.

## Current transport supersedes the original proxy contract

The proxy source inspection above describes the initial 0.1.0 design. The current
development client uses direct HTTPS/CORS with credentials omitted and redirects
rejected; it does not call `/proxy/` or use host CSRF headers. Host chat/settings
requests remain same-origin. See [direct CORS](direct-cors.md) for configuration,
error/cleanup semantics and separately labeled live evidence.
