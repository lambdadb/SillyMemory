# Architecture

## Boundaries

`index.js` adapts the pinned SillyTavern context, events, prompt interceptor, and settings panel. `src/client.js` sends direct browser HTTPS/CORS requests; it has a private in-memory key and sanitizes errors without logging response bodies. `src/app-connect.js` runs the LambdaDB OAuth connection (discovery, one registration per installation, popup approval with PKCE, key claim and recovery); `oauth-callback.html` and `oauth-callback.js` form the callback page, which only relays the authorization result to the initiating tab. `src/gate.js` validates a synthetic lifecycle before memory collection creation. `src/status.js` formats progress and recovery guidance and ensures only the current operation owns the status display. `src/memory.js` is independent synchronization and selection logic.

There is no server plugin. Runtime modules have no external dependencies. Playwright is development-only. The extension source and development tools are distributed under AGPL-3.0-only; see the root LICENSE.

## Identity and source authority

The current SillyTavern chat is authoritative. The owner is a random per-account identity kept in extension settings; its initial save is awaited and read back before the UI permits remote operations. Browser-local configuration and journals are keyed by that owner. Scope is SHA-256 of owner, the chat owner key and the saved story ID. The chat owner key is the character avatar filename for a character chat and `group:<groupId>` for a group chat; it does not depend on the member currently generating, so identity, request targets and saved on/off verification work between member turns. Group chats are read with `/api/chats/group/get`, and their inventory for duplicate and parent detection is the group's chat list read the same way. Every story has one owned collection; each chat path has its own writable branch. Native metadata is persisted and read back before remote use. Verified native forks inherit the story scope; independent copies start new stories. The source revision hashes message position, speaker, role, selected swipe, full text and normalized conversation-time metadata. A chunk ID contains scope, revision, chunking policy, ordinal and source offsets. Insertion/deletion can renumber subsequent messages and require reindexing; content is never deduplicated across scopes.

