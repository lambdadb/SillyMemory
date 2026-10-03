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
PR #47 has been merged into develop and integrated here. The release notes and
optional upgrade runner now cover the legacy proxy and new direct paths together.
See the combined acceptance below before main promotion.
Neither PR preparation authorizes main promotion, a tag or a Release.

## Results

Completed on 2026-10-03 with the shipped runtime at
`e99aa66b7509b75c09c4096d3b03deea7065f3e8` and pinned SillyTavern
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`:

| Boundary | Result |
| --- | --- |
| Unit regressions | 326 passed; direct URL, key-only application headers, omitted credentials, redirect rejection, error status and cleanup safety contracts. |
| Syntax / release metadata | All runtime, script and test syntax passed; 0.2.0 remains Unreleased. |
| Actual host + Chromium + local HTTPS CORS emulator | 29 checks passed, 96 real preflights, zero proxy requests and no remaining collections. Missing CORS permission blocks the request and retains pending cleanup; auth errors stay readable. |
| Actual host + local emulator, injected faults/races | 69 checks passed, 255 preflights, zero proxy requests and no remaining collections. Covers timeout, 429/503, edits/deletes/branches during retrieval, uncertain writes/reload and deletion ordering. |
| Actual host prompt dispatch + local service fixtures | 11 delivery cases and repeated-passage packing passed. No live generation provider. |
| Actual settings UI + live LambdaDB managed embeddings | 14 checks passed: unchanged sync, rename, branch/copy isolation, edit reconciliation, queryText, individual deletion, reload/key entry, discovery after registry loss and all-owned cleanup. Four bounded collections; zero proxy requests. |
| Actual Git URL install/update UI | 21 checks passed with host proxy disabled: public 0.1.0 → candidate, settings/key handling, direct-CORS guidance, tag rollback and return. No remote memory or model calls in this run. |

The installation run pulled the published candidate branch into a disposable
clone whose starting tree matched public main (`b55b78f28feb769683da723206bf3b37c83ec04b`).
Public main was not changed. Code rollback does not reverse remote writes or
prove that 0.1.0 can manage newer per-chat collections.

The browser emulator test uses normal browser networking, with no Playwright
request routing, to observe real preflights and missing-header rejection. Local
fixtures trust their disposable self-signed certificate only; live runs retain
normal TLS verification. The live collection runner intercepts requests only to
record/bound creation before forwarding; the extension itself uses its shipped
client, not a test transport adapter. Its recall check invokes the interceptor
with a synthetic final event; complete host prompt dispatch is the separate
local-fixture row above. Local fault injection is not a live service outage.

Two initial local harness attempts needed correction: installing a Playwright
route interfered with the intended preflight-negative probe, and the delivery
harness still blocked the new remote origin. The final normal browser test uses
unintercepted networking; other harness allowlists admit only their configured
LambdaDB origin. These were harness failures, not product-quality measurements.

No new paid answer-quality benchmark was run. Other maintained evaluation
runners received mechanical URL/CORS-fixture updates and passed syntax/unit
checks; their paid experiment modes were not rerun. Historical results keep
their original proxy/runtime attribution. Group chats, multi-device writers,
other browsers, remote HTTPS page origins, production outages and all regional
CORS deployments are not newly certified by this bounded localhost acceptance.

All reported producer hashes were compared with the original candidate files.
Those results describe that reviewed candidate. The combined acceptance below
records the later integration and review corrections. Exact reports, available
failed-attempt outputs and producer sources were archived and read back byte-for-byte:

- Local archive: `artifacts/archive/direct-cors-v1/evidence.tar.gz`
  (137 members; 1,495,402 bytes), SHA-256
  `2f6a35c77c449de1421ca1ebda9396e4f4a7a71f6d6a7e5a0baff1027a3f99af`.
- Manifest: `artifacts/archive/direct-cors-v1/manifest.json`, SHA-256
  `1d4f0dd5bfd1c53885d3a221b2d91da83cd27139d428e089db7e640f94a4977c`.

These files are local-only in the `sillymemory-direct-cors` worktree, ignored by
Git and unavailable in a fresh clone. No pending live cleanup record remains.

## Combined upgrade acceptance

The integrated runner indexes synthetic history with published 0.1.0 using its
required proxy, updates through the real Git UI, restarts the isolated host with
the proxy disabled, then exercises new direct-CORS memory and cleanup. Collection
intent is recorded before both proxy and direct creation, with a shared limit of
four owned collections. No generation provider is called. The restart proves
independence from the proxy; users need only reload the extension after updating.

The review also corrected the generation runner's route glob to use the canonical
endpoint origin (including when configuration has a trailing slash), and removed
a stale settings disclosure claiming that memory requests pass through the host.
These preserve the existing direct client and memory semantics.

Completed on 2026-10-03 at integrated candidate
`4f2e6f50d213df0cf8df68b18a24dfe75d8a2847`, with the same pinned host above.
Both runs installed public main at `b55b78f28feb769683da723206bf3b37c83ec04b`
and pulled the candidate through the real update UI. The disposable common-ancestor
setup and code-rollback limitations described above still apply.

| Boundary | Result |
| --- | --- |
| Unit / syntax / release metadata | 326 tests passed; all runtime, script and test syntax passed; 0.2.0 remains Unreleased. CI passed on Node.js 20.12.0 and 24. |
| Actual Git URL install/update/rollback, no remote memory calls | 21 checks passed; candidate version 0.2.0 displayed and session-key clearing verified. |
| Same installation path + live LambdaDB managed embeddings | 37 checks passed. Legacy phase: 14 proxy requests; candidate phase: 60 direct requests and zero proxy requests. |
| Ownership and cleanup | Four collections total, two created through each transport. Legacy documents preserved on upgrade; isolated parent/branch sync, edit, retrieval and deletion passed. All four collections confirmed absent; no pending cleanup record remains and both disposable profiles were removed. |

The live run also verified key absence from persisted browser and host settings,
reload/key re-entry without a fifth collection, and cleanup of legacy shared and
new per-chat memory before code rollback. No uncaught page errors occurred.
No generation-model call was made. The paid generation runner's canonical-origin
correction was inspected and syntax-checked; its paid modes were not rerun.
The earlier emulator/fault/prompt-dispatch runs retain their original producer
attribution and were not repeated for this integration. The client, memory engine
and prompt semantics did not change during integration.

Detailed reports, the inspected non-live extension-manager screenshot, unit log
and exact producing sources were archived and read back byte-for-byte:

- Local archive: `artifacts/archive/direct-cors-integrated-v1/evidence.tar.gz`
  (253 members; 820,568 bytes), SHA-256
  `a2e6188cd41185573b9790d588d9583367a1ce1050a3f4aacb73089069ce0897`.
- Manifest: `artifacts/archive/direct-cors-integrated-v1/manifest.json`, SHA-256
  `4f864a3d5c5a9c11c1726adfba395e0d00794dfbecc5e01164eeddc8596e5a9c`.

This second archive is also local-only in the `sillymemory-direct-cors` worktree
and unavailable in a fresh clone. Tracked files and decompressed archive contents
passed a scan for configured credentials. Only documentation follows the tested
integrated commit. This completes develop integration acceptance; main promotion,
a tag and Release publication remain separate steps.
