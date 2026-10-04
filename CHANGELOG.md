# Changelog

Versions describe the extension, independently of the SillyTavern host version.
An `Unreleased` entry is a development candidate. A dated entry records a release
boundary; publication is confirmed by the corresponding Git tag and GitHub Release.

## [0.4.0] - Unreleased

### Changed

- Story collections and isolated chat branches are now the only memory storage
  model. Enabling a fresh chat persists its complete story identity before any
  remote request; native forks automatically reuse committed history.
- Removed the opt-in conversion button, per-chat/shared collection paths and
  previous-release upgrade adapter. This experimental project has no installed
  user data to migrate; unsupported metadata fails safely without conversion.
- Checkpoints remain explicitly saved and resumed. Session-only keys, managed
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