Ordinary synchronization indexes completed eligible text only before the recent-five boundary, aligned to turn bundles. A bundle is an eligible user input and every following message up to the next input; messages before the first input, and an ineligible or blank input, keep the plain boundary. A boundary inside the current bundle (the latest input's) moves back to its input. A boundary inside an older bundle moves back to the start of its generation round, the consecutive replies sharing the host's group `extra.gen_id`, and to the input when that round directly follows it; a reply without a generation ID, as in character chats, is its own round. Alternating chats keep the previous one-message pair alignment; a character chat with several replies after one input keeps them while that bundle is current and splits them per reply once it is older. A long group Auto Mode run therefore leaves the window round by round once a new input arrives. The generation ID only aligns the boundary; it never enters document revisions, IDs or stored fields. A trailing user input remains pending. New source that crosses that boundary is uploaded immediately; the displaced bundle shares existing batches of at most 50 documents, while document/chunk identities stay separate. A five-message write queue is not used. Chunks are up to 800 Unicode code points by default. They retain message/chunk provenance and available host time/source metadata, separately from embedding text. The current implementation selects whole chunks and does not perform neighbor expansion. Renaming a chat preserves its saved identity. Changing the character avatar identity is not a continuity guarantee. Group membership changes do not change a group chat's story.

## Write ordering and recovery

Accessing the same SillyTavern server/account from another device shares host
chats and the owner ID, but not the browser-local collection mapping or journal.
Reconnect with the endpoint/project/key and prepare memory to reuse the saved
story identity. On first use/reload, remote reconciliation supplements the local
journal. Remote excerpts cannot replace the authoritative source chat. Sequential
access to the same server is possible; concurrent writers across devices remain
unsupported because browser locks do not coordinate them.

A per-engine promise queue serializes mutations. A session-long Web Lock prevents a second active tab for that account/browser. The local journal writes the union of prior and desired IDs **before** remote requests. Obsolete IDs are deleted; missing current IDs use normal upsert batches of 200 (see [upsert batch size](upsert-batch-size.md)). A successful pass replaces the journal with the desired IDs. In-memory acknowledgements skip duplicate writes during the session. On first use/reload or an uncertain write, list committed branch documents and fetch expected IDs consistently. Reuse exact field matches, delete obsolete IDs and submit only missing/changed documents, including recovery after lost responses. Native forks first confirm committed source state; see [commit confirmation](commit-confirmation.md).

No chat text or API key is persisted in the journal. If local storage fails, remote writes do not begin. An interrupted mutation may still reach the service; the durable intent and next reconciliation repair it. There is no background retry loop against a failing service. The one automatic retry is for HTTP 429, which rejects a request unprocessed: the same read or write is sent again at most twice, after `Retry-After` when the browser can read it or after 1 s then 2 s, inside the same per-request deadline and cancellation; a wait that cannot fit the deadline fails as 429 immediately. LambdaDB enforces a per-project token bucket whose capacity and refill rate both equal the project's `rate_limit` in requests per second, 5 by default regardless of plan; optional per-category buckets (query, fetch, write, management) can be added per project, and collection metadata reads count only against the project bucket. Five tokens plus 0.3 s of refill is 6.5, which is why seven activation requests in 0.3 s lost the seventh before 0.8.1; one second refills the default bucket, so the 1 s fallback wait fits it. The rate limiter answers a rejection with `Retry-After` in whole seconds (the time until the slowest empty bucket regains a token, at least one second), which the gateway exposes through CORS and the extension honours; the 1 s and 2 s fallback waits apply only to a 429 without the header. After 0.8.1 a new chat's activation sends four requests, within the default bucket; the first indexing of a long chat sends 100-ID fetch and list requests fast enough to exceed 5 per second, which the retry absorbs, while 200-document upserts take about 1.2 s each and stay under it. 5xx, timeouts and network errors are not retried. A new event, explicit Sync, or next generation retries. The synthetic gate polls readiness with a bounded attempt count; ordinary queries use a 15-second per-request timeout. Creating a chat's memory verifies ownership from the create responses: a 201 collection or branch body is accepted without a second read, while a 409 conflict or a lost response is still followed by a fresh read before adoption. The manual sync or generation-time reconciliation that follows this verification in the same preparation does not read the collection again. Full initial indexing can require multiple requests and take longer.

## Retrieval and prompt application

Queries use the selected `chat_<ID>` branch with `consistentRead: true`, not
Tags/Aliases. The empty `main` branch is an independent-story fork source. One
role-labelled Query 1 includes only the eligible generation anchor. Recent dialogue
remains in the generation prompt but is not appended to the search query.
Regenerate/swipe exclude the answer being replaced; continuation anchors on the
eligible message being extended; Impersonate anchors on the latest eligible response.
No query rewriting model or second search is used.
In a group chat the host runs generation once per responding member, and each
member turn runs this whole preparation, search and delivery check; no result is
reused across member turns. Recalled excerpts keep their stored speaker names.
Storage archives completed source before the recent-five boundary. Generation
retains at least five recent eligible messages through the active anchor,
aligned by the same turn-bundle and generation-round rule, together
with selected memory alongside native settings.
Generation retention uses the actual native position, independently of query
eligibility. Continue/Impersonate retain through the final source position;
Regenerate retains through the latest user position, so no reply after it
steers its replacement; swipe excludes only the swiped final reply, which the
pinned host also removes from its prompt, so earlier replies after the latest
input, such as another group member's in the same round, stay retained. A blank
or ineligible latest input still counts. The existing query boundary remains an additional retrieval
constraint.
Answers following a replacement question are removed from ephemeral generation
input and excluded from retrieval.
See the [current default policy](conversation-memory-defaults.md).


Bayesian fusion combines managed embedding `knn.queryText` with analyzed
`text` using the same query and `skipSyntax: true`; both legs use the owner/scope
prefilter, extended with the indexed `long` message-position range below the
earliest retained recent boundary. The same boundary also limits local accepted documents,
so an out-of-bound response cannot consume budget or duplicate a retained turn. Vector k=200, managed Typesafe `jev-1.13.0` candidateSize=200, final
size=50. Unconfirmed applied metadata, mismatched provider/model identity or failure
rejects injection. Queries above 8,192 UTF-8 bytes fail explicitly before any service
call; they are never silently truncated.

The `text` analyzers come from the **Text search languages** setting (default
`english`) when a story collection is created; LambdaDB does not change an existing
field's analyzers. Preparation reads the collection's actual
`indexConfigs.text.analyzers` from the ownership check it already performs (a
collection it has just created reports the requested analyzers, because the
service's 201 body omits index configuration) and, when
the set differs from the current setting, shows a notice with **Rebuild story memory**
in the chat panel without blocking synchronization or generation.

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
Failed preparation clears it and stops generation; in a group chat it also stops the remaining member turns through the host stop, as the missing-context stop does; disabling memory restores native full-history behavior. This does not detect
answer correctness or ensure that every model follows the instruction.

The pinned host scans `coreChat` for World Info after interceptors. Recalled excerpts can therefore participate in its ordinary history scan. World Info, other prompt rewriters, non-chat-completion providers and different host revisions are unverified. See the [speaker results](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/speaker-attribution-results.md) for the bounded OpenAI validation and remaining actor-attribution failure.

## Ownership and deletion

Production and synthetic test collections have `application=sillymemory` and the random owner metadata tag. Sync and deletion check these tags. Deletion never adopts a mismatched collection. Full deletion first disables further work, invalidates reads, drains writes, deletes the selected owned branch or all discovered owned story collections, and verifies API absence. Branch deletion preserves siblings; family deletion removes every branch. **Rebuild story memory** deletes the open story's single collection after the same ownership check, clears that collection's journals and engines, then synchronizes the open chat again so the collection is recreated with the current analyzers; other branches upload again when they are opened. Tags are ownership safeguards against accidental selection, not an authorization boundary against another holder of the project API key.

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
