# SillyMemory

Long-term memory for SillyTavern. **Powered by LambdaDB.**

SillyMemory recalls relevant passages from older conversations while keeping recent
messages in order. It works as a SillyTavern UI extension, with managed embeddings
and reranking provided by LambdaDB. No separate embedding-provider key, server
plugin, or build step is needed.

**Experimental pre-release.** Start with a test chat; broader model/browser
compatibility and answer quality are still being evaluated. See the
[0.6.0 release boundary](docs/releases/0.6.0.md) for prepared changes and
[GitHub Releases](https://github.com/lambdadb/SillyMemory/releases) for published
versions. `main` is the public installation baseline; dated development notes
alone do not establish publication.

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
   browser storage; it is not an isolated secret vault. After verification,
   **Connection** collapses to show the connected project. Reopen it to edit
   connection details or use **Forget key**.
5. Click **Prepare chat memory**. It runs the required connection test with
   temporary data and verifies cleanup, using your LambdaDB allowance. Your chat
   is not uploaded by this step. If a test collection needs cleanup, use the
   **Clean up test data** button beside the status before retrying.
6. Open a saved character chat and check **Enable memory**. Wait for synchronization
   before sending a message. Turn off built-in Vector Storage chat vectorization
   and other extensions that rewrite chat history.

The basic panel shows the next setup action: connect, prepare, then enable.
Once ready, the memory switch and status remain visible; connection details stay
collapsed after successful verification, including reconnection after reload.
Use SillyTavern's existing chat history, **Save checkpoint** and **Create Branch**
controls. Memory follows the selected chat without changing your enabled preference.
**Advanced** holds memory limits, diagnostic tools, prompt inspection, remote cleanup
and optional **Frozen memory snapshots**. Advanced controls start collapsed;
existing saved settings are preserved.

No npm commands, proxy setting, or SillyTavern server restart are needed.

## Use and behavior

Chat normally. SillyMemory archives older completed messages and recalls relevant
passages before each reply. It retains at least five recent eligible messages,
keeping an adjacent user/reply pair together. Search uses only the current eligible
message; recent dialogue still accompanies recalled memory in the generation prompt.
Edits, swipes and deletions are reconciled against the current chat.
Your original chat file stays intact.

- Open **Memory** above the message composer for current status and recovery
  actions. **Ready** means the chat can use memory; **Last prompt verified** means
  the final host prompt passed the delivery check. It does not guarantee answer
  correctness. **Chat history** opens SillyTavern's existing chat list so you can
  return to the original conversation. **SillyMemory settings** opens the native extension drawer.
- SillyMemory connects directly to LambdaDB and does not depend on built-in Vector
  Storage. Its chat vectorization must be off to avoid conflicting history injection;
  the chat status links to its settings without changing them.
- Open **Advanced → Memory in the last prompt** to inspect the prepared excerpts.
  Check the delivery status for whether the final host prompt was verified.
- Under **Advanced**, the default **Memory token budget** is 4,096 tokens, capped
  at one quarter of the host context. Recent messages and character instructions also need room;
  SillyTavern can still trim the final prompt to its context limit.
- Uncheck **Enable memory** to return to ordinary SillyTavern history handling.
  Continue the same chat: the original transcript is preserved, and the next
  generation uses the host’s existing context limits and settings without
  SillyMemory retrieval. Saved remote memory is kept; other extensions’ settings
  are not changed.
- Reload reconnects using the saved key and restores the previous enabled state
  after verification. **Connection → Forget key** removes the saved key and disables memory.
- Use the native **Save checkpoint**, **Create Branch**, **Back to parent chat**
  and **Manage chat files** controls as usual. With memory enabled, opening a
  checkpoint or branch automatically prepares its separate memory path from that
  chat's transcript; later messages from another path are excluded. Preparation
  can take time and consume embedding allowance. Native checkpoint saving does
  not freeze a remote memory snapshot at the moment you click Save.
- **Advanced → Frozen memory snapshots** additionally binds a saved transcript
  to verified remote memory. This optional feature has separate save/resume controls.
  Saving or resuming preserves your memory preference and shows operation progress;
  an enabled writable chat synchronizes automatically after success. See the
  [snapshot guide](docs/checkpoints.md) and [native workflow validation](docs/native-chat-workflow.md).

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Connection or authentication failure | Check the regional endpoint/project/key, then use **Save and connect**. For network errors, check browser connectivity to LambdaDB. |
| Failed connection test | Use **Clean up test data** beside the status, then retry **Prepare chat memory**. The diagnostic cleanup control also remains under **Advanced**. Keep pending cleanup records until it succeeds. |
| Synchronization failure | Follow the status message; wait before retrying a temporary service error, then use **Retry synchronization** beside the status. **Advanced → Sync this chat** remains available for manual synchronization. |
| Generation stopped during memory preparation | Read the last-prompt status, resolve the error, then use **Retry reply** above the composer for an unchanged pending user input, or the native **Regenerate** action. The shortcut uses native regeneration and makes a new model request; it never retries automatically. Sync alone does not resume a stopped generation. Disable memory if you want to continue with native history. |
| Query exceeds 8 KiB | Shorten the latest messages, or disable memory for that generation. Queries are not silently truncated. |

## Data, usage, and cleanup

Older chat excerpts, speaker/time metadata and retrieval queries go directly from
your browser to LambdaDB. Text and queries are also processed by its managed
embedding/reranking providers. Storage, writes, searches and inference consume
plan allowance; see [LambdaDB pricing](https://lambdadb.ai/pricing). The extension
itself is open source, but connected services are not unlimited free resources.

Before uninstalling or changing connection settings, open **Advanced** and use
**Delete all owned remote memory** and clean up any pending test collection. **Delete this chat’s remote
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

See [release notes](docs/releases/0.6.0.md), [CHANGELOG](CHANGELOG.md),
[installation validation](docs/releases/0.6.0-validation.md) and
[live reply validation](docs/native-reply-validation.md) for measured scope and limitations.

## Development and verification

See [CONTRIBUTING](CONTRIBUTING.md) for development and validation commands,
[architecture](docs/architecture.md) for implementation details, and the
[development and evaluation reference](docs/development.md) for test entry points
and historical results. [Evidence retention](docs/evidence-retention.md) tracks
preserved runs. Historical scores describe their recorded settings, not a current
accuracy guarantee.

## Benchmarks

See [benchmark/](benchmark/) for the evaluated LongMemEval-S and BEAM settings,
recorded results, and reproduction commands.

## License

Copyright (C) 2026 SillyMemory contributors.
Licensed under [GNU AGPL-3.0-only](LICENSE), without warranty.
Bundled dependencies retain their [third-party licenses](vendor/LICENSES.txt).
