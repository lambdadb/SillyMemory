# Conversation memory defaults

Current development defaults use stored, fully budgeted conversation-time
provenance, Bayesian English fusion and managed Jev: vector k=200, up to 200 rerank
candidates, final size=50, and a 4,096-token initial memory budget. Keep per-message
source role and optional host-time explanation in Jev's fields:
`['role', 'conversationTimeContext', 'text']`. Embeddings and lexical search still
use only verbatim `text`; generation already includes source-role and `sent`
labels. This semantic adoption adds no inference stage and is not a demonstrated
BEAM accuracy improvement. See [time provenance](conversation-time.md).
Keep per-message boundary chunks with an 800-code-point ceiling. The 4,096-token
maximum and host
one-quarter-context cap remain; explicit saved budgets are respected. These are
development defaults, not a release or a universal optimum. The browser bundle
pins SDK `0.8.1-dev.38730896042001` because stable 0.8.1 still caps rerank
candidates at 100. Git URL users use the shipped bundle without installing npm
packages. Replace this prerelease with a stable SDK once the same contract is
supported and validated. See [the depth200 decision and checks](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/query1-retrieval-quality.md#product-adoption-of-depth200-2026-10-17).

### Quoted archive and recent dialogue

Render selected older excerpts as one user-context block headed
`[Recalled conversation excerpts]`. Preserve every selected source label, original
speaker, date, verbatim body and chronological order inside it. Insert the block
at the latest selected source's position; keep special messages and recent dialogue
in their native order and roles. The block is an ephemeral prompt copy, not a
new stored chat message or a system instruction.

Count its heading during selection within the existing 4,096-token allocation
and host context cap. The inspector shows the complete block; the final delivery
check verifies its whole content and carrier role, separately from recent input
and system guidance. Partial loss follows the existing stop/warn policy. A
verified memory count of `1/1` now describes one archive block, not one retrieved
chunk; source-passage counts and citations remain available. No response schema,
additional model call or new retrieval is introduced. See the
[structural adoption evidence](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/small-default-error-analysis.md#quoted-memory-full-cohort-structural-adoption-2026-10-18).

### Conversation time

Store available source time and provenance on every chunk, separately from its
embedding text. Present the time as `sent` in each recalled excerpt header and
count one shared explanation in the system memory guidance, including no-hit
requests. No new metadata extraction, user option, query, embedding or generation
call is required. Native timestamps retain
their UTC precision. LongMemEval uses its provided session clock for each
message, with the same `sent` label and no invented timezone or seconds. BEAM's
batch reference dates are different metadata and must not be labelled `sent`.

Resolve relative dates, including today/yesterday/tomorrow, only when the local
conversation date is known; UTC alone is insufficient. Otherwise preserve date ambiguity.
Conversation timestamps do not establish when an undated past event happened.
Missing dates remain unknown. The stored
source distinguishes native message time from a shared benchmark session time;
the prompt does not need separate field names or a date-reference dictionary.

### Current native dialogue policy

Completed eligible messages are archived only after they leave the recent-five
window, aligned to keep an adjacent plain-text input/reply pair together. Normal
user input retains five; a completed reply can retain six. Displaced pairs share
an upsert with separate per-message chunks, subject to the existing 50-document
batch. No five-message queue. A trailing user input waits for its answer.
Checkpoints preserve the full native JSONL transcript and freeze the same older
memory partition. Recent messages enter memory only when they leave the retained
window on a writable path.

One role-labelled Query 1 includes only the eligible generation anchor. Recent
dialogue remains in the generation prompt but is not appended to the search query.
Regenerate/swipe exclude replacement replies; Continue/Impersonate retain
their native active-message behavior. Both search legs and local selection exclude
retained full positions. Query and memory limits remain unchanged; queries above
8,192 UTF-8 bytes fail explicitly. Each generation uses only its current memory.

Native replies and streaming are preserved, including user-selected response
formats. There is no reply schema, request-status classification, pending-span
accumulation, stream hiding or decoding/recovery adapter. Natural system guidance
answers supported parts first, builds recommendations on relevant experiences
and preferences, and distinguishes uncertain event/role matches. It explains
missing or conflicting evidence without inventing facts. Explicit obligations to
ask a clarification question or request additional context are removed; natural
follow-up questions remain allowed. This is the adopted guidance baseline after
the full fixed-memory comparison scored 470/500 versus 472/500, not a claim that
all remaining source-use or ambiguity problems are resolved; see
[the decision](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/query1-retrieval-quality.md#follow-up-obligation-only-bounded-comparison-2026-10-17).
The guidance shares the excerpt budget and Chat Completion delivery checks.
This instruction is not a factual correctness
or model-compliance guarantee. A clarification dialogue longer than the recent
window relies on retrieval. Memory-on preparation failures abort explicitly;
disabling memory restores native history. Group/tool chats remain unsupported.

Query 1 was adopted after the actual-host LongMemEval-S comparison improved from
414/500 to469/500 with the same source partition, recent dialogue, Bayesian/Jev
settings and4096-token budget. These are consumed English benchmark results, not
an independent confirmation of roleplay or long dependent follow-up quality.
Ambiguous references can use the retained recent dialogue in generation; long
follow-ups beyond that window may still require clarification. See the
[comparison and remaining-error analysis](product-comparison.md).

See [the native reply decision and verification](native-replies.md).
## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/conversation-memory-defaults.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
