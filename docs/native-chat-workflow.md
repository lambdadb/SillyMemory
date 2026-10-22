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

**Chat history** in the Memory panel and **Open chat history** in settings open
the existing native list. They do not create another chat manager. The basic
panel directs users to native checkpoints and branches; advanced snapshots retain
their distinct verified-memory semantics.

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

The final actual-host browser run passed 165 assertions with recorded source
hashes matching this preview implementation and harness. It verifies empty and
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
