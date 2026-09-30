# Changelog

Versions describe the extension, independently of the SillyTavern host version.
An `Unreleased` entry is a development candidate. A dated entry records a release
boundary; publication is confirmed by the corresponding Git tag and GitHub Release.

## [0.2.0] - Unreleased

### Added

- Final host-prompt verification and **Stop on missing context**, enabled by
  default. Missing recalled passages or verifiable recent messages stop the
  completion request. Users can adjust context settings and retry explicitly,
  or turn the option off to proceed with a visible warning.
- Repeated passage packing: identical selected text from the same speaker/role
  shares one body with every selected source coordinate. Saved tokens admit
  distinct retrieved context without evicting existing selected sources.

### Changed

- Recalled excerpts preserve native user/assistant roles and literal macro text.
- Retrieval searches the latest anchor and a separate contextual turn, including
  assistant context when no prior user turn exists or its local historical match
  is stronger. Continue generation follows the message being extended.
- Overlapping prompt assembly cannot consume another generation's verification.
  If another extension prevents a reserved final event, reload resets the slot.

### Validation and limits

- A complete 64-answer actual-host run used live LambdaDB managed embeddings and
  the fixed OpenAI generation model, with zero service failures/retries and
  verified cleanup. Provisional scores were off 4/32 and on 30/32; all 28
  known-answer on samples received complete required evidence.
- Two Korean quotation answers still omitted the author despite source delivery.
  Guidance candidates did not reliably fix this and were not adopted.
  Actor-attribution reliability and independent human review remain open.
- No collection migration or new embedding-provider setup. Updating requires
  reload, key re-entry and re-enabling memory. SillyTavern 1.19.0 remains the
  only validated host version; this is not a stable release.

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
