# App connection implementation and validation

Status: Local implementation; coordinated deployment and live acceptance pending.
Initial validation: 2026-11-02.
Pre-submission validation: 2026-11-03.

## Implemented behavior

- Backend has separate `/auth/apps/*` start, inspect, decision, region completion,
  poll, cancel and one-time redeem routes. App grants cannot redeem CLI sessions.
  Initiator codes are hashed, requests expire after 15 minutes, and non-secret
  recovery identities are retained for seven days under a bounded grant count.
- Console retains signup/login continuations, Organization resolution, generated
  project names, region selection, pending-project visibility and a separate
  project-scoped approval screen. Unknown project creation is not repeated after
  reload. Known prior-key retirement requires explicit consent.
- SillyMemory starts the browser flow, polls without host credentials, saves a
  non-secret recovery reference before redemption and verifies/saves/prepares the
  returned project. Connection does not activate a chat. Same-project recovery is
  pinned; owned memory prevents switching targets. Manual connection remains.
- Bulk deletion invalidates existing chat activation bindings before remote
  mutation. Old ON flags do not revive on preparation/reconnection or browser
  state loss. Native branches inherit valid activation during ordinary use.
- Unopened-region requests keep the existing pending project, quota, background
  provisioning and owner-email behavior. App waiting ends at request acceptance.
  The email gains generic guidance to start Connect again and select that project.

## Repository review entry points

Each repository is submitted as one coordinated PR; implementation, related tests
and documentation belong together. Local evidence remains outside commits.

### Backend: `lambdadb-backend-worktrees/app-connect`

- `internal/stack/lambdadb-api/internal/modules/auth/features/device_authorization/apps.go`
- `internal/stack/lambdadb-api/internal/modules/auth/features/device_authorization/endpoint.go`
- `internal/stack/lambdadb-api/internal/entities/app_authorization.go`
- `internal/stack/lambdadb-api/internal/application/data/dbcontext/dbcontext.go`
- `internal/stack/lambdadb-api/config/config.go`
- `internal/stack/lambdadb-api/internal/modules/project/jobs/pending_project_provisioner.go`
- `internal/stack/lambdadb-api/tests/integration/app_connection_test.go`
- `docs/unified-onboarding.md`

### Console: `lambdadb-console-worktrees/app-connect`

- `src/app/(main)/auth/connect/page.tsx`
- `src/api/endpoints/app-connection.api.ts`
- `src/lib/onboarding.ts`
- `src/__tests__/components/app-connection.test.tsx`
- `src/__tests__/lib/onboarding.test.ts`
- `e2e/app-connection.spec.ts`
- `docs/development.md`

### SillyMemory: this worktree

- [Host integration](../index.js), [account connection](../src/app-connect.js),
  [activation guard](../src/activation.js), [settings UI](../settings.html),
  [syntax-check commands](../package.json).
- [Activation tests](../tests/activation.test.js),
  [account connection tests](../tests/app-connect.test.js),
  [real-host/browser harness](../scripts/browser-smoke.mjs).
- [Setup instructions](../README.md), [saved connection behavior](saved-connection.md),
  [development entry](development.md), [product design](lambdadb-app-connect-design.md),
  [implementation contract](lambdadb-app-connect-contract.md), and this report.

## Checks and evidence

Commands below run from each repository, except Backend Go commands, which run
from `internal/stack/lambdadb-api`. No real account tokens, private chats, managed
inference or cloud provisioning were used. PostgreSQL ran in a disposable local
Docker container with test-only credentials; schemas are removed by the tests. The test container was stopped and confirmed
removed after validation.

