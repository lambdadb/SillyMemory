# Native chat workflow

## Decision and scope

Use SillyTavern's own chat history, **Save checkpoint**, **Create Branch** and
**Back to parent chat** as the ordinary workflow. Opening a saved path prepares
that transcript's memory when the user has enabled it. Keep the additional
verified transcript/remote-memory snapshot feature under **Advanced → Frozen
memory snapshots**, with its existing storage and integrity checks.

Completion requires native checkpoints, earlier-message/alternate-swipe branches,
return navigation, snapshot save/resume, explicit memory-off preferences and
failure safety to work on the pinned host with synthetic chats and a local HTTPS
LambdaDB emulator. No live-provider requests or answer-quality experiment are
needed for this UX change.

## Findings and changes

The baseline is `cae42d58d955a1688ced3075ad05227923f36772` (0.6.0).
Actual-host checks established that ordinary native branching already retained
the enabled preference and isolated the source and child memory. A native
checkpoint likewise became an independent writable memory path when opened;
it did not freeze remote memory when saved.

The separate snapshot action did disable the persisted memory preference. The
before-change browser run reproduced this at the assertion **saving a frozen
memory snapshot preserves the enabled preference**. Its preceding native
checkpoint, branch, source-preservation and explicit-off checks passed.

The adapter now pauses operations while preserving the user's preference, shows
**Saving snapshot** or **Resuming snapshot**, and automatically synchronizes the
active writable chat after success. Failure remains visible; an explicitly off
preference stays off. Generation reaching the memory interceptor during a manual
operation stops explicitly instead of silently continuing with native history.

Native forks inherit extension metadata before receiving their own saved memory
identity. A changed native integrity value therefore must not display the frozen
parent's read-only state while the child is being prepared. The frozen source
itself remains protected. New snapshots also retain a native `main_chat` link to
their actual source, rather than inheriting an earlier ancestor's link or lacking
one. Existing snapshots are not rewritten.

Snapshot saving uses the same integrity-aware classification while memory is
off, so an inherited frozen marker cannot route a writable native fork into
frozen-snapshot validation. Its identity is normalized before the new snapshot
is created. Rename/delete cancellation returns an explicit incomplete result,
clears the preparing notice and does not schedule synchronization. Completed
actions and failed actions retain their existing follow-up/error behavior.

**Chat history** in the Memory panel and **Open chat history** in settings open
the existing native list. They do not create another chat manager. The basic
panel directs users to native checkpoints and branches; advanced snapshots retain
their distinct verified-memory semantics.

Once connection and preparation have completed, the same chat-panel action
switches between **Turn memory on** and **Turn memory off**. Both directions use
a native chat metadata preference (`sillymemoryEnabled`), including verified
persistence and synchronization. Settings manage the shared LambdaDB connection;
there is no global memory activation switch. New chats default off. Native
checkpoints/branches and resumed snapshots inherit their saved source preference
and can then change independently. Frozen remote snapshots cannot be toggled in
place because their metadata is integrity-checked.
Initial connection/preparation and pending test cleanup do not expose activation.
Manual memory operations and native generation disable switching; the click
handler also rechecks these guards to reject queued actions. Enabling resets the
delivery notice so an old disabled notice does not remain under an enabled state.

Debounced source synchronization waits through slow manual work while its
preparing status still owns the display. A newer status, including an action
failure, cancels that deferred attempt instead of being overwritten. Enabling
leaves the pending synchronization status intact rather than replacing it.

The collapsed-by-default **Memory** panel now shows short source previews when
expanded after prompt preparation. These are the selected, source-validated
passages admitted to the memory budget, rather than all search candidates or
model-generated summaries. It lists up to three passages in source order, with
role, speaker, message and passage positions, and the first 180 Unicode code
points per excerpt followed by an ellipsis when clipped. These are display limits
only. **View full memory** opens the
existing final-prompt inspector, including any omitted or unverifiable excerpts.
An empty selection is explicit; selection itself does not claim delivery or
answer correctness.

Previews are plain text in the current DOM, without additional persistence or
memory-service requests. They clear on new reply preparation, source changes, chat
switch/reload, memory-off, connection loss or operation failure. Normal assistant
reply completion and background synchronization preserve the last selection.

## Per-chat activation

Activation is a native chat preference, separate from the shared LambdaDB
connection. `sillymemoryEnabled: true` opts a saved chat in; an absent or false
flag leaves it off. The old browser-wide `enabled` field is not applied to chats.
A different browser still needs its own validated connection before a saved on
preference can access memory. Keys remain in the dedicated browser record.

