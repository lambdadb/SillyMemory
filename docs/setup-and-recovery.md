# Setup and recovery UX

Update (2026-11-05): the frozen memory snapshot feature was removed. The snapshot
list and snapshot popup items below are historical.

## Decision and completion criteria

Complete four bounded UI improvements together: reconnect using the scoped saved
key from chat, combine explicit connection and transport preparation, refresh the
advanced snapshot list on opening/reconnection, and use native SillyTavern popups.
Complete when the real pinned-host browser and recovery checks exercise these
flows and their cancellation/failure/isolation boundaries, with owned emulator
cleanup. Use existing runners, synthetic chats and the local HTTPS emulator only;
no paid provider, quality evaluation or new storage/retrieval policy is required.

## Behavior

- Reconnect uses only the saved key for the exact persisted endpoint/project.
  It does not consume unsaved form values or change any chat's on/off choice.
  Missing/rejected keys leave Connection settings as the recovery path. Automatic
  reload and chat reconnection do not repeat an unprepared transport test.
- Explicit Connect and test validates/saves the key, runs the existing temporary
  transport test when needed, confirms cleanup and marks the connection prepared.
  Cost/transmission guidance appears before the action. No chat is activated or
  uploaded by setup. An interrupted test exposes cleanup and Run setup test.
- Opening Advanced > Frozen memory snapshots, switching the selected chat while
  it is open, or reconnecting refreshes availability. Matching in-flight reads are
  shared, and late results for an old chat/story/client cannot replace the list.
  Automatic reads keep errors in the list and do not take over reply progress,
  synchronize chats, upload documents or generate answers. Refresh stays available.
- Snapshot rename/delete and remote-memory deletion use native input/confirmation
  popups. Only an affirmative result authorizes deletion. Cancellation is inert,
  and the captured target is revalidated after the asynchronous popup.

## Private memory

With **Private memory**, your chat text is not stored in LambdaDB, only vectors.
Choose a preset or custom model, the endpoint URL and an optional key, then
**Test and save**: one short embedding request that records the vector
dimension and saves the settings. The **Private memory** switch is available
once a test has succeeded; for an Ollama preset, settings show the
`ollama pull` command for its model.

New stories follow the setting. Turning it on pauses existing standard stories
until you rebuild them; private stories keep working if you turn it off. A
paused story, or a private story whose embedding model, prefixes or dimension
differ from the tested settings, stops with an explicit error and shows only
**Rebuild story memory** and **Turn memory off in this chat** in its Memory
panel. Rebuilding recreates the story in the current mode. Turning Private
memory off again resumes a paused standard story, and restoring the earlier
embedding settings with **Test and save** resumes a private story. A private story that keeps working with the setting off
also offers **Rebuild story memory** to switch it to standard memory. The Memory
panel shows **Private** for a private story, for example
`Memory · Ready · Private`. Settings show the endpoint in use and mark unsaved
edits; requests keep using the saved endpoint until **Test and save** succeeds. See [Private memory](private-memory.md).

A local Ollama on the same computer as the browser needs no setup: its default
origins allow `http://localhost:*` and `http://127.0.0.1:*`. To open SillyTavern
from another device, such as a phone, the browser calls Ollama on the Ollama
computer:

1. Use that computer's LAN address as the endpoint, for example
   `http://192.168.0.10:11434/v1`. On the phone, `localhost` is the phone.
2. Start Ollama with `OLLAMA_HOST=0.0.0.0` so it accepts network requests.
3. Set `OLLAMA_ORIGINS` to the SillyTavern origin you open, for example
   `http://192.168.0.10:8000`.

A SillyTavern page served over HTTPS cannot call a plain `http://` endpoint;
browsers block it as mixed content.

## Validation boundaries

Source inspection, unit checks and pinned-host/emulator checks are distinct from
live-provider or installation acceptance. Detailed local run artifacts are ignored
and are not CI dependencies or fresh-clone downloads.

