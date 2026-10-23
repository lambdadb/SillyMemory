# Architecture

## Boundaries

`index.js` adapts the pinned SillyTavern context, events, prompt interceptor, and settings panel. `src/client.js` sends direct browser HTTPS/CORS requests; it has a private in-memory key and sanitizes errors without logging response bodies. `src/gate.js` validates a synthetic lifecycle before memory collection creation. `src/status.js` formats progress and recovery guidance and ensures only the current operation owns the status display. `src/memory.js` is independent synchronization and selection logic.

There is no server plugin. Runtime modules have no external dependencies. Playwright is development-only. The extension source and development tools are distributed under AGPL-3.0-only; see the root LICENSE.

## Identity and source authority

The current SillyTavern chat is authoritative. The owner is a random per-account identity kept in extension settings; its initial save is awaited and read back before the UI permits remote operations. Browser-local configuration and journals are keyed by that owner. Scope is SHA-256 of owner, character avatar filename, and the saved story ID. Every story has one owned collection; each chat path has its own writable branch. Native metadata is persisted and read back before remote use. Verified native forks inherit the story scope; independent copies start new stories. The source revision hashes message position, speaker, role, selected swipe, full text and normalized conversation-time metadata. A chunk ID contains scope, revision, chunking policy, ordinal and source offsets. Insertion/deletion can renumber subsequent messages and require reindexing; content is never deduplicated across scopes.

Ordinary synchronization indexes completed eligible text only before the recent-five boundary, rounded back by one message if it splits an adjacent eligible user/assistant pair. A trailing user input remains pending. New source that crosses that boundary is uploaded immediately; the displaced pair shares existing batches of at most 50 documents, while document/chunk identities stay separate. A five-message write queue is not used. Checkpoints preserve the full native JSONL transcript and freeze the same older-history partition, without indexing recent messages solely for the snapshot. Chunks are up to 800 Unicode code points by default. They retain message/chunk provenance and available host time/source metadata, separately from embedding text. The current implementation selects whole chunks and does not perform neighbor expansion. Renaming a chat preserves its saved identity. Changing the character avatar identity is not a continuity guarantee.

## Write ordering and recovery

Accessing the same SillyTavern server/account from another device shares host
chats and the owner ID, but not the browser-local collection mapping or journal.
Reconnect with the endpoint/project/key and prepare memory to reuse the saved
story identity. On first use/reload, remote reconciliation supplements the local
journal. Remote excerpts cannot replace the authoritative source chat. Sequential
access to the same server is possible; concurrent writers across devices remain
unsupported because browser locks do not coordinate them.

A per-engine promise queue serializes mutations. A session-long Web Lock prevents a second active tab for that account/browser. The local journal writes the union of prior and desired IDs **before** remote requests. Obsolete IDs are deleted; missing current IDs use normal upsert batches of 50. A successful pass replaces the journal with the desired IDs. In-memory acknowledgements skip duplicate writes during the session. On first use/reload or an uncertain write, list committed branch documents and fetch expected IDs consistently. Reuse exact field matches, delete obsolete IDs and submit only missing/changed documents, including recovery after lost responses. Native forks first confirm committed source state; see [commit confirmation](commit-confirmation.md).

No chat text or API key is persisted in the journal. If local storage fails, remote writes do not begin. An interrupted mutation may still reach the service; the durable intent and next reconciliation repair it. There is no background retry loop against a failing service. A new event, explicit Sync, or next generation retries. The synthetic gate polls readiness with a bounded attempt count; ordinary queries use a 15-second per-request timeout. Full initial indexing can require multiple requests and take longer.

## Retrieval and prompt application

Queries use the selected `chat_<ID>` branch with `consistentRead: true`, not
Tags/Aliases. The empty `main` branch is an independent-story fork source. One
role-labelled Query 1 includes only the eligible generation anchor. Recent dialogue
remains in the generation prompt but is not appended to the search query.
Regenerate/swipe exclude the answer being replaced; continuation anchors on the
eligible message being extended; Impersonate anchors on the latest eligible response.
No query rewriting model or second search is used.
Ordinary storage and checkpoint memory archive completed source before the
recent-five boundary. Checkpoint JSONL files preserve the full transcript. Generation
retains at least five recent eligible messages through the active anchor,
including a paired user when the window would start at its adjacent assistant reply, together
with selected memory alongside native settings.
Generation retention uses the actual native position, independently of query
eligibility. Continue/Impersonate retain through the final source position;
regenerate/swipe exclude replies after the latest user position, including
ineligible/blank inputs. The existing query boundary remains an additional retrieval
constraint.
Answers following a replacement question are removed from ephemeral generation
input and excluded from retrieval.
See the [current default policy](conversation-memory-defaults.md).


Bayesian fusion combines managed embedding `knn.queryText` with English-analyzed
`text` using the same query and `skipSyntax: true`; both legs use the owner/scope
prefilter, extended with the indexed `long` message-position range below the
earliest retained recent boundary. The same boundary also limits local accepted documents,
so an out-of-bound response cannot consume budget or duplicate a retained turn. Vector k=200, managed Typesafe `jev-1.13.0` candidateSize=200, final
size=50. Unconfirmed applied metadata, mismatched provider/model identity or failure
rejects injection. Queries above 8,192 UTF-8 bytes fail explicitly before any service
call; they are never silently truncated.

