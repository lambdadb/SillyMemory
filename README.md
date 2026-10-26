# SillyMemory

Long-term memory for SillyTavern. **Powered by LambdaDB.**

SillyMemory retrieves relevant original passages from the current chat's older
messages while keeping recent dialogue in context. It works with existing saved
chats and uses LambdaDB for managed embeddings, hybrid search, reranking and
memory branching. You can inspect the passages selected for each answer. No
separate embedding-provider key, server plugin, or build step is needed.

**Experimental pre-release.** Start with a test chat; broader model/browser
compatibility and answer quality are still being evaluated. Install from `main`;
see [release notes](docs/releases/0.7.1.md) and
[GitHub Releases](https://github.com/lambdadb/SillyMemory/releases) for version details.

## Why use SillyMemory?

Long chats need a way to keep earlier details available without sending the whole
transcript on every request. We evaluated these alternatives:

| Approach | How it handles older dialogue |
| --- | --- |
| Plain SillyTavern history | Sends history within the configured context limit; a larger window can retain more history but increases answer input. |
| Built-in Vector Storage | Retrieves matching chunks from older messages. In our tested configuration, answer input still filled the 32K context window. |
| Built-in Summarize | Uses an LLM to maintain a summary alongside native history, adding summary-processing work. |
| Separate 400-character segment-summary method | Uses an LLM to create compact summaries and select older summaries. This reduces answer input but adds construction/selection work and can omit details. It is an experimental comparator, not a built-in SillyTavern option. |
| **SillyMemory** | Retrieves source passages into a bounded memory budget, with recent dialogue retained separately. It uses no generative LLM calls to construct or update memories, and reuses indexed history across linked conversation branches. |

In the recorded 500-question LongMemEval-S evaluation, SillyMemory scored
**96.0%**, versus **95.2%** for full history, with **95.35% lower mean answer input
token usage**. The summary methods were evaluated on a shared 50-question subset;
compare them using that subset, not the 500-question scores. See the
[comparison report](docs/longmemeval-public-evaluation.md) for all configurations,
matched-cohort results and memory-processing costs. These results describe the
tested English configurations, not a guarantee for every model or roleplay chat.

## Before you start

- **SillyTavern 1.19.0** with Git installed on its host, served on localhost or
  HTTPS. Chromium is the tested browser; other host versions/browsers are unverified.
- A **plain-text, single-character chat**. Group chats, attachments and tool
  conversations are outside the supported path; see [current limits](#current-limits).
- A working chat model connection in SillyTavern. SillyMemory uses your existing
  model settings and native replies/streaming; it does not provide a chat model.
  Live reply/streaming validation covers Sol; other generation providers remain
  unverified.
- A **LambdaDB project** and its regional HTTPS endpoint, project name and project
  API key. The key needs collection, document and branch access.

You can start with [LambdaDB's Free plan](https://lambdadb.ai/pricing), with no
credit card required. [Create an account](https://app.lambdadb.ai/) and a project;
usage must stay within the plan's included limits. Your chat model provider's
charges are separate. Follow the [LambdaDB quickstart](https://docs.lambdadb.ai/guides/get-started/quickstart)
to create a project, open its **API Keys** tab and create a key. Save the full key
when shown, and keep the regional base URL and project name ready for installation.
Older chat text and retrieval queries are processed by LambdaDB and its managed
inference providers; this is a cloud-connected extension, not a local-only memory
store. See [data, usage, and cleanup](#data-usage-and-cleanup).

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

4. Click **Connect and prepare**. This verifies and saves the key in this browser,
   tests temporary data using your LambdaDB inference allowance and verifies cleanup.
   Your chat is not uploaded or activated by setup. If preparation is interrupted,
   use **Clean up test data** when shown, then **Finish preparation**.
5. Open an existing saved character chat or a new one. Turn off built-in Vector
   Storage chat vectorization and other extensions that rewrite chat history.
   Expand **Memory** above the composer and click **Turn memory on in this chat**.
   Wait for synchronization to finish before sending a message.

Connection settings collapse after verification. The memory switch and status
remain above the composer; **Advanced** contains limits, diagnostics, prompt
inspection, remote cleanup and optional **Frozen memory snapshots**.

No npm commands, manual CORS allowlist, proxy setting, or SillyTavern server restart
are needed.

## Try it with an existing chat

You do not need to start over. On first activation, SillyMemory indexes the saved
chat's older messages; recent dialogue stays directly in the answer context.
Longer histories take more time and embedding/write allowance to prepare. Later
synchronization reuses unchanged indexed passages and reconciles changes.

Once the status is **Ready**, ask about a detail from earlier in that chat. Expand
**Memory** to inspect selected source passages, or choose **View full memory** to
inspect the last prepared prompt's memory. The original transcript stays intact;
turning memory off returns to ordinary SillyTavern history handling.

Memory belongs to the selected chat and its linked conversation paths. Unrelated
chats, including separate stories with the same character, are not automatically
combined into one memory.

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
- Once connected and prepared, use **Turn memory on / off** in the same panel
  without reopening settings. Switching is disabled during generation or a
  manual memory operation; initial connection and preparation stay in settings.
  This preference is saved in the selected chat’s native metadata. New chats start
  off; native checkpoints and branches inherit the source preference and can then
  be changed independently. Extension settings manage the shared LambdaDB
  connection, preparation and advanced options, without a global memory switch.
- SillyMemory connects directly to LambdaDB and does not depend on built-in Vector
  Storage. Its chat vectorization must be off to avoid conflicting history injection;
  the chat status links to its settings without changing them.
- Expand **Memory** to preview up to three selected source passages from the
  last prompt, with speaker and message positions. **View full memory** opens
  **Advanced → Memory in the last prompt** directly. Check the delivery status
  for whether the final host prompt was verified. Previews stay in this tab and
  clear when changing chats, changing source messages, disabling memory or
  preparing another reply; normal reply completion keeps the last selection.
- The expanded panel shows the last prepared input estimate from SillyTavern's
  existing Chat Completions counter, plus the prepared memory size. **Compare
  dialogue text** optionally measures raw dialogue before/after memory using the
  local tokenizer. This reference precedes host formatting/context trimming and
  excludes character/system settings; its percentage is not full-prompt or billing
  savings. See [token display semantics](docs/prompt-token-display.md).
- Under **Advanced**, the default **Memory token budget** is 4,096 tokens, capped
  at one quarter of the host context. Recent messages and character instructions also need room;
  SillyTavern can still trim the final prompt to its context limit.
- Click **Turn memory off in this chat** to return to ordinary SillyTavern history handling.
  Continue the same chat: the original transcript is preserved, and the next
  generation uses the host’s existing context limits and settings without
  SillyMemory retrieval. Saved remote memory is kept; other extensions’ settings
  are not changed.
- Reload reconnects using the saved key and restores the selected chat’s saved on/off state
  after verification. **Connection → Forget key** removes the saved key and disables memory.

## Branches and checkpoints

Use SillyTavern's **Create Branch**, **Save checkpoint**, **Back to parent chat**
and **Manage chat files** controls as usual. Linked paths reuse unchanged indexed
history through LambdaDB data versioning; later changes stay separate. On opening
a path with memory enabled, SillyMemory reconciles its saved transcript, removing
out-of-path passages and indexing missing or changed text. If the source memory
is unavailable or the parent link cannot be verified, preparation can rebuild
from local history and consume embedding/write allowance.

Native **Save checkpoint** saves the chat transcript; it does not freeze remote
memory at save time. **Advanced → Frozen memory snapshots** additionally binds a
saved transcript to verified remote memory, with separate save/resume controls.
Saving or resuming preserves the saved memory on/off preference; an enabled
writable chat synchronizes automatically after success. See the
[snapshot guide](docs/checkpoints.md) and [native workflow validation](docs/native-chat-workflow.md).

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Connection or authentication failure | Use **Reconnect** in the chat panel when a saved key is available. Otherwise open **Connection** settings to check the regional endpoint/project/key and connect. Check browser connectivity to LambdaDB for network errors. |
| Failed connection test | Use **Clean up test data** beside the status, then use **Finish preparation**. The diagnostic cleanup control also remains under **Advanced**. Keep pending cleanup records until it succeeds. |
| Synchronization failure | Follow the status message; wait before retrying a temporary service error, then use **Retry synchronization** beside the status. **Advanced → Sync this chat** remains available for manual synchronization. |
| Generation stopped during memory preparation | Read the last-prompt status, resolve the error, then use **Retry reply** above the composer for an unchanged pending user input, or the native **Regenerate** action. The shortcut uses native regeneration and makes a new model request; it never retries automatically. Sync alone does not resume a stopped generation. Disable memory if you want to continue with native history. |
| Query exceeds 8 KiB | Shorten the latest messages, or disable memory for that generation. Queries are not silently truncated. |

## Data, usage, and cleanup

Older chat excerpts, speaker/time metadata and retrieval queries go directly from
your browser to LambdaDB. Text and queries are also processed by its managed
embedding/reranking providers. Storage, writes, searches and inference consume
plan allowance; see [LambdaDB pricing](https://lambdadb.ai/pricing). The extension
itself is open source, but connected services are not unlimited free resources.

The verified API key is saved in a dedicated browser credential record scoped to
the SillyTavern account and exact endpoint/project. Reopen **Connection** to change
it or use **Forget key**. Other extensions running on the same page can access
browser storage; this is not an isolated secret vault.

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

When updating from 0.6.0, open each desired chat and choose **Turn memory on in
this chat**. The previous global switch is replaced by explicit per-chat choices;
chats without a saved choice start off.

See [release notes](docs/releases/0.7.1.md), [CHANGELOG](CHANGELOG.md),
[installation validation](docs/releases/0.7.1-validation.md) and
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