## Completed validation

Validated on Node.js 24.15.0, Chromium 153.0.8010.12 and SillyTavern 1.19.0
at `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, from develop baseline
`5310672bd0e95759786ce2bb1a3a47ed07777e09`.

- `npm test`: 420 passed.
- `npm run check`, `npm run check:release`, `npm run check:sdk` and staged diff
  checks passed. Version remains 0.6.1 Unreleased.
- `node --check` for `scripts/*.mjs`, `tests/*.js` and `benchmark/*/*.mjs`:
  164 files passed.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 32 passed.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_TEST_PORT=18130 SM_ARTIFACT_TAG=setup-recovery-final npm run test:browser`:
  227 assertions passed.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_TEST_PORT=18131 SM_ARTIFACT_TAG=setup-recovery-final-faults npm run test:recovery`:
  247 assertions passed, including two host restarts and 24 recovery cycles.
- `ST_SOURCE=/tmp/sillymemory-native-workflow-host ST_DELIVERY_PORT=18136 node scripts/prompt-delivery-smoke.mjs artifacts/setup-recovery-prompt-delivery/report.json`:
  18 final-prompt delivery cases passed with controlled native completions.

The browser checks exercise combined setup and failed-test cleanup, saved-key
chat recovery without unsaved form edits or duplicate requests, rejected-key
removal, visible-only automatic lists, shared in-flight reads, local list failures
and explicit refresh recovery, native rename/cancel/Escape, changed-chat deletion
rejection, and late old-story list rejection. Existing native checkpoint/branch,
per-chat preference, source retention, retrieval and response-format regressions
remain covered. Every final report matches its recorded runtime/harness hashes
and has zero browser errors, proxy requests and remaining emulator collections.
The chat reconnect and automatically refreshed snapshot screenshots were opened
and visually checked.

Detailed reports, logs and screenshots are retained locally under the directories
below. SHA-256 values identify the reports; their `sourceSha256` records identify
the producing sources. Earlier `artifacts/setup-recovery-*/` attempts are retained,
including fixture corrections for per-chat activation and asynchronous toggle/list
completion. They are not counted as final passing runs.

| Local report under `artifacts/` | SHA-256 |
| --- | --- |
| `setup-recovery-final/browser-smoke-setup-recovery-final.json` | `cb3128ab2a4152f669b45a95d34ade800cc4be7e6502ee21718cc0dd8a8a42ea` |
| `setup-recovery-final-faults/recovery-smoke-setup-recovery-final-faults.json` | `63d722f48d843a4b97d12e86d7edc38f68e310edaa6c4373f213dc5208c9a74f` |
| `setup-recovery-prompt-delivery/report.json` | `daabbea99674918d2daf4a193af88ecd45a7a9e599baba68f969b2552a5be8e1` |
| `setup-recovery-cleanup/browser-smoke-setup-recovery-cleanup.json` | `7b8287a9b5529ff19a837332859d51a0f18c4bca2bc9d41efc2aa332040782b7` |

Cleanup after `447e15e` passed the same unit (420), Python (32), development-tool
syntax (164), runtime, release and SDK checks again. Repeating the browser command
with `SM_ARTIFACT_TAG=setup-recovery-cleanup` passed 227 assertions with matching
producer hashes, zero browser errors/proxy requests and no remaining collections.
The original recovery and delivery reports retain their original producer hashes;
those suites and paid/live runners were not rerun for this readability cleanup.
The live runner's failure-cleanup deletion also uses the native-popup helper;
its syntax and shared-helper browser coverage passed, but live cleanup was not run.

These ignored local artifacts are not available in a fresh clone or used by CI.
Other maintained paid/live runners were adapted to combined setup and native
popups and syntax checked, but were not run. No real LambdaDB/OpenAI requests,
installation/update acceptance, answer-quality claim, main promotion, release or
deployment is part of this change. Retrieval policy, credential storage, ownership,
resource limits and native generation formats remain unchanged.
