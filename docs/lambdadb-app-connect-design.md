# LambdaDB app connection workflow

Status: Design draft, not implemented or deployed.

Date: 2026-11-02

First integration: SillyMemory

Work branch: `feat/lambdadb-connect`, based on SillyMemory `adcd722`.

## Purpose and scope

Help someone interested in an application reach its first useful operation without
learning LambdaDB administration or copying an endpoint, project name and API key
between screens. SillyMemory is the first client of a reusable LambdaDB connection
workflow, rather than the reason to build a separate authentication system.

Console owns signup/login, connection approval, Organization resolution, and
project selection or creation. Backend owns the request lifecycle, authorization,
provisioning and credential delivery. The originating application initiates the
flow, receives the result, verifies and saves its connection, and handles its own
data lifecycle. Users do not install the CLI or MCP to connect an application.

This document is the shared design reference for this work. Existing documents
describe current behavior unless explicitly marked otherwise. References to CLI
implementation are reuse opportunities, not instructions to change CLI behavior.
Do not duplicate this document as independently editable plans in other repos.

The [implementation contract](lambdadb-app-connect-contract.md) records proposed
routes, recovery rules, activation reset and the prepared worktrees. It is not
evidence that the runtime implementation or validation is complete.

## Decisions from the discussion

| Topic | Direction |
| --- | --- |
| Connection UI | A common Console flow, with the requesting application's identity displayed. No SillyMemory-only approval page. |
| Project setup | Complete it in Console, not in ST or another client. |
| Approval | Keep an explicit approval screen after project selection/creation, showing the app, selected project and actual permissions. |
| New project name | Prefill a generated name; make region the normal required choice. Optional name editing can remain secondary. |
| Organization | Reuse existing default-Org and invitation handling. Show the destination; only require selection when a real choice is needed. |
| Credential returned to an app | Selected-project connection information, not an account management session, Console JWT or refresh token. |
| Available region | Provision, verify readiness and complete connection with bounded waiting. |
| Unopened region | Reuse the existing `CREATING` project, quota and background provisioning/email workflow. End this connection attempt as `region_requested`; the app does not poll for the region to open. |
| Return from Console | Best-effort navigation convenience. Result delivery must not depend on Close, Return to app, window focus or popup access. |
| SillyMemory project changes | No Change project button, live switching or data migration in this version. Preserve the cleanup prerequisite. |
| Retry | Reuse a saved project key when available; otherwise restart Connect and select the existing project. Handle prior key issuance internally without duplicating projects. |
| Memory activation | Setup does not upload chats. Bulk deletion must prevent old ON preferences from silently restarting uploads after setup/reconnection. |
| Browser scope | Preserve the supported single-browser model. No new guarantee for concurrent browsers or devices. |
| CLI compatibility | Preserve browser approval followed by terminal project management and the separate account-session contract. |

The earlier suggestions to move project creation into ST, add active project
switching, or require users to turn off every saved chat before bulk deletion are
not the selected implementation direction. Bulk-reset mechanics remain a design
gate below; do not mistake a candidate mechanism for an approved implementation.

## User experience

### Start and authenticate

1. In the originating app, select **Connect to LambdaDB**.
2. Open a Console tab or popup while retaining the app's page and bounded result
   polling. If opening is blocked, offer the same verification link explicitly.
3. Reuse the existing Console login when valid, otherwise complete signup/login.
   Preserve the connection continuation through verification and invitations;
   optional surveys must not interrupt it.
4. Show **Connect to LambdaDB**, the requesting app and signed-in account, then
   continue to project selection/creation and the explicit approval screen below.

Do not claim that an app is verified merely because a caller supplies its name.
Use a server-controlled client identifier/display-name mapping for initial
integrations. A self-service application registration product is outside scope.
CLI approval retains its account-management permissions; app approval describes
the selected project's existing key permissions, including writes and deletion.

### Select or create a project

- Existing users can choose an accessible, ready project. Display its Organization
  and region to avoid selecting an unintended target. Existing role/key-issuance
  restrictions and key limits apply. Show pending projects as unavailable for
  connection; do not hide them and encourage duplicate creation.
- With no existing project, show creation directly. Generate a valid name such as
  `sillymemory-<random-suffix>` using the registered app's safe slug. Use a bounded
  random suffix and authoritative uniqueness handling, not a promise of uniqueness.
- Keep the generated name stable through login, retries and region selection.
  On a confirmed name collision, generate another candidate and let the user
  submit it. Never treat an uncertain creation result as a name collision.
