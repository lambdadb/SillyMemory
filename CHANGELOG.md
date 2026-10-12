# Changelog

Versions describe the extension, independently of the SillyTavern host version.
An `Unreleased` entry is a development candidate. A dated entry records a release
boundary; publication is confirmed by the corresponding Git tag and GitHub Release.

## [0.4.0] - Unreleased

### Added

- Enable clarification continuity by default. The answer's JSON status opens a
  pending span only for ambiguous user intent/referents, then searches and retains
  its complete user/assistant dialogue until answered or insufficient evidence.
  Use only the current retrieval's memory, excluding already-retained full turns
  from both remote search legs and local budgeting. Skip search when the pending
  request starts at the first message, while still synchronizing completed history. No extra model or retrieval call is added. Bind state to the
  selected native reply and source signature across reload/swipe/branch copies;
  invalidate stale boundaries after edits/deletions. Hide streaming JSON, recover
  interrupted replies conservatively, omit incomplete protocol placeholders from
  later prompts, tolerate a reply deleted before deferred recovery, and reject
  conflicting schemas/tools. Recover already-open chats at initialization, and
  validate asynchronous completion before changing native reply text or status.
  Keep non-streaming recovery markers too, and bind only to the actual plain-user
  generation target instead of an older eligible turn for blank/special inputs.
  Preserve newer request state when older searches fail or preparation is canceled.
  Recover stale marker positions as visible incomplete notices without stale roots;
  keep streams bound to their original reply and preserve re-authored user text.
  Requires schema-capable Chat Completions; an explicit checkbox disables it.

- Save a verified project key in a dedicated account/endpoint/project-bound browser
  record and reconnect automatically after reload. Restore the previous memory
  enabled/disabled state only after a bounded authenticated read. Remove rejected restored
  keys, preserve the prior key on candidate validation failure, and disable memory; Forget key removes browser and runtime credentials.
  Browser persistence is disclosed before saving and is not an isolated secret vault.

- Store available UTC host-message provenance on every chunk, separately from
  embedding text. Budget the complete excerpt and date together; reject stale or
  mismatched remote dates. Missing dates remain unknown, and host time is explicitly
  distinguished from story/event dates. Timestamp edits update document revisions.

### Changed

- Assemble selected chunks from the same message/revision under one provenance
  header. Join touching or exactly matching overlaps, mark missing intervals,
  preserve repeated-text citations and all previously selected sources, and refill
  saved space in search order within the unchanged budget. No LLM processing or
  extra retrieval is added; malformed coordinates retain separate excerpts.

- Index all completed eligible conversation messages independently of generation input
  retention, and ordinarily retrieve using only the current question; pending clarifications use their complete dialogue. Exclude the active input and replacement answers
  from both search legs and local selection. Continue searches the message being
  extended; pending final user inputs wait for a reply before indexing. Reject
  retrieval inputs above 8 KiB without silent truncation.
- Retire npm aliases for historical fixed-window answer evaluations; preserve
  protocols/results with explicit recorded-checkout reproduction instructions.
- Remove the fixed recent-message window and its setting. Successful generation
  preparation keeps the active input or pending dialogue and recalled memory alongside native
  character/system settings, including when no memory fits. Continue preserves
  the partial answer, and Impersonate preserves the character response being
  answered; continuity failures abort, while the disabled-continuity fallback retains the original prompt.
- Add budgeted system guidance to ask a brief clarification for ambiguous intent
  or referents, and state insufficient evidence for clear but unsupported requests.
  Verify final delivery even when no memory is selected; count guidance in the
  prepared token display for empty selections as well.

- Use Bayesian vector/English-text fusion with managed Typesafe Jev reranking and
  vector k=100, at most 100 rerank candidates, a final return limit of 50 chunks
  and a 4,096-token initial memory budget. Keep the 4,096-token maximum and host
  one-quarter-context cap. Saved explicit user budgets remain respected. Reject
  unconfirmed reranking instead of silently injecting fallback results.
  Preserve boundary-aware per-message chunks and session-only project keys.

- Use the official LambdaDB TypeScript SDK 0.8.0 through a pinned browser bundle.
  Preserve direct CORS, cancellation, safe errors and explicit
  retry/inline-result policies; Git URL installation needs no user build step.

- Story collections and isolated chat branches are now the only memory storage
  model. Enabling a fresh chat persists its complete story identity before any
  remote request; native forks automatically reuse committed history.
- Removed the opt-in conversion button, per-chat/shared collection paths and
  previous-release upgrade adapter. This experimental project has no installed
  user data to migrate; unsupported metadata fails safely without conversion.
- Checkpoints remain explicitly saved and resumed. Managed
  embeddings, current-source validation and scoped cleanup remain unchanged.
- Fresh installation and current story lifecycle checks replace the historical
  upgrade compatibility test. Original experiment evidence is retained.

## [0.3.0] - 2026-10-04

### Added

- Opt-in versioned story memory: one LambdaDB collection per story family and a
  writable branch per native chat path. Unchanged committed history is inherited
  without resubmitting documents, including after reload.
- Remote reconciliation removes future/deleted/changed chunks from the selected
  branch; current-chat deletion preserves its parent and siblings. All-owned
  cleanup includes versioned story collections.
- Save a native transcript/swipe checkpoint with a retained LambdaDB branch;
  verify and resume it into independent new chats. Interrupted pending preparation
  can be retried; altered transcripts or remote snapshots are rejected.

