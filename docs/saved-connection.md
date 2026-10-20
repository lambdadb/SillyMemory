# Saved browser connections

## Product decision

Keep one UI extension and direct browser HTTPS/CORS. The user enters a project
key once and chooses **Save and connect**. That action explicitly stores the key
in this browser; there are no retention modes or extra server plugins. It replaces
the previous session-only policy for the unreleased 0.4.0 candidate, not any
historical test evidence.

Use one dedicated `sillymemory:credential:<owner>` record per native account owner.
It contains the format version, normalized regional endpoint, project and key.
Only an exact endpoint/project match may restore it. Replacing the connection
replaces the record, leaving no older project keys. The ordinary browser settings,
native SillyTavern settings, logs and URLs never receive the key. Runtime keys
remain in the client's private field; the password input is cleared on submission.

A single authenticated `GET /projects/{project}/collections?size=1` validates the
connection before save or activation. It does not create resources or invoke
managed embeddings, reranking or the answer model. It proves the bounded read
works, not every write permission. **Prepare chat memory** runs the required
synthetic transport test (unless it already passed in this session) and verifies
cleanup before marking memory ready. Activation remains a separate explicit step.
The manual test and pending-test cleanup controls remain under **Advanced**.
Pending test data also exposes a cleanup action beside the status. A failed
background synchronization exposes a retry action; retrying a stopped generation
still uses the native Regenerate action.

After successful verification, the connection editor collapses to a project
summary. It remains manually expandable and reopens when authentication or
reconnection fails. Setup shows preparation only after connection, then the memory
switch after preparation. These views do not change stored connection or memory
settings.

After reload, acquire the account's existing exclusive browser lock, restore the
key and verify it. Only then restore the previous enabled state if chat memory was
prepared. Disabled stays disabled. No selected character means synchronization
waits for the user to open a supported chat; the extension does not select a chat
or modify native auto-load preferences. The existing source/branch reconciliation
checks still guard writes and generation.

## Failure and removal

- HTTP 401 disables memory. A rejected restored key is removed only if its exact
  endpoint/project and value still match storage. A rejected explicit candidate is
  not saved and preserves the previous credential. Replace the key and choose
  **Save and connect**; switching back can retry the prior saved connection.
- Network/CORS, timeout, 403 and transient service errors leave saved credentials
  available but do not enable memory. An empty key input may retry the saved key
  for the exact selected connection via **Save and connect**, restoring the saved
  enabled preference after verified recovery. No automatic retry loop.
- **Forget key** clears the input and runtime key, cancels requests, removes the
  account credential even if ordinary connection settings were lost, disables
  memory and drains pending work. It retains remote
  memory and owned cleanup journals. A storage-removal failure is visible and is
  not reported as successful deletion.
- The exclusive tab lock blocks automatic credential restoration and service calls
  in another SillyMemory tab. Account changes and page exit invalidate connection
  preparation; completed stale requests cannot install a client.
- Explicit save writes ordinary settings first and the credential last, adopting
  neither in runtime until both succeed. A failed credential write restores the
  previous settings bytes; a failed settings write never touches the prior key.
  If storage also blocks rollback, the error explicitly reports incomplete recovery.
- Malformed records or unavailable browser storage fail with safe actionable
  messages, without exposing stored bytes or raw exception details.

## Boundary

Browser local storage is not encrypted or isolated from other scripts on the same
origin. The UI discloses this before saving. Clearing site storage removes the
credential; browser/profile/origin changes need a new connection. Keys are not
stored by this feature on the SillyTavern server or synchronized across devices.
Native `secrets.json` cannot serve direct requests with key exposure disabled;
the existing proxy cannot inject a stored credential. No global key-exposure,
server-plugin or host-cookie-forwarding requirement is added.

## Validation

Focused tests cover account/endpoint/project isolation, normalization, replacement,
scoped removal, malformed records, blocked storage and the bounded authenticated
read contract. Completed validation on SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`:

- `npm test`: 350 passed; runtime/script/test syntax, release metadata and the
  pinned SDK 0.8.0 bundle checks passed.
- `SM_ARTIFACT_TAG=saved-connection-storage npm run test:browser`: 55 actual-host
  Chromium checks with the local HTTPS LambdaDB emulator. Confirmed verified
  automatic reconnect, enabled/disabled retention, no duplicate upserts, delayed
  authentication staying disabled, exclusive-tab behavior, HTTP 401 removal,
  HTTP 503 retention and password-free retry, preservation of the prior key after
  a rejected different-project candidate, dedicated storage and complete forget.
- `SM_ARTIFACT_TAG=saved-connection-faults npm run test:faults`: 84 checks, including
  existing synchronization, stale results, uncertain writes and deletion races.
- `node scripts/prompt-delivery-smoke.mjs`: 17 native prompt-delivery cases,
  including streaming, swipe, regeneration, capacity failure and literal assembly.
  Both fault and prompt runs preceded the final storage-error message sanitization
  and unsupported-lock control disabling; final units and the 55-check browser
  run include those guards and the candidate-key/removal/storage review corrections. All emulator runs ended with zero remaining collections
  and no browser errors.

The paid generation/lifecycle runners were updated and syntax checked but not
executed against live providers. The generation entry point requires credentials
and was not pursued; no real keys were read or saved for this change. Fresh Git URL
installation is not newly verified here. These checks establish connection/lifecycle behavior, not answer quality or
real-provider acceptance. No benchmark rerun is needed for persistence.
See [retained evidence](evidence-retention.md#saved-browser-connection-verification).


## Historical integration with clarification continuity

The later [native reply decision](native-replies.md) retires the response adapter;
credential persistence and ownership boundaries remain unchanged.

After PR #73 merged as `effc2211724280dc49e664800124356c847e3f2f`, the saved
connection branch incorporated that develop baseline. Both defaults and settings
handlers remain intact. The runtime clarification, indexing and selection code
matches develop; only credential lifecycle and the relevant native fixtures change.

- `npm test`: 371 passed; `npm run check`, `npm run check:release`,
  `npm run check:sdk` and all script/test syntax checks passed.
- `ST_SOURCE=<pinned host> SM_ARTIFACT_TAG=saved-connection-merged-final npm run test:browser`:
  83 actual-host/Chromium checks with local HTTPS LambdaDB and completion emulators.
  Verified reconnect without key re-entry, pending dialogue in retrieval/generation,
  startup recovery, streaming/swipes and disabled memory reverting to native
  history without the reply protocol or memory search.
- The same environment/tag with `npm run test:faults`: 88 checks covering
  synchronization, uncertain writes, stale queries, reload recovery and deletion.
  Both runs ended with no page errors and zero remaining collections.

The first startup fixture timed out because programmatic character selection did
not persist the native last-clicked character required by auto-load. The fixture
now sets that preference explicitly and releases its held template on failure.
Product code does not change the user's native auto-load preference. Initial
failure logs and final receipts are retained; no real credentials, paid calls,
new Git URL installation or additional answer-quality evaluation were used.