- Let the user choose a region. Do not require them to invent an Organization
  name or API key name. Show the destination Organization without an extra picker
  when there is only one valid destination.
- Submit **Create project** for an available region, or select an existing project.
  Creating a project does not yet authorize issuing its key to the app. Opening
  or logging in alone creates no Organization, project or key.
- Enforce actual server project quotas and membership. At quota, offer existing
  eligible projects and an explanation; do not activate billing automatically.

### Explicit approval and connection completion

After an explicit creation request, wait for the existing project's readiness
within a bounded deadline. Creation acceptance is not readiness. Do not issue a
key or claim connection success while the project is still provisioning.

For a ready project, show a distinct approval screen with the requesting app,
signed-in account, Organization, project, region and actual project-key permissions.
The user selects **Approve connection** or **Cancel**. Do not replace approval with
an implicit consequence of project selection. A newly created project remains if
approval is canceled; a later Connect can select it without creating another one.
An unopened-region request ends before this approval step; approval occurs only
when the user later returns to connect the ready project.

After authorized credential delivery, the app verifies the exact endpoint/project
and saves the connection. In SillyMemory, reuse the existing synthetic preparation
and cleanup flow with its usage disclosure. Distinguish **Connected** from
**Memory ready** and from chat-level activation. The user explicitly turns memory
on in a supported chat; setup alone sends no chat transcript.

Console must not claim that app-local verification or persistence succeeded merely
because credentials were delivered. Unless the app acknowledges successful local
setup, use completion copy such as **Connection details sent. Return to your app
to finish setup.** The app displays its own verified outcome.

### Unopened regions: a completed request, not a connection

Show unopened regions as requestable, distinct from available regions. The submit
action is **Request this region**, with an explanation that it cannot connect now.
Reuse the existing Backend path: create a logical project in `CREATING`, count it
against the Organization's project limit, and provision it when its region opens.
Explain the project-slot effect before submission. Do not introduce a separate
quota-free request system or silently delete a pending project to free a slot.

Once Backend confirms acceptance:

1. Persist `region_requested`, including the existing project's non-secret identity,
   as this connection attempt's terminal result.
2. The app receives that result through polling, stops waiting, and displays
   **Region requested. Not connected yet.** No project credential is returned.
3. Console displays the copy below with one primary **Return to app** action.

> **Region requested**
>
> This region isn't available yet. Your request has been received, but your app
> is not connected.

Do not offer a second project-selection path within this completed attempt, claim
that the project is ready, or keep polling for regional availability. Another
attempt starts from Connect in the originating app. Do not promise notification
delivery or a region-opening date. Preserve Backend's existing background job,
which provisions the project, commits `READY`, then attempts email to active
Organization owners. Email failure does not undo readiness and must not prevent
connection. App polling ends at request acceptance; Backend provisioning continues
independently.

After the readiness email, the user starts Connect again and selects the existing
project, then explicitly approves connection. A retry before readiness shows that
project as pending, without key issuance or indefinite waiting. Preserve current
quota enforcement if the user instead wants another project.

Add a generic sentence to the readiness email: **If you started from an app, return
to that app, choose Connect to LambdaDB, and select this project.** Keep existing
Console/CLI/SDK guidance; do not add a stale grant URL or SillyMemory-only wording.

The result is recorded when the request is accepted, not when Return/Close is
clicked. Closing the tab before or after acceptance cannot itself establish
success, denial or cancellation; the app uses Backend state and expiry. If popup
closing/focus is unavailable, show a manual return instruction. Automatic return
is optional and must not carry credentials in a URL.

### Retry through Connect

Keep one familiar entry point rather than a separate recovery wizard. If a key is
already saved for the exact target, retry verification with that key. If delivery
or local persistence failed, restart Connect, select the existing project and
approve connection again. Retain non-secret attempt, project and key recovery
identities where available so retries do not recreate the project.

A one-time key cannot simply be downloaded again. Before implementing retry,
define how a prior issued-but-undelivered key is identified and handled, including
lost responses and local storage failure. Do not silently accumulate replacement
keys or revoke unrelated/working credentials. The UI choice is settled; the safe
issuance/recovery mechanism remains a technical design gate.

## Shared protocol and authorization boundaries

The following is a proposed behavioral contract, not existing API route names.
Keep the existing CLI mode compatible. Add a distinct app-connection purpose and
reuse the underlying login, membership, provisioning and project-key services.
Do not silently reinterpret old CLI requests as app connections.