Switching clears injection, previews and token diagnostics immediately. Off also
clears previous progress and prompt-verification text while the local preference
save is pending. The extension drains earlier writes, uses native
`saveChatConditional` with the host save lock and a blocking loader to keep its
current-chat target stable, then reads back the captured target's flag before starting enabled synchronization.
The native save can swallow server errors, so an unconfirmed on preference rolls
back without memory uploads. A chat switch discards late completion/failure UI.

Native checkpoints and branches copy the source preference at creation; later
switches affect only that path. Resumed remote snapshots inherit their saved flag.
Frozen snapshot metadata stays immutable, so its toggle is hidden and guarded;
Resume remains available even for an off snapshot. Deleting one chat's remote
memory disables only that chat. Deleting all owned memory first clears global
preparation, stops pending access, then drains and deletes data. The native chat
preferences remain saved; reconnecting alone cannot bypass preparation.

## Validation

Host: SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, with a disposable data root and
synthetic character. Browser and source hashes are recorded in each report.

- `npm test`: 416 tests passed on Node.js 24.15.0.
- Runtime syntax, release metadata (`0.6.1`, Unreleased), locked SDK verification,
  and syntax checks for all 161 development JavaScript files passed.
- Python protocol suite: 32 tests passed.
- Actual host/Chromium with local HTTPS emulator: 153 browser assertions passed;
  no uncaught page errors, host proxy requests or remaining emulator collections.
- Fault/recovery suite: 233 assertions passed on the same final runtime, also
  with no uncaught page errors, host proxy requests or remaining collections.
- Both reports' recorded source hashes match the runtime and harness at
  `e34c2726a63da8d497de132dfffc41da2b303b6f`. A subsequent CSS-only status-color
  refinement and selected-memory previews are verified separately below.
- The saving, native-history and original-chat screenshots were opened and
  visually checked. Narrow-layout checks also remain in the browser suite.

```sh
npm test
npm run check
npm run check:release
npm run check:sdk
python3 -m unittest discover -s tests -p 'test_*.py'
ST_SOURCE=/path/to/disposable/pinned/host ST_TEST_PORT=18130 \
  SM_ARTIFACT_TAG=native-workflow-final-v2 npm run test:browser
ST_SOURCE=/path/to/disposable/pinned/host ST_TEST_PORT=18131 \
  SM_ARTIFACT_TAG=native-workflow-recovery-final npm run test:recovery
```

The browser suite exercises native checkpoint saving, selected-swipe and earlier
branches, source/frozen-memory preservation, parent navigation, native history,
snapshot save/resume with enabled and disabled preferences, rejected local saves,
and the busy-generation interceptor guard. Existing generation checks use
controlled native completion responses, including streaming; these are not live
OpenAI results. Recovery uses deliberately injected local-emulator failures.

Local-only reports and screenshots are under
`artifacts/native-workflow-final-v2/` and
`artifacts/native-workflow-recovery-final/`. They contain synthetic data only and
are not available in a fresh clone or required by CI.

The local-only archive
`artifacts/archive/native-chat-workflow-2026-10-22/evidence.tar.gz` contains the
final reports, inspected screenshots, logs, baseline runtime and final producer
sources: 2,172,356 bytes, SHA-256
`3bf8cbfde0ddeb8e60f47a2b1e05dcce335a70b1de7b791edfe6127f8ae8bc69`.
All 75 members were read back byte-for-byte. Preliminary UI-selector/setup
failures are retained separately from the reproduced product failure and final
passing runs. No personal chats or real service credentials are included.

### Status color refinement

Ready and verified delivery use green (`#68d391`), active work uses orange
(`#f6ad55`), warnings use yellow (`#f6d365`), and errors retain red (`#f08080`).
The status dot no longer takes its ready/working color from the theme's quote
color. Status labels remain visible alongside the dot so color is not the only
way to distinguish states.

An isolated Chromium preview uses the actual chat-status template and stylesheet
with an orange quote-color theme. It checks computed dot colors for all four
semantic states and retains the preview and stylesheet hash under
`artifacts/status-colors/`. This is a CSS/DOM check, separate from the earlier
actual-host workflow and local-emulator results. All six header previews passed
their color, opacity and label checks and the resulting image was opened and
visually checked. `npm test` again passed all 416 tests; release metadata and the
staged diff checks also passed. No new maintained test or fixture was added for
this reversible stylesheet change.

### Selected-memory preview validation

`npm test` passed all 416 tests again. Runtime/development syntax, release
metadata and SDK checks passed, as did all 32 Python protocol tests.

