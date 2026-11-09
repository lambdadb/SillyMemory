# Group chat support (design)

Status: implemented (unreleased). Host behavior below was verified with the
emulated browser harness; see [Implementation notes](#implementation-notes).

## Product decision and boundary

Allow SillyMemory in SillyTavern group chats with the same storage, retrieval
and failure-safety model as single-character chats. The first version is the
smallest change that keeps the native group workflow (member activation order,
Auto-mode, Regenerate, swipe, Continue, checkpoints and branches) working and
fails explicitly when memory cannot be delivered.

Answer quality in group chats is not evaluated. Existing LongMemEval results
cover single-character dialogue only; do not claim group-chat quality until a
separate evaluation exists. Tool conversations, files, Data Bank and World Info
remain outside the indexed path, as for single-character chats.

## Host behavior (SillyTavern 1.19.0, `06bde939`)

Found by source inspection and exercised by `npm run test:browser`
(`scripts/group-chat-scenarios.mjs`) on the pinned host.

| Behavior | Source |
| --- | --- |
| Group chat files store `chat_metadata` in their first line, like character chats. | `public/scripts/group-chats.js` `saveGroupChat` |
| Group chats carry an `integrity` slug, created on load when missing and checked by `/api/chats/group/save`. | `group-chats.js` `getGroupChat`; `src/endpoints/chats.js` `/group/save` |
| Checkpoints and branches save `{ main_chat, integrity: <new uuid> }` through `saveGroupBookmarkChat`, the same fork model used for character chats. | `public/scripts/bookmarks.js` `createBranch`, `createNewBookmark` |
| `/api/chats/group/get { id }` returns the full file including the metadata header. `/api/chats/group/info` does not return metadata. | `chats.js` |
| `getCurrentChatId()` returns the group's `chat_id`; `getContext().groupId` is the selected group. | `public/script.js`, `public/scripts/st-context.js` |
| `characterId`/`name2` are set only while a member's turn is generating and are `undefined`/empty between turns. | `group-chats.js` `generateGroupWrapper` |
| One user input runs `Generate` (and therefore the generate interceptor) once per activated member, sequentially. | `generateGroupWrapper` |
| Group Regenerate deletes the last generation's replies and then generates with type `normal`. Swipe and Continue regenerate only the member that wrote the message. | `group-chats.js` `regenerateGroup`, `generateGroupWrapper` |
| A fresh group chat starts with each member's first message, consecutive assistant messages without a user message. | `getGroupChat` |

## Chat identity and storage

Keep one collection per story and one branch per chat path.

```
collection = smstory_<SHA-256(owner, chat owner key, story ID)[0:40]>
branch     = chat_<chat ID>
```

- The chat owner key is the character avatar for character chats and
  `group:<groupId>` for group chats. The prefix separates the two namespaces.
- A new independent group chat starts a new story and therefore a new
  collection. Its checkpoints and branches are branches of that collection and
  fork from the parent branch exactly as for character chats.
- Adding or removing group members does not change the story identity.
- Replace direct `characters[characterId].avatar` reads used for identity
  (`supportsChat`, `requestTarget`, `sameChat`, chat-collection resolution,
  saved on/off verification) with one helper that returns the chat owner key
  and the matching host chat API. These reads must work between member turns,
  when `characterId` is undefined.
- Saved metadata verification reads group chats with `/api/chats/group/get`.
- Duplicate detection and parent lookup need group chat metadata. Read the
  group's `chats` list with `/api/chats/group/get` per chat. Group chat counts
  are expected to be small; measure this during validation and revisit if
  activation becomes slow.

## Recent dialogue window

Generalize the existing pair alignment to a turn bundle.

- A bundle is a user message plus every following message up to the next user
  message.
- Keep at least five recent eligible messages including the active input, as
  today. When the boundary falls inside the current bundle (the one holding
  the latest user message), move it back to that user message. The previous
  rule moved back by exactly one message.
- When the boundary falls inside an older bundle, move it back to the start of
  the generation round containing the boundary message, and to the bundle's
  user message when that round directly follows it. A generation round is the
  consecutive replies sharing the host's `extra.gen_id`, which the host sets
  only in groups (`script.js` `saveReply`); greetings get their own random ID
  (`getFirstCharacterMessage` in `group-chats.js`). A reply without an ID, as in
  character chats or legacy group files, is a round of its own.
- Alternating chats and normal group rounds give the same result as the pure
  bundle rule. A character chat with several replies after one user message
  (for example after an empty send) keeps them while the bundle is current and
  splits them per reply once it is older, which is the pre-change pair result.
  The generation ID aligns the boundary only; stored documents are unchanged.
- Small bundles leave several bundles in the prompt; once the current bundle
  alone has five or more messages, only that bundle remains and earlier bundles
  are archived.
- A displaced bundle is uploaded as a whole using the existing 200-document
  batches.
- Messages before the first user message (fresh group greetings) have no user
  message to align to and use the existing message boundary. An ineligible
  (attachment) or blank user message is not indexed either, so a bundle that
  starts with one also keeps the plain message boundary, as the pair rule did.

### Long Auto-mode limitation

Auto-mode without user input keeps extending the current bundle, so the whole
run since the last user message stays in the prompt. History before that user
message is archived and retrieved normally. When the current bundle no longer
fits the context, prompt delivery verification reports missing memory or recent
messages: with **Stop on missing context** on (default) the reply stops and the
host's stop listener turns Auto Mode off; with it off the host trims the oldest
messages, including the triggering user message, which is then in neither the
prompt nor memory. Document this as a current limit.

The first implementation applied the bundle rule to every bundle. The host test
showed that a new user message then did not recover: its five-message window
started inside the long run, the rule kept the whole run, and the reply stopped
again at the same context until five newer messages existed. Older bundles
therefore split at generation rounds (adopted for this change): after the stop,
one new user message keeps only the last rounds of the run with it, archives the
earlier rounds in one batch, and fits the same context again (host test: an
11-reply run, then two replies with five recent messages kept).

Splitting the current bundle by generation round was rejected because a long
Auto-mode run would then silently archive the user message that started it. The
adopted rule splits only older bundles, after a new user message arrives, and
archives a bundle's user message together with the round that directly answers
it. If long runs inside the current bundle prove common, consider keeping the
triggering user bundle plus recent generation rounds (two retained spans).

## Retrieval per member turn

Each member turn runs the existing preparation: synchronize, search with the
latest eligible user message as the query, select memory within the budget and
verify delivery. No cross-turn result reuse in the first version.

Within one user turn the query is identical and new replies stay in the recent
window, so results are normally identical across members. They can differ only
when the current bundle reaches five messages mid-round and the previous bundle
is archived. The cost is one search per responding member; turns are sequential,
so the default project rate limit is not expected to be exceeded. Measure the
added latency and request count before considering reuse.

## Prompt construction

- Label recalled and retained messages with their stored speaker names instead
  of `name2`, which changes per member turn.
- Memory guidance remains the same; it addresses the member currently
  generating through the host's own prompt.
- Delivery verification runs per member turn with that turn's expected memory
  and retained input.

## Policy text to update with the implementation

AGENTS.md and architecture.md describe the recent boundary as an adjacent
user/assistant pair. Update them to the bundle rule in the same change.

## Validation

- Unit tests: bundle boundary with multiple replies per user message, fresh
  greetings before the first user message, single-character results unchanged.
- Host tests: enable memory in a group chat, member turns between which
  `characterId` is undefined, Regenerate/swipe/Continue, checkpoint and branch
  fork reuse, reload restoring the on/off choice.
- Report the per-member search count and latency observed in host tests.
- No group-chat answer-quality evaluation in this change.

## Out of scope

- Cross-turn retrieval reuse.
- Retained spans for long Auto-mode.
- Per-member memory or member-specific retrieval.
- Group-chat quality evaluation.

## Implementation notes

- The chat owner key is `chatOwner()` in `src/memory.js`. Host chat reads and
  the group inventory are `hostChats()` in `src/chat-collections.js`. Identity
  saves use `saveGroupChat(groupId, false)` for groups because the host's
  `saveChat` throws in a group; both capture their target before the first await.
- Retention for swipe is `retentionAnchor()` in `src/context.js`.
- Bundle alignment is `archiveBoundary()` in `src/memory.js`. Unit tests compare
  it with the previous pair rule over every alternating chat of up to ten
  messages with eligible, ineligible and blank messages, and cover long Auto
  Mode runs, older bundles answered by one round, legacy replies without a
  generation ID, greetings and swipe/regenerate. `capture()` records the
  generation ID as `round`; document revisions, IDs and fields are unchanged
  (unit test), and the ID only changes with a new reply, so it adds no
  synchronization beyond a real chat change.
- Host test observations (local emulator, two members, list activation):
  - Turning memory on read `/api/chats/group/get` three times (inventory of one
    chat, identity read-back, on/off read-back) and took about 1.1 s.
  - One user message made two searches and two completions, one per member,
    with the same Query 1. The interceptor took 15-23 ms per member turn against
    the local emulator; this is not a live-service latency measurement.
  - Regenerate ran both members with type `normal`; swipe and Continue ran only
    the member that wrote the last message.
  - Swipe excludes only the swiped final reply. The host removes it from
    `coreChat` (`Generate`: `if (type === 'swipe') coreChat.pop()`) while the
    source chat still holds it. A group swipe of the second member's reply
    keeps the first member's reply of the same round in the prompt and in the
    delivery check. Regenerate is unchanged: it still retains only through the
    latest user message, the existing rule that a retained answer must not
    steer its replacement (prompt-delivery case
    `replacement-with-assistant-suffix`). In a character chat the host deletes
    only the last reply before interceptors run; group Regenerate deletes the
    whole round and generates with type `normal`, so the rule does not apply.
  - A memory preparation failure in a group stops the whole round through the
    host stop (`stopGeneration()`), the mechanism the missing-context stop
    uses: the group loop aborts before the next member. With a persistent
    failure, and with a failure only on the first member, no member replies,
    the input stays last and the chat shows **Reply stopped** with Retry.
    Like the native Stop button, the stopped group generation rejects with the
    host's abort error.
  - A stop after an earlier member replied leaves that reply as the last
    message, so **Retry reply** is hidden. The stopped message in a group says
    that Regenerate redoes the whole round and points to the member list's
    **Trigger a message from this character** button (`data-action="speak"`,
    `Generate('normal', { force_chid })`) for only the missing reply. Character
    chats keep the previous text.
  - Auto Mode: a preparation failure and a missing-context stop both emit
    `GENERATION_STOPPED`; the listener the host registers when Auto Mode is
    switched on aborts the run and turns Auto Mode off, and no further round
    runs (checked over three one-second intervals). The stopped message then
    says that Auto Mode was turned off. After a preparation failure it says to
    turn Auto Mode on again after fixing the cause. After a missing-context
    stop, the usual cause in Auto Mode is the run outgrowing the context, so it
    says to send a message first, which moves the earlier Auto Mode replies
    into memory, then to turn Auto Mode on again (host test: an 11-reply run
    recovers after one message). The shared delivery text that suggests a
    larger context or shorter reply is unchanged.
  - Stale generation controller. `Generate` keeps the host's private
    `abortController` when the caller passes a signal (`script.js` 4302) and
    sends with it (`sendGenerationRequest`, 6118; streaming refuses an aborted
    one, 6148). Auto Mode rounds pass their own signal (`group-chats.js` 1412,
    1063), so after any stop they reused the aborted controller and generated
    nothing, while each member turn still synchronized and searched memory
    (observed: 61 member turns in about 60 s with no completion). The
    interceptor cannot read that private controller, and the only renewal is a
    call without a signal (an ordinary send) or the exported
    `setExternalAbortController` (`script.js` 7114).
  - Options. (A) Mirror the private controller state from public events and
    skip memory for presumed no-op turns: rejected, because it infers private
    host state and misjudges cases such as a Regenerate with no active member.
    (B) After SillyMemory itself stops a group round, replace the aborted
    controller: adopted. (C) Keep the behavior and advise sending a message.
  - Adopted (B). SillyMemory calls `stopGeneration()`, then installs a fresh
    controller through `setExternalAbortController` on `GROUP_WRAPPER_FINISHED`
    (`group-chats.js` 1088). That event comes from the wrapper's `finally`
    after every member `Generate` of the round has settled (the loop awaits
    each one, 1063; `Generate` awaits its request, `script.js` 5453), so no
    request of the stopped round can read the new controller. The round keeps
    its own reference to the aborted signal: a user round's wrapper receives
    `abortController.signal` by value (`script.js` 4353) and checks it before
    each member (`throwIfAborted`, `group-chats.js` 946), and an Auto Mode round
    checks its own controller, which the host's stop listener aborts
    (`stopAutoModeGeneration`, 2405). Character chats need no renewal: their UI
    generations pass no signal and always get a new controller (4302).
    Host test: a SillyMemory stop turns Auto Mode off; turning it on again
    right away ran two member turns with two searches and two completions;
    the stopped turn of a long run sent no completion. A control run without
    the replacement failed that check.
  - Known host limitation: after the native **Stop** button the same aborted
    controller stays for Auto Mode rounds until an ordinary send. SillyMemory
    does not replace it there because it did not stop that generation.
    Reproduced on a vanilla pinned host without SillyMemory and with an
    emulated backend: after Stop, re-enabled Auto Mode started two member
    turns in 12 s, each rejecting at once with the stale abort reason
    ("Clicked stop button"), with no completion request and no reply while
    Auto Mode stayed on; an ordinary message then got both replies, and Auto
    Mode worked again afterwards.
  - Inventory cost: with 20 group chats and 20 character chats of 500
    synthetic messages each (about 100 KB per file), reading the group
    inventory took a median 28 ms against 5 ms for the character inventory;
    opening a memory-enabled group chat through identity verification and
    synchronization took about 0.5 s. This is local loopback; the reads are
    unchanged.
- Live LambdaDB (`npm run test:generation`, deterministic local model, two
  members): synchronization archived the greetings and first two bundles in one
  upsert; each member turn searched once and recalled the archived fact; the
  displaced bundle was uploaded together; swipe ran one member and kept the
  earlier member reply; a native branch forked the parent branch without
  uploading documents again and its member turns recalled the inherited fact;
  deleting the branch's memory removed only that branch. Live searches took
  about 0.42-0.51 s and member-turn preparation 0.53-1.03 s; a two-member round
  took about 2.4 s. The branch's first preparation polled about 50 consistent
  fetches while confirming that the parent's documents were committed. All
  three created collections were deleted and verified absent. No real model was
  used and answer quality was not evaluated.
