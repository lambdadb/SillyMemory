# Changelog

Versions describe the extension, independently of the SillyTavern host version.
An `Unreleased` entry is a development candidate. A dated entry records a release
boundary; publication is confirmed by the corresponding Git tag and GitHub Release.

## [0.7.0] - 2026-10-22

### Changed

- Reconnect from the chat panel with the scoped saved key, preserving per-chat
  activation and ignoring unsaved connection form edits.
- Combine initial connection and temporary transport preparation into **Connect
  and prepare**, with usage guidance and separate per-chat activation.
- Refresh visible frozen snapshot lists on opening, chat changes and reconnection;
  keep automatic errors local to the list and discard stale results.
- Use native SillyTavern input/confirmation popups for snapshot management and
  remote deletion, with cancellation and target revalidation before changes.
- Show existing host input-token estimates and prepared memory size, with an
  optional local dialogue-text comparison that distinguishes its reference from
  native memory-off prompts and billing.
- Let users turn prepared memory on and off directly from the chat panel through
  saved native chat metadata. Each chat has its own on/off preference; settings
  manage the shared LambdaDB connection without a global memory switch.
- Preview selected memory in the expanded chat panel with source coordinates,
  short excerpts and a shortcut to the full last-prompt memory inspector.
- Use green for ready/verified memory, orange for work in progress, yellow for
  warnings and red for errors, independently of the theme's quote color.
- Follow SillyTavern's native chat history, checkpoint and branch workflow in the
  basic panel. Move optional frozen memory snapshots under Advanced and link to
  the native chat list from the chat-facing Memory panel. New frozen snapshots
  retain a native parent link back to their actual source conversation.
- Preserve the memory enabled preference during frozen snapshot save/resume,
  show operation progress, and automatically synchronize the writable chat after
  success. An explicitly disabled preference stays off.
- Treat native forks of frozen snapshots as writable paths while keeping the
  original snapshot protected. Stop generation explicitly while a manual memory
  operation is in progress instead of silently skipping enabled memory.
- Normalize writable snapshot forks before saving another snapshot even with
  memory off. Canceled snapshot rename/delete actions clear preparation without
  scheduling follow-up synchronization.
- Keep scheduled synchronization pending during slow manual work without
  leaving stale progress or overwriting a newer failure.

### Update behavior and limits

- Memory activation is now saved per chat. Chats without an explicit saved
  on/off choice start off; the former global switch does not activate every chat.
  After updating, open each desired chat and use **Turn memory on in this chat**.
- Keep the 0.6.0 storage/index formats, retrieval policy, SDK and native generation
  formats. Remain experimental on pinned SillyTavern 1.19.0 and Chromium; token
  estimates are not billing or provider-receipt measurements.

## [0.6.0] - 2026-10-21

### Added

- Show a collapsible memory status above the native message composer, with
  operation progress, final-prompt verification and relevant recovery actions.
  Distinguish readiness from verified delivery, unsupported chats, checkpoints
  and conflicting built-in Vector Storage chat vectorization.
- Offer explicit synchronization recovery and a native Regenerate shortcut for
  an unchanged pending user turn. Revalidate source, chat and host activity;
  never retry generation automatically or change another extension's settings.
- Publish bounded LongMemEval and BEAM reproduction profiles, protocol tests,
  results and cost/operational reference documentation. These development tools
  are separate from the installed extension's runtime.

### Changed

- Guide setup through connection, preparation and activation. Prepare chat memory
  runs the existing synthetic transport gate when needed and exposes temporary
  test cleanup without opening Advanced. Collapse credentials after connection;
  keep advanced limits and checkpoint controls available in native settings.
- Keep Query1, managed embeddings/reranking, collection/index formats, native
  response formats, prompt guidance and token limits unchanged from 0.5.0.

### Scope and limitations

- Remain experimental on pinned SillyTavern 1.19.0 and Chromium. Final-prompt
  verification is not an answer-quality or provider-receipt guarantee.
- No new storage migration step is introduced relative to 0.5.0. Its existing
  index requirements still apply to older experimental collections. Automatic
  extension updates remain disabled.
- See [release notes](docs/releases/0.6.0.md) and the separate
  [installation/update acceptance](docs/releases/0.6.0-validation.md).

## [0.5.0] - 2026-10-20

### Changed

- Search only the current eligible generation anchor in one role-labelled request
  (Query1). Keep recent dialogue in generation, with the existing recent-five/pair
  retention and aged-out archival policy.