Remote hits are ranking signals: only exact current IDs, ownership, scope, revision,
source text and conversation-time metadata are accepted; injection uses the locally
reconstructed text. This prevents eventual-index lag, deleted records, malicious
remote text changes and sibling-chat results from resurrecting stale content.
Visit valid hits in retrieval order. For each hit, render the already accepted
sources together with that complete passage, comparing separate excerpts with
same-message assembly that shares headers/removes exact overlap. Admit the hit
only when the cheaper complete rendered layout fits the budget; otherwise continue
to later hits. There is no preliminary whole-passage selection or source-floor
refill pass. Final presentation remains chronological. Fifty returned chunks need
not all fit the configured budget. See [ranked source assembly](source-assembly.md).

An epoch and a full snapshot comparison invalidate work across events, chat switches, disabling, and connection replacement. Pending queries are canceled when possible; canceled server writes are never assumed rolled back. Token counting and the final validity check precede mutation. Failed sync/query/counting preserves local source and stops generation explicitly. A successful selection, including zero hits or nothing fitting the budget, replaces past eligible messages while preserving recent dialogue and special messages. Only the generated `coreChat` array is spliced; persisted chat objects are untouched.

Selected excerpts form one user-context archive headed `[Recalled conversation excerpts]` in the ephemeral `coreChat`, inserted at the latest selected source's position. Original speaker/role/date/source labels and verbatim bodies stay in chronological order inside the block. A separate system extension prompt supplies memory guidance; recalled text is never combined into that instruction. Retained recent and special messages keep their original objects and relative order; source chat is untouched. Source labels identify recalled passages without rewriting pronouns or treating a speaker as the actor of every reported action. The block's host index is an insertion point, not a replacement for individual source coordinates.

Macro braces and legacy `<USER>`/`<CHAR>`-style markers are rendered with fullwidth delimiters before budgeting. The archive heading, joined excerpt content, source labels, newline separators and memory guidance are counted with the host tokenizer, with a fresh-settings default of 4,096 tokens, additionally capped at a quarter of the host context limit. Provider per-message envelopes and the complete system/persona/response overhead remain the host's responsibility; this is not a cap on total billed tokens or a guarantee that an oversized current input fits. Quotation and source labels are not a comprehensive prompt-injection defense. Final delivery verifies the complete archive in its user carrier role; losing any part invokes the existing stop/warn policy.

Successful preparation supplies a system instruction even with no matching memory:
use available conversation evidence, build recommendations on supported experiences
and preferences, and answer supported parts before asking for missing details.
Do not merge different events or roles from similar wording; distinguish the
requested event or role from what the context establishes. Explain what missing
or conflicting evidence does and does not establish without inventing facts;
follow-up questions remain optional. Do not treat absent retrieval as proof of absence.
Final delivery validates this instruction alongside excerpts and every verifiable
retained recent turn. Long raw turns can exceed host context even when the
memory allocation fits; the default loss guard stops that generation.
Failed preparation clears it and stops generation; disabling memory restores native full-history behavior. This does not detect
answer correctness or ensure that every model follows the instruction.

The pinned host scans `coreChat` for World Info after interceptors. Recalled excerpts can therefore participate in its ordinary history scan, unlike the previous system extension prompt with scanning disabled. World Info, other prompt rewriters, non-chat-completion providers and different host revisions are unverified. See the [speaker results](speaker-attribution-results.md) for the bounded OpenAI validation and remaining actor-attribution failure.

## Ownership and deletion

Production and synthetic test collections have `application=sillymemory` and the random owner metadata tag. Sync and deletion check these tags. Deletion never adopts a mismatched collection. Full deletion first disables further work, invalidates reads, drains writes, deletes the selected owned branch or all discovered owned story collections, and verifies API absence. Branch deletion preserves siblings; family deletion removes every branch. Tags are ownership safeguards against accidental selection, not an authorization boundary against another holder of the project API key.

After confirmed collection deletion, local cleanup snapshots all matching journal
keys before removing them. It preserves other namespaces and host settings;
[Web Storage enumeration order](https://html.spec.whatwg.org/multipage/webstorage.html)
may change during removal, so deleting while enumerating can skip entries.

The extension retains target identity before creation so timeout cleanup is retryable. Collection deletion is an API visibility check; physical backup erasure is not established. Native chat deletion does not delete remote memory. All-owned discovery can recover cleanup after browser registry loss; loss of the account owner ID requires manual project-side inspection. Cross-device concurrent editing is not supported.

## Progress and failure display

Sync/retrieval callbacks report only phase names and numeric counts, never chat
text, scope identities, or keys. Delete/upload counts advance after acknowledgement;
upload totals include current chunks already acknowledged during this session.
A lost response is not counted even if the service accepted it. Existing durable
intent drives reconciliation on retry/reload. No timeout, batch-size, query-policy,
or automatic retry changes accompany the UI.

Each sync captures the engine epoch and checks validity before queued work and
between mutation batches. Invalidation stops further work and progress callbacks;
already-started writes may still complete and their IDs remain recoverable. A
display revision additionally prevents a superseded manual sync from replacing
a newer operation's progress, success, or failure. This display ownership does
not invalidate an otherwise current generation prompt. A generation that starts retrieval takes over a
pending debounce timer because retrieval already synchronizes the source. Quiet
prompts cancel older retrieval ownership and clear the injection without
invalidating pending or in-flight sync. Retrieval captures its read-cancellation
signal before synchronization and checks it again after search and token counting;
late responses cannot restore a canceled injection. A tab
without the session lock retains its lock-conflict explanation across chat events.

Terminal states hide the progress bar. Failure retains the last confirmed stage
and count, with separate key/permission, rate-limit, network, and timeout guidance.
Timeout classification covers both fetching headers and consuming a response body.
No raw exception or upstream response body is used in the generic UI failure path.
The live status is not persisted. Reload verifies the account/endpoint/project-bound
browser credential before restoring the previous memory-enabled state; see
[saved connections](saved-connection.md).
