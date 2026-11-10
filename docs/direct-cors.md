# Direct browser CORS transport

SillyMemory sends memory text, queries and its project key directly from the
browser to the configured LambdaDB regional HTTPS origin. It uses no SillyTavern
proxy, server plugin or host restart. Same-origin host calls for chat files,
settings and tokenization retain the host's normal authentication.

## Request and failure boundary

Memory requests use `mode: cors`, `credentials: omit` and `redirect: error`.
Only `Content-Type` and `x-api-key` application headers are supplied; the browser
handles Origin/preflight headers. SillyTavern cookies and CSRF headers are never
forwarded. There is no proxy fallback. Validated keys are saved only in the
scoped [browser credential record](saved-connection.md).

The regional origin must be reachable from the user's browser. Normal setup
includes no manual origin-allowlist step. Browsers can conceal differences among
network, TLS and CORS failures, so the extension reports a safe network error
rather than inventing an HTTP status. An ambiguous write remains in the durable
synchronization/ownership records for verified recovery; failed cleanup records
must not be discarded.

## Private memory embedding requests

[Private memory](private-memory.md) adds direct requests from the browser
to the user's embedding endpoint with the same `mode: cors`,
`credentials: omit` and `redirect: error`. They send only `Content-Type` and,
when a key is set, `Authorization: Bearer`; never SillyTavern cookies or CSRF
headers, and there is no proxy fallback. Ollama's default origins allow
`http://localhost:*` and `http://127.0.0.1:*`, so a browser on the Ollama
computer needs no setup. Opening SillyTavern from another device needs the
Ollama setup in [setup and recovery](setup-and-recovery.md#private-memory).
There is no SillyTavern proxy or server plugin, the same as other UI-only memory
extensions; only SillyTavern's built-in Vector Storage avoids this, because its
server calls the provider. A provider that blocks
browser CORS is unsupported, and **Test and save** reports a network error.
In this mode chat text is not sent to or stored in LambdaDB.

## Verification

The current browser harness uses real Chromium and a local HTTPS LambdaDB
emulator with browser CORS enforcement and the host proxy disabled. The separate
live collection lifecycle uses synthetic data against LambdaDB; emulator results
do not establish a region's live availability or performance. Run only the
appropriate [development checks](development.md) within an authorized live scope.

[Original transport acceptance and release receipts](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/direct-cors.md)
retain the old session-only key policy and measured conditions. They do not
replace the current saved-key contract. See [evidence recovery](evidence-retention.md).