| Stage/result | Meaning and required behavior |
| --- | --- |
| `pending` | Waiting for login, deliberate project selection or approval. Poll at the server-provided interval until expiry. |
| `provisioning` | A known project in an available region is being prepared. Keep its identity; bounded polling must not recreate it. |
| `ready_for_delivery` | Selection and approval are complete and the project is ready. Only the initiating client can redeem project credentials. |
| `delivered` | Credentials were released once. This is not proof of local save, connection verification or chat readiness. |
| `region_requested` | Terminal non-connection outcome. Include non-secret request/project/region identity; background provisioning continues, but no credentials or automatic later app connection. |
| `denied` / `canceled` / `expired` | Terminal non-connection outcomes. Do not change the app's saved connection. |
| `failed` / `issuance_unconfirmed` | Explicit error or uncertain write/delivery. Keep recovery identity; do not create or issue again automatically. |

Non-secret terminal outcomes remain readable by the initiating request until a
bounded retention deadline, so losing one polling response cannot strand the app.
Secrets are not repeatedly readable. Define expiry, retention and polling limits
in the contract tests; retain the current 15-minute grant and five-second polling
baseline unless a concrete need justifies a documented change. Available-region
provisioning must not extend the connection grant indefinitely. On timeout, retain
the known project for an explicit later attempt rather than duplicate creation.

Required protocol properties:

- Bind a request to its purpose, approved account/project and a high-entropy
  initiator secret. The display/user code alone cannot retrieve credentials.
  Separate app and CLI purpose validation and recheck current permissions at
  credential issuance. A browser's origin or an app label is not authentication.
  Show matching request codes in the initiating app and Console approval screen
  so users can check that they are approving the request they started.
- Console authenticates with its existing member session. The app obtains only
  project endpoint, project identity/name, API key and key recovery identity.
  The reusable app flow does not issue an account management session to the app.
- Project and key creation are deliberate, serialized where needed, and protected
  from duplicate submission. Bind key issuance to a stable request identity.
  Preserve the existing rule against blindly repeating uncertain external writes.
- Prefer issuing the project key at authorized redemption, without retaining its
  plaintext in a grant record. If delivery/save fails, retain its non-secret key
  identity and provide explicit recovery; do not quietly mint replacement keys.
  Final route/schema and lost-response handling must be fixed before implementation.
- Keep keys, account tokens and initiator secrets out of URLs, logs and ordinary
  app settings. Only a non-secret verification code belongs in the Console URL.
- Use Backend polling for completion. If window messaging is used for navigation
  convenience, validate sender origin and request identity; do not use it as an
  alternative credential-delivery channel. Never accept arbitrary return URLs.
- Initial integrations use trusted Console/API locations and validated navigation
  destinations. SillyMemory can fall back to manual tab return instead of requiring
  registration of every localhost port or private ST URL as a redirect URI.

## SillyMemory connection and deletion lifecycle

Preserve a single project connection per native account/browser and the dedicated
credential record scoped to the exact endpoint/project. Retain manual connection
as a recovery path. No server plugin, CLI/MCP installation, host-cookie forwarding
or global key exposure is introduced.

Deletion/reset guarantees cover the supported single-browser environment and its
existing exclusive-tab controls. This work does not coordinate concurrent clients
on other browsers or devices, or claim that one browser can disable their uploads.

- Start/adopt connections only under the existing account/tab ownership controls.
  Guard generation, synchronization and setup overlap. Reject stale completion
  after account changes, cancellation or a superseding connection attempt.
- Save a delivered candidate only after validating it; do not replace a working
  connection on denial, region request, expired approval or failed verification.
- With owned chat collections or pending synthetic-test data, block a different
  endpoint/project before starting the common flow and again before adoption.
  Same-project recovery starts a request pinned to the existing project; Console
  disables target changes and Backend enforces the pinned identity. Recheck it in
  ST before adoption. Lost membership or a missing project ends in an actionable
  failure, never an automatic replacement project.
- No Change project button or per-project connection cache. After confirmed cleanup
  and local connection reset, a new Connect attempt can target another project.
  Cleanup affects only owned SillyMemory resources, never unrelated collections,
  the LambdaDB project itself or native ST conversation text.

### Delete all: required outcome versus mechanism

Current behavior clears `state.ready` before bulk deletion but leaves saved
per-chat `sillymemoryEnabled` flags unchanged. Preparation can make those flags
effective again. This is unsafe for the proposed reset/reconnection flow.

Required outcome within the supported browser: after confirmed Delete all, no
previously enabled chat, native branch or checkpoint path may start uploading solely
because the user prepares, reloads or reconnects, including to a different project.
The UI must show effective
disabled status and require deliberate per-chat activation. Individual-chat
deletion remains a separate action with its existing local-transcript preservation.

