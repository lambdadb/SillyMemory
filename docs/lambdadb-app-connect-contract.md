# App connection implementation contract

Status: Implemented locally, pending coordinated deployment and live acceptance.
Date: 2026-11-02.

This supplements the [product design](lambdadb-app-connect-design.md). Keep the
existing `/auth/device/*` and `/auth/cli/*` contracts unchanged. New app routes
use `/auth/apps/*` and never return an account session.

## Requests and authorization

All bodies and responses use snake_case. Anonymous start/poll/cancel routes use
the existing device-flow rate limits and a bounded database grant count. They
send `Cache-Control: no-store`. Console routes use the existing member JWT and
current membership/role checks. Display names come from a server-owned client
mapping, initially `sillymemory` -> `SillyMemory`; this is identification, not
proof of the calling software's authenticity.

| POST route | Caller | Contract |
| --- | --- | --- |
| `/auth/apps/start` | Initiating app | `{client_id, project_id?, project_name?, recovery_id?}`; return `device_code`, `user_code`, Console verification URI, `expires_in: 900`, `interval: 5`. A project UUID or globally unique project name pins recovery; name lookup supports existing manual connections. Supply at most one of these target fields. A prior request UUID identifies explicit key recovery. |
| `/auth/apps/inspect` | Console JWT | `{user_code}`; return app identity, request status/expiry and pinned project identity if present. Validate request code matching before mutations. |
| `/auth/apps/decision` | Console JWT | `{user_code, approve, organization_id?, project_id?, replace_key_id?}`; denial is terminal. Approval requires a ready project, owner/admin access and an exact pinned-target match. Persist the approving member and target, not credentials. |
| `/auth/apps/region-requested` | Console JWT | `{user_code, organization_id, project_id}`; verify membership, pinned-target compatibility, pending project and unopened region. Store terminal `region_requested`. No app key is issued. |
| `/auth/apps/poll` | Initiating secret | `{device_code}`; return non-secret status and recovery identity. Return `slow_down` on premature polls. Never issue a key as a side effect of status polling. |
| `/auth/apps/redeem` | Initiating secret | `{device_code}`; claim an approved grant once and issue its project key after rechecking current authorization. Return exact endpoint/project, key name/ID and one-time key. |
| `/auth/apps/cancel` | Initiating secret | `{device_code}`; cancel only unclaimed requests. Cancellation cannot undo committed project creation or an already-claimed issuance. |

Use the existing Console JWT APIs for Organization/project creation and lists.
The app does not receive those credentials. A project creation response lost in
transit must lead to existing-project inspection, not another creation request.
Associate known project IDs with the continuation as soon as creation is confirmed.

## State and persistence

The `app_authorizations` table is separate from CLI grants, so CLI redemption
cannot accept an app grant. Store only hashes of the 256-bit initiating code and the
display code, client ID, optional pinned project, approving member/target IDs,
status, expiry, last poll, issuance request UUID and non-secret key identity.
Anonymous, unapproved requests are retained only for their 15-minute lifetime;
approval or accepted region requests extend retention to seven days.
Implement secret redaction on request/response DTOs before logging middleware sees
them. Reuse CLI random-code, hashing and error helpers where their contracts fit;
do not broaden CLI state semantics.

Transitions:

- `pending` -> `approved`, `region_requested`, `denied`, `canceled`, or `expired`.
- `approved` -> `issuing`, `canceled`, or `expired`.
- `issuing` -> `delivered` or `issuance_unconfirmed`; never back to `approved`.
- `delivered`, `region_requested`, `denied`, `canceled`, `expired`, `retired` and
  `issuance_unconfirmed` are terminal. Authenticated connection results remain readable until
  the seven-day grant retention deadline; display terminal results before applying expiry.
- Claim transitions with conditional updates/row locks. Expiry is checked when
  claiming issuance. Once claimed, late cancellation cannot falsely report that
  no key could have been issued.

The product design's `provisioning` is Console progress against the existing
project, not a second project-creation engine. `ready_for_delivery` corresponds
to an approved grant. Issuance timeout or process death after the claim is an
uncertain outcome, never a reason to issue again under the same grant.

Key names use `lambdadb-app-<issuance-request-uuid>`, generated and stored before
the external call. The returned key ID is retained after issuance; no plaintext
key is retained in the grant. A successful response is delivered once. Duplicate
redemption returns `issuance_unconfirmed`; the app already saved the non-secret
request identity before redeeming, and can obtain status through polling. Retain issuance recovery identities independently
of the short-lived grant for seven days, consistent with CLI key-request records.

## Recovery through Connect