- A current-story checkpoint manager with names, creation times, verified local/remote
  states, pending retry, resume, rename and individually scoped deletion.

### Changed

- Confirm ordered branch commits using a session-known final write, avoiding
  repeated full source reads. Reload, uncertain writes, deletion-only sync and
  already-visible old values retain full checks; checkpoint contents are still
  verified in full before readiness.

### Fixed

- Reject edits made during pending checkpoint preparation before readiness writes,
  and protect the final host write with a short UI lock and saved-file recheck.
- Recover ambiguous resume saves through a durable browser intent, reusing the
  unchanged target after reload without overwriting an existing edited path.

### Requirements and limits

- Existing chats keep per-chat collections until **Use versioned memory for this
  story** is selected. The first sync builds new managed memory; old collections
  remain for explicit all-owned cleanup. Keys still clear on reload.
- Forks may wait for acknowledged source documents to commit. Retrieval continues
  to use direct-branch consistent reads and validation against local history.
- Validated on SillyTavern 1.19.0 with synthetic managed-memory lifecycle cases.
  Bounded 1,000-message reuse timings are recorded; no latency guarantee, new
  answer-quality result or multi-device writer support is claimed.
  Checkpoints cover chat state, not character cards or external/global state.
  Version 0.2.0 cannot manage the new layout; see [usage, evidence and rollback](docs/versioned-memory.md).

## [0.2.0] - 2026-10-03

### Added

- Separate owned collection per character chat/native branch, rename-stable chat
  identity, duplicate-chat isolation and current-chat remote deletion. All-owned
  cleanup discovers tagged collections after browser bookkeeping loss.

- Final host-prompt verification and **Stop on missing context**, enabled by
  default. Missing recalled passages or verifiable recent messages stop the
  completion request. Users can adjust context settings and retry explicitly,
  or turn the option off to proceed with a visible warning.
- Repeated passage packing: identical selected text from the same speaker/role
  shares one body with every selected source coordinate. Saved tokens admit
  distinct retrieved context without evicting existing selected sources.

### Changed

- Memory API requests go directly from the browser to LambdaDB over HTTPS/CORS,
  omitting cookies and host CSRF headers. No SillyTavern proxy setting or restart
  is required. Configure LambdaDB access for the page origin where needed; see
  [transport requirements and validation](docs/direct-cors.md).

- Long-message indexing prefers paragraph/sentence/word boundaries within the
  800-code-point ceiling. Exact offsets and layout-specific document IDs keep
  reindexing and stale-result rejection safe. No overlap or budget change.

- Recalled excerpts preserve native user/assistant roles and literal macro text.
- Retrieval searches the latest anchor and a separate contextual turn, including
  assistant context when no prior user turn exists or its local historical match
  is stronger. Continue generation follows the message being extended.
- Overlapping prompt assembly cannot consume another generation's verification.
  If another extension prevents a reserved final event, reload resets the slot.

### Fixed

- Final-prompt verification no longer accepts an arbitrary substring of another
  same-role message as a delivered turn. Known speaker prefixes and line-separated
  injections remain supported; missing short turns stop generation by default.

### Validation and limits

- A historical 64-answer actual-host run used live LambdaDB managed embeddings and
  the fixed OpenAI generation model, with zero service failures/retries and
  verified cleanup. Provisional scores were off 4/32 and on 30/32; all 28
  known-answer on samples received complete required evidence.
- Two Korean quotation answers still omitted the author despite source delivery.
  Guidance candidates did not reliably fix this and were not adopted.
  Actor-attribution reliability and independent human review remain open.
- Updating from 0.1.0 rebuilds opened chats from local history into new per-chat
  collections, consuming managed embedding/storage usage. The old shared
  collection remains available for all-owned cleanup; it is not migrated or
  deleted automatically. No separate embedding-provider setup is needed.
- Updating requires reload, key re-entry and re-enabling memory. SillyTavern
  1.19.0 remains the only validated host version; this is not a stable release.
  See [update/rollback notes](docs/releases/0.2.0.md) and the separate
  [installation/lifecycle validation](docs/releases/0.2.0-validation.md).

## [0.1.0] - 2026-09-28

### Added

- Long-term memory for individual SillyTavern character chats using LambdaDB
  managed embeddings and the built-in CORS proxy. No server plugin is required.
- Synchronization after generation, edits, swipes, deletion and reload, with
  isolation across characters, chats and native branches.
- Recent-message preservation, bounded memory injection, explicit continuation
  retrieval, memory inspection, disable and owned remote-data deletion controls.
- Session-only API keys and synchronization progress/recovery guidance.

### Requirements and limits

- Experimental initial release candidate; tested against SillyTavern 1.19.0.
- Enable `enableCorsProxy: true` and restart the host. A LambdaDB project and
  managed embedding usage are required. Reload clears the key and disables memory.
- One active extension tab per browser profile. Group chats, files, tool messages,
  Data Bank, World Info and other prompt-rewriting memory extensions are excluded.
- Synthetic live recall and bounded host-restart/repetition checks pass; realistic
  long-duration use, multiple devices and live-service outage recovery are unverified.
- Chat/character renames, complete chat deletion or uninstall can retain remote
  scopes. Use the owned-data deletion controls before uninstalling.