Do not add a requirement to enumerate every historical chat and make the user
manually turn each one off before bulk deletion. That suggestion was reconsidered.
Use the smallest persistent invalidation mechanism that meets the outcome.

Candidate to evaluate: a connection/reset activation generation with per-chat
activation binding. Advance it before destructive cleanup, so stale ON flags do
not become effective again. Re-enable deliberately binds a chat to the current
generation. This is a proposal, not an agreed field schema; inspect native branch
inheritance, frozen snapshots, browser storage loss and existing installations
before choosing it. Keep this distinct from the existing in-flight request epoch.

Deletion must stop new work, drain outstanding writes and retain failed/uncertain
cleanup records. A partial failure must keep memory inactive and block another
project until cleanup is confirmed. Do not revive activation as an error rollback.
Prevent operation overlap rather than relying on a warning dialog. Recheck state
after confirmation. Preserve the existing ownership/discovery and deletion checks.

## Repository responsibilities and implementation order

| Repository | Required scope |
| --- | --- |
| `lambdadb-backend` | App-purpose request lifecycle, terminal result polling, project-scoped redemption, app identity, region-request result, existing authorization/quotas/recovery reuse. |
| `lambdadb-console` | Common connection flow, app identity and accurate approval copy, project selection/default naming/region choice, distinct request completion, validated continuations. |
| `SillyMemory` | Entry and polling, result handling, verified credential adoption/preparation, same-project recovery, cleanup prerequisite and stale-activation prevention. |
| `lambdadb-cli` | Compatibility verification; change only if common infrastructure requires it. Preserve terminal project setup and OS credential storage. |
| MCP / data engine | No planned change. Do not add a dependency without an observed gap. |

Implement in dependency order:

1. Resolve the design gates below and freeze a minimal shared API contract.
2. Implement Backend lifecycle and Console flow in dedicated worktrees, preserving
   existing CLI and ordinary Console entry behavior.
3. Integrate SillyMemory and implement the deletion/reset guard before allowing
   post-cleanup connections to another project.
4. Verify protocol failures and real ST/Console browser flows, then update the
   installation guide and current-behavior documentation with actual results.

Use each repository's current instructions and build configuration. Local
implementation and checks are tracked in the implementation contract and validation
report. Merging, releasing and deployment require separate authorization.

## Implementation decisions

The [implementation contract](lambdadb-app-connect-contract.md) resolves the app
route/schema, pinned project, one-time credential delivery and explicit previous-key
replacement rules. Unknown in-flight issuance fails closed rather than issuing
again automatically. Non-secret request/key identity is retained for recovery.

Persistent activation uses a browser generation and per-chat target binding,
invalidated before bulk deletion. No historical-chat rewrite, runtime project
switching, migration or multi-device coordination is introduced. Local checks and
live-acceptance boundaries are in the [validation report](app-connect-validation.md).

## Acceptance criteria

- [ ] A new user starts in ST, signs up, chooses a region with a generated project
  name, creates/connects in Console and returns to an automatically configured app
  without copying connection fields or opening a terminal.
- [ ] An existing user selects a permitted project; multi-Org and invitation cases
  retain explicit choices, role enforcement and server quota behavior.
- [ ] A ready project requires explicit approval showing app, project and actual
  permissions. Canceling approval preserves a project already created, without
  issuing an app key; a retry can select that project.
- [ ] Common Console components handle app identity; existing CLI signup/approval,
  terminal creation/selection and account-session boundaries remain functional.
- [ ] Name collisions, concurrent submissions and provisioning timeouts do not
  create duplicate resources or misreport connection readiness.
- [ ] An unopened-region request produces terminal `region_requested` without a
  key, independent of Close/Return. ST stops waiting; no regional-opening polling
  remains in the app. The logical project consumes the existing quota as disclosed.
  Backend provisioning and owner-email behavior are preserved; a later Connect
  selects that project after readiness, even if email delivery failed.
- [ ] Popup blocking, manual tab closure, denied approval, expiry, network loss,
  replay and stale-account results leave actionable states without secret leaks.
- [ ] Approved project credentials are delivered only to the initiating client;
  lost delivery/save returns to Connect with the existing project, without
  automatic duplicate issuance or revocation of unrelated/working keys. A saved
  usable key is reused rather than replaced on ordinary reconnection.
- [ ] Same-project reconnection preserves normal behavior. Different-project
  adoption is blocked while owned remote data or unresolved cleanup remains;
  the recovery target is pinned in Backend, Console and ST.
