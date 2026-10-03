# Direct browser CORS transport

## Decision and acceptance boundary

Replace the built-in SillyTavern proxy with browser-to-LambdaDB HTTPS requests.
LambdaDB now supports CORS for the configured test environment. This removes
SillyMemory's `enableCorsProxy` configuration/restart requirement and stops
routing memory text/query requests and the project key through the host server.
The UI-extension design, managed embeddings, scope filters, consistent reads,
chat reconciliation and session-only key handling remain unchanged.

This is a transport change, not a retrieval or answer-quality change. Acceptance
requires unit contract checks, actual pinned-host browser/fault/prompt tests with
local CORS emulation, and the shipped extension's bounded live collection lifecycle
with the host proxy disabled. Use synthetic chats, at most four owned collections
for the live lifecycle and no generation-provider calls. Retain failures and
confirm owned cleanup; stop after these checks pass. Historical proxy evidence
remains historical and is not relabeled as direct-CORS validation.

## Configuration and security boundary

The LambdaDB regional HTTPS origin must be reachable from the user's browser,
not only from the SillyTavern server. Configure CORS access for the SillyTavern page
origin where required. The origin includes scheme, hostname and port: for example,
`http://localhost:8000` differs from `http://127.0.0.1:8000` and from an HTTPS
remote-host URL. The extension cannot configure LambdaDB CORS on the user's behalf.
The synthetic transport button validates create/upsert/query/delete from that
browser. A deployment announcement alone does not establish that a given endpoint
and page origin work together.

Requests use `mode: cors`, `credentials: omit` and `redirect: error`. Only
`Content-Type` and `x-api-key` application headers are sent. The browser supplies
Origin/preflight headers. SillyTavern cookies and CSRF tokens are never forwarded;
normal same-origin host calls for chat/settings/tokenizers keep their existing
host authentication. No proxy fallback or persistent-key option is added.

Browsers deliberately hide the distinction between many network, TLS and CORS
failures. The extension reports a safe network error with endpoint/network/CORS
configuration guidance, not a fabricated HTTP status. A blocked response cannot
confirm collection deletion. Uncertain writes and failed cleanup keep their
existing recovery records. Real HTTP 401/403/404 responses retain their status
when CORS allows the browser to read them. Redirects cannot forward the key to
another endpoint. Extension logs/errors never include raw server response bodies.

Reload clears the key and disables memory. Other trusted extensions running in
the same browser origin can still inspect requests; session-only storage does not
isolate the key from malicious same-origin code. Existing SillyTavern proxy use by
other extensions is outside this change; do not disable a shared host setting
without checking their requirements.

## Release relationship

PR #47 records the previous proxy-based 0.2.0 installation/upgrade acceptance.
Those results remain valid for that tested commit, not for this new transport.
Review this change separately, then reconcile the final release notes and run the
Git URL upgrade acceptance on the combined release tree before main promotion.
Neither PR preparation authorizes main promotion, a tag or a Release.

## Results

Pending the bounded checks above. Detailed runs remain ignored local artifacts;
completed results and checksums will be recorded here before opening the PR.