The preview actual-host browser run passed 165 assertions with recorded source
hashes matching `c19f13703f46ed693e0a16af9f2bd9e018cd3995`. It verifies empty and
budget-limited selections, plain-text rendering of markup, source coordinates,
three-item/180-character display limits, the full-memory shortcut, preservation
through native reply completion/background sync, and clearing on chat switch,
reload, disabled memory and retrieval failure. Desktop and narrow screenshots
were opened and visually checked. Reports and screenshots are local-only under
`artifacts/memory-preview-final/`.

The fault/recovery run passed 240 assertions, including two host kills and 24
bounded recovery cycles. Its local-only report is under
`artifacts/memory-preview-recovery/`. This ran before the final singular/plural
button-label correction and matching assertion adjustment; those two producer
files are retained under that directory's `producer/`, with hashes verified
against the report. The final browser rerun covers the corrected label. Both
runs finished without uncaught page errors, host proxy requests or remaining
emulator collections. These are local-emulator results, not live-provider checks.

### Chat toggle and review follow-up validation

After the chat toggle and snapshot edge-case fixes, `npm test` passed all 416
tests. The final actual-host browser suite passed 184 assertions; fault/recovery
passed 243, including both host restarts and all 24 recovery cycles. Both reports'
runtime and harness hashes match the final implementation. Neither run had
uncaught page errors, host proxy requests or remaining emulator collections.

New checks cover activation without reopening settings, persisted on/off state,
disabled activation before preparation or pending cleanup, queued clicks during
native generation/manual snapshot work, and removal of the old disabled notice.
They also cover resuming pending sync after a slow management action, preserving
a failed action's newer status, canceled rename/delete with memory both on and off (no follow-up
remote requests), and snapshot saving from a disabled native fork without
modifying its frozen parent. Final desktop, narrow and memory-off screenshots
were opened and visually checked. Local-only reports/screenshots are under
`artifacts/deferred-sync-final/` and `artifacts/deferred-sync-recovery/`.

### Per-chat activation validation

The final per-chat implementation passed on Node.js 24.15.0, Chromium
153.0.8010.12 and the same pinned SillyTavern host with disposable synthetic
chats and a local HTTPS LambdaDB emulator:

- `npm test`: 420 tests passed.
- `npm run check`, `npm run check:release`, `npm run check:sdk` and staged diff checks passed.
- `node --check` on `scripts/*.mjs`, `tests/*.js` and `benchmark/*/*.mjs`: 163 files passed.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 32 tests passed.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_TEST_PORT=18130 SM_ARTIFACT_TAG=per-chat-browser-final-v5 npm run test:browser`: 211 assertions passed.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_TEST_PORT=18131 SM_ARTIFACT_TAG=per-chat-recovery-final-v5 npm run test:recovery`: 243 assertions passed, including two host restarts and 24 recovery cycles.

The browser checks cover default-off and independent saved choices; failed
preference saves without uploads; switching targets during a save; checkpoint and
branch inheritance with independent parent/child flags; off frozen-snapshot Resume
without metadata mutation; and saving from an off native snapshot fork. Existing
identity-save, ownership, cancellation, native generation, token-display and
recovery regressions remain exercised. An off click clears previous progress and
verification text immediately while saving its local preference.

Both final reports match the final runtime/harness hashes and contain zero page
errors, host proxy requests and remaining emulator collections. Desktop, narrow
and memory-off screenshots were opened and visually checked. Detailed reports,
logs and screenshots remain local-only under `artifacts/per-chat-browser-final-v5/`
and `artifacts/per-chat-recovery-final-v5/`. Earlier `artifacts/per-chat-*/` attempts
are retained separately, including fixture assumptions about global activation,
native drawer visibility and previous progress during preference saving. They are
not counted as final passing runs. These ignored artifacts are not CI dependencies
or fresh-clone downloads. Other maintained runners use the chat button and were
syntax-checked; paid/live runners and installation/update acceptance were not run.

## Boundaries

Native **Save checkpoint** still saves a transcript, rather than freezing remote
memory immediately. First opening a path may need synchronization and managed
embedding usage. The optional advanced snapshot still synchronizes the full
completed transcript and verifies its retained remote branch before explicit
resume. Ordinary recent-history boundaries, source validation, ownership,
credential isolation, direct browser CORS, batching, retrieval/generation policy
and resource limits remain unchanged.

These checks do not establish new live LambdaDB compatibility, answer quality,
provider performance, installation/update acceptance or multi-device safety.
No main promotion, tag, release or deployment is part of this change.