- [ ] Delete all preserves native chats and unrelated remote data, prevents new
  work during cleanup and leaves partial failures inactive and recoverable.
- [ ] In the supported browser, after bulk deletion, old ON flags remain ineffective
  across reload, chat switches, native branches and checkpoint resume, preparation
  and new-project connection. Explicit per-chat activation restores intended operation.
- [ ] Connection setup does not upload a chat; temporary test usage and cleanup
  remain explicit. First memory use succeeds only after deliberate activation.

Run focused protocol/unit tests and the maintained ST browser/emulator suites for
the affected risks. Validate actual signup/login, available-region provisioning,
app-origin CORS, credential delivery and region-request outcomes in an authorized
development environment before claiming live completion. Separate emulator checks
from live-service results. No answer-quality benchmark is required for onboarding.
Use bounded synthetic data and verify owned cleanup. Any authorized AWS test
infrastructure must follow the repository/user tagging requirements.

## Inspected evidence and context consistency

These are local source observations on 2026-11-02, not deployment verification.
No source says that the proposed app-purpose workflow is already supported.

| Repository baseline | Evidence |
| --- | --- |
| SillyMemory `adcd722` | [Connection and delete handlers](../index.js), [credential storage](../src/credentials.js), [chat identity/ownership](../src/chat-collections.js), [saved connections](saved-connection.md), [setup/recovery](setup-and-recovery.md), [architecture](architecture.md), [contracts](contracts.md). |
| CLI `0683a7a83beb6c4d44e98bda3d2a23ac7644259a` | [Onboarding contract](https://github.com/lambdadb/lambdadb-cli/blob/0683a7a83beb6c4d44e98bda3d2a23ac7644259a/ONBOARDING.md), [device polling](https://github.com/lambdadb/lambdadb-cli/blob/0683a7a83beb6c4d44e98bda3d2a23ac7644259a/src/device-auth.ts), [terminal project management](https://github.com/lambdadb/lambdadb-cli/blob/0683a7a83beb6c4d44e98bda3d2a23ac7644259a/src/projects.ts). |
| Backend `1c0a5bf792d2105ff8e804f5b3aead1a680146b0` | [Onboarding API](https://github.com/lambdadb/lambdadb-backend/blob/1c0a5bf792d2105ff8e804f5b3aead1a680146b0/docs/unified-onboarding.md), [global project-name index](https://github.com/lambdadb/lambdadb-backend/blob/1c0a5bf792d2105ff8e804f5b3aead1a680146b0/internal/stack/lambdadb-api/internal/entities/project.go), [creation handler](https://github.com/lambdadb/lambdadb-backend/blob/1c0a5bf792d2105ff8e804f5b3aead1a680146b0/internal/stack/lambdadb-api/internal/modules/project/features/create_project/create_project_handler.go), [quota/name queries](https://github.com/lambdadb/lambdadb-backend/blob/1c0a5bf792d2105ff8e804f5b3aead1a680146b0/internal/stack/lambdadb-api/internal/modules/project/data/repository/project_repository.go). |
| Console `3964bf49f55662363340e7956d6d84513c921dbe` | [CLI approval page](https://github.com/lambdadb/lambdadb-console/blob/3964bf49f55662363340e7956d6d84513c921dbe/src/app/(main)/auth/cli/page.tsx): login continuation, CLI-specific approval and manual terminal return instruction. |

The current project-name constraint is global within the Backend project table,
not merely per region. Keep that constraint unchanged in this work. Current
Backend CORS configuration permits origins/methods/headers broadly, but deployed
ST-origin access is untested. Current CLI grants return seven-day account sessions;
the new app flow must not inherit that credential type accidentally.

Additional source checked for the region decision: Backend's
[pending-project provisioner](https://github.com/lambdadb/lambdadb-backend/blob/1c0a5bf792d2105ff8e804f5b3aead1a680146b0/internal/stack/lambdadb-api/internal/modules/project/jobs/pending_project_provisioner.go)
commits `READY` before attempting email to active Organization owners. The email
currently directs users to Console, agent and SDK setup; app reconnection guidance
is a proposed addition. Source inspection does not establish deployed job activity
or actual email delivery.

The older sbrain project plan records a September proxy/session-only prototype
direction, explicitly historical and unverified as implementation. Current
SillyMemory uses direct CORS and saved browser project credentials; this design
follows its current code and documents. Historical plans and test reports are not
rewritten or treated as current runtime requirements. Current docs will be updated
when implementation lands, without rewriting their historical validation evidence.
