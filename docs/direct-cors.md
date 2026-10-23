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

## Verification

The current browser harness uses real Chromium and a local HTTPS LambdaDB
emulator with browser CORS enforcement and the host proxy disabled. The separate
live collection lifecycle uses synthetic data against LambdaDB; emulator results
do not establish a region's live availability or performance. Run only the
appropriate [development checks](development.md) within an authorized live scope.

[Original transport acceptance and release receipts](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/direct-cors.md)
retain the old session-only key policy and measured conditions. They do not
replace the current saved-key contract. See [evidence recovery](evidence-retention.md).