- Increase vector k and native Jev 1.13.0 rerank candidates from 100 to 200; keep
  final 50, managed OpenAI Small, English Bayesian fusion and the 4,096-token
  maximum with the host one-quarter-context cap. Pin the tested LambdaDB SDK
  `0.8.1-dev.38730896042001` and its browser bundle for candidate-200 support.
- Admit valid memory in retrieval order using its final separate/assembled size,
  then present selected sources chronologically. Deliver older excerpts as one
  labelled, quoted user-context archive, retaining source coordinates and native
  recent-message roles. Budget archive framing and time guidance as well as text.
- Give native reranking source role and verified host-time context alongside the
  original text. Embedding and English full-text inputs remain the original text.
  New role/time keyword indexes require fresh owned collections or an explicit
  rebuild of older experimental collections; there is no automatic migration.
- Refine guidance for supported personalized answers and event/role matches.
  Clarification remains possible without a blanket follow-up obligation. Host
  timestamps are not event dates, and UTC alone does not establish local dates.

### Scope and limitations

- Remain experimental on pinned SillyTavern 1.19.0 and Chromium. Native response
  formats/streaming, direct CORS, credential scope and explicit failure handling
  remain unchanged. Automatic updates remain disabled.
- Large embeddings, retrievalText enrichment, larger memory budgets and generated
  summaries are not promoted. Historical benchmark results are bounded development
  evidence, not a new release score or a guarantee of answer correctness.
- See [release notes](docs/releases/0.5.0.md) for storage compatibility and the
  separate [acceptance record](docs/releases/0.5.0-validation.md).

## [0.4.0] - 2026-10-13

### Added

- Search the two most recent eligible messages through the generation anchor in
  one role-labelled request.
  Align the recent-five boundary to an adjacent eligible input/reply pair, keeping
  six after a reply and five at a normal new input. Archive the displaced pair in
  one upsert when its chunks fit the existing 50-document batch; no five-message
  queue or combined-pair documents. Recent edits wait until
  displacement; archived edits/deletions reconcile immediately. Checkpoints retain
  full completed-history synchronization. Large chunks, edits and retries can still require additional writes.

- Preserve native plain replies and streaming without a forced reply schema or
  request-status flags. Natural memory guidance asks brief clarifying questions
  for ambiguous intent and explains missing/conflicting evidence without invention.
  Remove accumulated clarification spans, reply decoding, recovery markers and
  the schema-support toggle. Long clarification dialogues rely on the recent
  window and retrieval. Memory preparation failures stop generation explicitly;
  disabling memory restores native full-history behavior.

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

- Keep at least five recent eligible messages without splitting an eligible
  input/reply pair, and archive older completed source.
  Search two recent eligible messages in one query. Exclude retained positions and replacement answers before
  both search legs and local selection. Continue anchors on the message being
  extended; pending final user inputs are not indexed. Reject retrieval input
  above 8 KiB without silent truncation.
- Retire npm aliases for historical fixed-window answer evaluations; preserve
  protocols/results with explicit recorded-checkout reproduction instructions.
- Keep at least five recent eligible messages including the active input in native roles
  and source order, plus recalled
  memory alongside native character/system settings, including when no memory fits.
  This prevents ordinary follow-ups from depending on successful retrieval of the
  preceding exchange. The window is fixed without a new configuration option;
  the two-message query and aged-out storage policies are described above. Continue preserves
  the partial answer, and Impersonate preserves the character response being
  answered; memory preparation failures abort explicitly.
- Add budgeted system guidance to ask a brief clarification for ambiguous intent
  or referents, and state insufficient evidence for clear but unsupported requests.
  Verify final delivery even when no memory is selected; count guidance in the
  prepared token display for empty selections as well.

- Use Bayesian vector/English-text fusion with managed Typesafe Jev reranking and
  vector k=100, at most 100 rerank candidates, a final return limit of 50 chunks
  and a 4,096-token initial memory budget. Keep the 4,096-token maximum and host
  one-quarter-context cap. Saved explicit user budgets remain respected. Reject
  unconfirmed reranking instead of silently injecting fallback results.
  Preserve boundary-aware per-message chunks and the dedicated saved-key scope.

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

### Fixed

- Keep generation preparation failures visible in the last-prompt status after
  native generation-ended background synchronization, including transient search
  errors. Preserve the submitted input and direct generation recovery to Regenerate,
  while background synchronization keeps its Sync guidance.

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
