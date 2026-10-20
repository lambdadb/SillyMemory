# SillyMemory

Long-term memory for SillyTavern. **Powered by LambdaDB.**

SillyMemory recalls relevant passages from older conversations while keeping recent
messages in order. It works as a SillyTavern UI extension, with managed embeddings
and reranking provided by LambdaDB. No separate embedding-provider key, server
plugin, or build step is needed.

[**0.4.0 — experimental pre-release**](https://github.com/lambdadb/SillyMemory/releases/tag/v0.4.0)
is available on `main`. Start with a test chat; broader model/browser compatibility
and answer quality are still being evaluated.
The [0.5.0 candidate](docs/releases/0.5.0.md) is being prepared on development
branches; it is not yet the public installation baseline.

## Before you start

- **SillyTavern 1.19.0** with Git installed on its host, served on localhost or
  HTTPS. Chromium is the tested browser; other host versions/browsers are unverified.
- A working chat model connection in SillyTavern. SillyMemory uses your existing
  model settings and native replies/streaming; it does not provide a chat model.
- A **LambdaDB project** and its regional HTTPS endpoint, project name and project
  API key. The key needs collection, document and branch access.

You can start with [LambdaDB's Free plan](https://lambdadb.ai/pricing), with no
credit card required. [Create an account](https://app.lambdadb.ai/) and a project;
usage must stay within the plan's included limits. Your chat model provider's
charges are separate. No manual CORS allowlist or SillyTavern proxy setup is part
of the normal installation.

## Install

1. In SillyTavern, open **Extensions → Install extension** and paste:

   ```text
   https://github.com/lambdadb/SillyMemory
   ```

   Leave the branch/tag field empty to follow `main`. Choose **Install just for
   me** (or **Install** for a non-admin account) and confirm the third-party
   extension prompt. Do not install a second copy.
2. Reload the page and open **Extensions → SillyMemory**.
3. Fill in the connection fields from your LambdaDB project:

   | Field | Value |
   | --- | --- |
   | Regional HTTPS endpoint | The regional base URL, such as `https://<regional-host>`, without `/projects/...`. |
   | Project name | Your LambdaDB project name. |
   | Project API key | Your LambdaDB project key, not your chat model's key. |

4. Click **Save and connect**. This verifies the key and saves it in this browser
   for automatic reconnection. Other extensions on the same page can access
   browser storage; it is not an isolated secret vault.
5. Click **Test synthetic upsert / query / delete**. Wait for the test to pass.
   It creates temporary test data and deletes it afterward, using your LambdaDB
   allowance. If it fails, use **Clean up test collection** before retrying.
6. Click **Prepare chat memory**, open a saved character chat, and check
   **Enable memory (isolated chat history)**. Wait for synchronization before
   sending a message. Turn off built-in Vector Storage chat vectorization and
   other extensions that rewrite chat history.

No npm commands, proxy setting, or SillyTavern server restart are needed.

## Use and behavior

Chat normally. SillyMemory archives older completed messages and recalls relevant
passages before each reply. It retains at least five recent eligible messages,
keeping an adjacent user/reply pair together. Search uses only the current eligible
message; recent dialogue still accompanies recalled memory in the generation prompt.
Edits, swipes and deletions are reconciled against the current chat.
Your original chat file stays intact.

- Open **Memory in the last prompt** to inspect the prepared excerpts. Check the
  delivery status for whether the final host prompt was verified.
- The default **Memory token budget** is 4,096 tokens, capped at one quarter of
  the host context. Recent messages and character instructions also need room;
  SillyTavern can still trim the final prompt to its context limit.
- Uncheck **Enable memory** to return to ordinary SillyTavern history handling.
  This stops memory use but keeps remote data.
- Reload reconnects using the saved key and restores the previous enabled state
  after verification. **Forget key** removes the saved key and disables memory.
- Native story branches keep separate memory paths. Optional **Save / finish
  checkpoint** and **Refresh story checkpoints** controls let you preserve and
  resume a story state. See the [checkpoint guide](docs/checkpoints.md).

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Connection or authentication failure | Check the regional endpoint/project/key, then use **Save and connect**. For network errors, check browser connectivity to LambdaDB. |
| Failed connection test | Use **Clean up test collection**, then retry the test. Keep pending cleanup records until it succeeds. |
| Synchronization failure | Follow the status message; wait before retrying a temporary service error, then use **Sync this chat**. |
| Generation stopped during memory preparation | Read the last-prompt status, resolve the error, then use **Regenerate** for the pending input. Sync alone does not resume a stopped generation. Disable memory if you want to continue with native history. |
| Query exceeds 8 KiB | Shorten the latest messages, or disable memory for that generation. Queries are not silently truncated. |

## Data, usage, and cleanup

Older chat excerpts, speaker/time metadata and retrieval queries go directly from
your browser to LambdaDB. Text and queries are also processed by its managed
embedding/reranking providers. Storage, writes, searches and inference consume
plan allowance; see [LambdaDB pricing](https://lambdadb.ai/pricing). The extension
itself is open source, but connected services are not unlimited free resources.

Before uninstalling or changing connection settings, use **Delete all owned remote
memory** and clean up any pending test collection. **Delete this chat’s remote
memory** removes only that chat's writable branch; sibling branches remain.
These controls keep local SillyTavern chats. Deleting a native chat or uninstalling
the extension does **not** automatically remove its remote data. Snapshot retention
and provider backups are separate from deletion of current records. See
[storage and recovery](docs/versioned-memory.md) and [saved connections](docs/saved-connection.md).

## Current limits

- Experimental: successful retrieval does not guarantee a correct answer.
- Live reply/streaming validation covers Sol on the supported host and Chromium;
  other generation providers, including Claude, are not yet certified.
- Plain-text, single-character chats are the supported path. Group chats, files,
  tool messages, Data Bank and World Info integration are outside this release.
- Use one active SillyMemory tab per browser profile. Concurrent writers from
  different devices are unsupported.
- Final prompt delivery is checked for Chat Completion. Other completion formats
  can report verification unavailable. Long clarification exchanges may outgrow
  the recent-message window.

## Version and updates

Install from `main` for the public version; `develop` and topic branches are for
development. In **Extensions → Manage extensions**, use SillyMemory's **Update**
button and reload. Updates follow the installed Git branch, not the newest release
tag. Automatic updates are disabled. Normal updates preserve settings and ownership;
do not delete remote memory just to update.

See [release notes](docs/releases/0.4.0.md), [CHANGELOG](CHANGELOG.md),
[installation validation](docs/releases/0.4.0-validation.md) and
[live reply validation](docs/native-reply-validation.md) for measured scope and limitations.

## Development and verification

See [CONTRIBUTING](CONTRIBUTING.md) for development and validation commands,
[architecture](docs/architecture.md) for implementation details, and the
[development and evaluation reference](docs/development.md) for test entry points
and historical results. [Evidence retention](docs/evidence-retention.md) tracks
preserved runs. Historical scores describe their recorded settings, not a current
accuracy guarantee.

## License

Copyright (C) 2026 SillyMemory contributors.
Licensed under [GNU AGPL-3.0-only](LICENSE), without warranty.
Bundled dependencies retain their [third-party licenses](vendor/LICENSES.txt).