| Scope | Command | Result |
| --- | --- | --- |
| Backend | `swag init -q --parseInternal --parseDependency --parseDepth 1 -g ./cmd/app/main.go -d . -o ./docs/` using v1.16.4 | Passed. Generated API schema; not a deployment. |
| Backend | `go build ./...` | Passed. |
| Backend | `go test ./...` | Passed. |
| Backend | `go vet ./internal/modules/auth/features/device_authorization` | Passed. |
| Backend PostgreSQL | `go test -tags=integration -race -count=1 -run 'TestAppConnection\|TestCLIAccount\|TestDeviceAuthorization\|TestDefaultOrganization\|TestOnboardingProject\|TestRemovedMemberCanBeInvitedAgain\|TestCancelledInvitationIsDeleted\|TestLegacyAcceptedInvitationIsReused' ./tests/integration` with a disposable `LAMBDADB_METRICS_DB_DSN` | Passed. App tests also rerun after key-identity and permission corrections. |
| Console | `npm run typecheck`, `npm run build` | Passed. |
| Console | `npm test -- --run` | 487 passed. |
| Console Chromium | `npx playwright test e2e/app-connection.spec.ts --project=chromium --workers=1` against the local production build | Two passed. Authentication/API responses are synthetic fixtures, not real signup or OAuth. |
| Console formatting | Biome checks on the new page, endpoint client and continuation helper | Passed. |
| SillyMemory | `npm test` | 253 passed. |
| SillyMemory | `npm run check`, `npm run check:release` | Passed. Release metadata remains the existing development baseline; no promotion. |
| SillyMemory pinned host | `ST_SOURCE=/tmp/sillymemory-app-connect-host ST_TEST_PORT=18174 SM_ARTIFACT_TAG=app-connect-pr npm run test:browser` | 234 passed, zero browser errors, proxy requests and remaining emulator collections. Includes app region completion and automatic verified connection with memory off. |

The pinned host is SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Chromium uses actual host UI and a
local HTTPS data API emulator. Account API and Console popup responses in the
ST browser check are synthetic fixtures. Separate PostgreSQL tests exercise the
actual Backend route/service state machine and concurrent one-time redemption.
These checks do not establish a single live deployment's complete flow.

Console's narrow approval screenshot was opened and visually checked. Ignored
local evidence includes Console `test-results/app-connection-approval.png` and
SillyMemory `artifacts/app-connect-pr/browser-smoke-app-connect-pr.json`.
These artifacts are local-only and unavailable in a fresh clone.

Earlier ST runs had intermittent request-count assertion failures around snapshot
save/cancel while unrelated automatic snapshot-list reads can be in flight. That
explanation remains a hypothesis: the diagnostic rerun passed without reproducing
it. A separate run reached and passed all app assertions but failed final cleanup
because the settings section had automatically collapsed. The harness now opens
that section before cleanup; no production behavior was changed for that failure.
Final-source validation passed using
`ST_SOURCE=/tmp/sillymemory-app-connect-host ST_TEST_PORT=18174 SM_ARTIFACT_TAG=app-connect-pr npm run test:browser`:
234 checks, zero browser errors, zero proxy requests and zero remaining emulator
collections. Every recorded source hash was recomputed against the final files
and matched. The earlier intermittent snapshot assertion cause remains unconfirmed;
no production change or weakened assertion was used to obtain the passing run.

## Deployment and remaining boundaries

App routes default to disabled. Backend's
`deviceAuthorization.appConnectionsEnabled` is independent of CLI enablement and
uses the configured trusted Console origin. Deploy Backend with app connections
disabled, deploy Console, then enable for authorized development acceptance before
promoting the SillyMemory client. Existing CLI and manual key setup remain usable.

Live acceptance must exercise real signup/verification and login, project creation
in an open region, deployment CORS and routing, one-time key delivery/local save,
and pending-region provisioning/email. Actual email delivery is distinct from
configuration and unit coverage. This work performs none of those deployments,
sends no message/email and publishes no package or release. PR submission is
tracked separately in GitHub.

If an external key call is still in flight or its result cannot be established,
Connect fails closed with recovery/manual key-management guidance. It cannot
safely promise an automatic replacement in every lost-response case. Successful
manual key setup resolves local recovery state without revoking remote app keys;
any old keys need deliberate Console cleanup. The single-browser scope does not
coordinate another device's uploads or synchronize credentials across devices.

## Pre-submission corrections (2026-11-03)

The final review added a validity check before adopting a key after asynchronous
connection verification, so canceling after redemption cannot save/prepare a late
candidate. The host regression holds that verification response, cancels, then
confirms no credential was saved. Console now distinguishes confirmed project
creation from failure to return the region-request result, with a focused regression.
Unapproved anonymous grants expire from retained capacity after 15 minutes instead
of holding a seven-day slot; approved and accepted-region results keep recovery
retention. PostgreSQL tests cover reclamation and retained approved grants.