Ordinary reconnection with a saved key performs no new browser approval or key
issuance. If a key is unavailable, Connect creates a new request pinned to the
known target and carries the previous non-secret recovery reference if available.
The reference is only a hint; Backend must authenticate the current member and
verify the prior attempt's member, client and project before exposing its details.

Before offering replacement issuance, reconcile the prior attempt's exact named
key through existing project key management. If the key exists and local save was
not acknowledged, show its name and require an explicit cleanup/replacement choice
in Console. Never automatically revoke a delivered key: the old app may have saved
it even when acknowledgment was lost. Never revoke by app-name prefix or revoke
another app's key. If issuance may still be in flight or its outcome cannot be
established, stop with an actionable recovery state rather than generating a new
key repeatedly. Losing all recovery references falls back to explicit project-key
management; do not claim seamless recovery of an unidentifiable credential.

No acknowledgment endpoint is required. Explicitly retiring the exact previous
key is a separate consent in Console. A grant left `issuing` after process failure
cannot be assumed unused, even after expiry; show uncertain-delivery recovery and
manual key-management guidance rather than repeatedly issuing new keys. When an
uncertain issuance has a known key, deliberate retirement can complete through
Connect. Terminal results and non-secret key names are retained for seven days.

## Console and SillyMemory

Console route: `/auth/connect?user_code=...`. Extend validated login/signup/email
continuations to that exact path; preserve existing CLI continuation behavior.
Display the matching request code and app identity throughout. Resolve invitations
and Organizations with existing APIs. Use generated valid project names and explicit
region selection; preserve existing quota and unopened-region creation semantics.

For a ready project, show a separate approval screen. After redemption, show
**Connection details sent. Return to your app to finish setup.** For an unopened
region, end polling with `region_requested` and **Return to app**; the existing
background provisioning and owner email continue independently. Add generic app
reconnection guidance to the existing email.

ST opens a blank popup synchronously from the user's click, then navigates it to
the trusted verification URI once start succeeds; show a link if blocked. Polling
and redemption are direct CORS requests with no ST cookies/CSRF headers. Keep
the initiating secret in memory only. Reload abandons that attempt; it never
automatically restarts key issuance. Revalidate owner, project and connection
attempt before adopting any result. Do not require a return URL or secret-bearing
window message. Return/Close is navigation convenience only.

## Activation reset

Use a persistent random activation generation in the existing owner-scoped local
state and bind each deliberately enabled chat to that generation and the normalized
endpoint/project. Effective ON requires the existing boolean plus a matching
binding; legacy/unbound flags are ineffective until the user enables them.
Native branches may inherit a valid binding during ordinary use, as they inherit
the current ON preference. Generation reset invalidates previously inherited
bindings, including frozen snapshot resumes. Do not confuse this generation with
the transient request epoch used to discard in-flight work.

Before bulk deletion, persist a fresh generation successfully, then stop/drain
work and delete owned remote resources. Persistence failure stops deletion before
remote mutation. Partial deletion never restores the old generation. Forget key
retains generation and cleanup ownership; cleanup plus target replacement starts
with fresh activation. Missing local state creates a new random generation, so
native saved ON flags cannot reactivate on browser-storage loss. No historical-chat
enumeration or mutation is required. These guarantees cover the supported browser,
not another device's independent client.

## Worktrees and validation

Local implementation on 2026-11-02 covers Backend app routes and hashed grant
storage, Console project setup and approval, and SillyMemory Connect, credential
adoption and activation reset. Exact checks, outcomes and remaining deployment
boundaries are recorded in [implementation validation](app-connect-validation.md).

| Repository | Branch | Base |
| --- | --- | --- |
| Backend | `feat/app-connect` | `origin/develop` at `34b16bc` |
| Console | `feat/app-connect` | `origin/develop` at `614dcdf` |
| SillyMemory | `feat/lambdadb-connect` | `origin/develop` at `adcd722` |

Backend: gofmt, CI-pinned Swagger generation, build and package tests, plus focused
PostgreSQL integration tests for state races and recovery. Console: build,
typecheck, Vitest and relevant browser flows. SillyMemory: maintained unit/syntax/
release checks and pinned-host/emulator lifecycle tests. Exercise CLI regression,
denial/expiry, lost redemption, project pinning, partial deletion and stale ON
flags. Live-service acceptance requires a designated development environment and
separate deployment authorization. No live provider validation has run yet.

## Enablement

App endpoints are disabled by default. Backend uses
`deviceAuthorization.appConnectionsEnabled`, independently of the existing CLI
`deviceAuthorization.enabled`; both use the trusted `consoleURL`. Deploy Backend
with app routes disabled, deploy Console, then enable app routes for coordinated
acceptance before promoting the SillyMemory client. No configuration enablement,
release, PR submission or deployment has been performed by this local work.
