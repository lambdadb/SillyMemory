# Managed reranker adoption decision

## Current adoption decision — 2026-10-05 KST

Keep the existing vector retrieval and 800-token product default. In the latest
complete 32-case comparison on GPT-6.1 Sol, vector answered 28/32 correctly and
English raw-text hybrid + Jev answered 31/32. Hybrid gained four answers but lost
one current-location answer that vector got right. This is a real aggregate gain
with a regression, so the predeclared gain-with-zero-loss adoption gate still fails.
Latency is not the reason for retaining the default.

The subsequent [fusion diagnosis](#fusion-diagnosis-and-local-bayesian-reproduction)
recovers the lost evidence with locally reproduced Bayesian fusion at the same
30-candidate budget, but existing weighted Min-Max and a larger RRF rerank window
also recover it in a focused control. Bayesian support is a promising backend
option, not a demonstrated prerequisite. Prefer validating an existing-feature
candidate before making a Lucene upgrade a dependency. No new answer-quality
result or product default change is implied by the retrieval-only diagnosis.

PR #63 records the full comparison and the earlier diagnostic work. The newer
model is configured only in the disposable evaluation host; SillyMemory does not
choose the user's SillyTavern generation model. Product runtime/UI/dependencies
remain unchanged. No temporal schema or message-time heuristic is added: message
order does not establish the time of an event.

## Fusion diagnosis and local Bayesian reproduction

This bounded follow-up uses the same 32 authored cases, exact stored source
documents and two query strings. It makes live LambdaDB managed-embedding and Jev
requests through the SDK from Node, then runs the production selection code locally.
It does **not** run SillyTavern/browser generation, generate new answers, upgrade
Lucene or call a Bayesian LambdaDB API. The user confirmed that API is not deployed.

### What caused the current-location regression

The fresh reproduction locates the loss before reranking:

| Primary-question stage | Updated attic-cabinet fact |
| --- | --- |
| Vector k=30 | Rank 2, score 0.76260436 |
| Full-vector k=41 diagnostic | Rank 2 |
| Full English lexical result | Rank 40 of 40, score 0.045506224 |
| RRF size=30, k=30 | Absent |
| Equal-weight Min-Max size=30, k=30 | Absent |
| RRF size=100, k=30 | Rank 30 of 40, score 0.7969355 |
| Local Bayesian, BM25 calibration only | Rank 24 before Jev; rank 1 after Jev |
| Local Bayesian, both signals calibrated | Rank 2 before Jev; rank 1 after Jev |

The other 39 lexical matches share score 0.049405675. The updated passage is
longer and scores below this group; document-length normalization is a plausible
explanation, not a term-level explanation trace. The second/context query also
misses the fact in its top 30, so it cannot repair the first query's omission.

The observed RRF scores are consistent with equal raw-score ties sharing rank:
after normalization, a lexical-only tied-top document scores 0.5, whereas vector
rank 2 with no lexical contribution would score `(1/62)/(2/61) = 0.49193548`.
There are enough lexical matches to fill all 30 slots above that value. A naive
local RRF implementation that assigns different ranks to equal BM25 scores gives
a different result and must not be called an exact LambdaDB reproduction.
Increasing `size` changes the observed candidate behavior, not just the displayed
suffix: the size-100 result contains a fact that size-30 omitted even though it is
rank 30 in the wider result. Do not reconstruct the narrower result by slicing
the wider response. These observations implicate the lexical candidate window
and tie-aware fusion; this case provides no evidence of an ANN recall failure.

### Full-set retrieval and packing results

Counts require **all labeled evidence for a case**, across both queries. Every
method uses the same 800-token budget. These are not answer correctness scores.

| Method | Evidence in returned candidates | Evidence injected before Jev | Evidence injected after Jev |
| --- | ---: | ---: | ---: |
| Vector only | 31/32 | 28/32 | Not run |
| Server RRF | 31/32 | 22/32 | 31/32 |
| Server equal-weight Min-Max | 31/32 | 29/32 | 31/32 |
| Local Bayesian: calibrate BM25 only | 32/32 | 27/32 | 32/32 |
| Local Bayesian: calibrate both signals | 32/32 | 31/32 | 32/32 |

Both Bayesian variants recover current-location with no new post-Jev evidence
losses. Neither establishes a general replacement for reranking: before Jev,
BM25-only calibration still loses five cases during packing, and calibrating both
still loses completed-location. Vector's four injection failures remain rare-name,
semantic, new-rare-name and new-exact-ticket. RRF/Min-Max + Jev lose only
current-location. Exact case matrices, rankings, ties and scores are archived.

The local arithmetic follows
[Lucene PR #15827](https://github.com/apache/lucene/pull/15827) at head
`ffd1028437e20c8414d3d65a9d817a56dd920b92`: query-level sigmoid calibration followed
by softplus-gated log-odds fusion, with absent signals contributing zero and
confidence exponent 0.5. For each calibrated signal, freeze beta to its top-30
score median and alpha to the inverse population standard deviation; a flat
signal uses alpha=1. No answer labels enter calibration, and no parameter sweep
was run. These are experiment choices, **not Lucene defaults**. This is not a
reproduction of every algorithm in the
[Python reference library](https://github.com/cognica-io/bayesian-bm25).

Local methods share the captured vector/lexical top-30 union. Server compound
queries may choose different members of tied lexical groups, so this is not a
bit-identical comparison of every server-internal candidate pool. Reranking uses
an explicit synthetic-ID allowlist for each arm's exact selected 30 documents;
all candidate identities and applied/scored counts are verified. This is a
controlled candidate-set replay, not an integrated Bayesian query. The two
queries retain their own original rerank text. A focused direct server-query
control below separately reproduces RRF's failure and the existing-feature rescues.

Each case has a fresh owned collection, avoiding statistics from previous cases'
deleted documents. This differs from the earlier host run's index history and
does not reproduce its exact historical ANN/tie ordering. Source text, managed
text-embedding-3-small, English-only lexical field, owner/scope filters, explicit
chat branch, consistent reads, recent=4 and packing remain fixed. All 64 historical
token counts **and complete selections** were reproduced first with the pinned
host's Custom API tokenizer behavior: cl100k_base plus six wrapper tokens. This
preserves that experiment's budgeting behavior, not a claim about the generator's
native tokenizer. Captured query-completion order is restored to primary/context
order before interleaving; a failed local preflight exposed this and made no calls.

### Existing-feature control and decision

After observing the full set, rerun only current-location in a fresh collection:

| Direct server query | Rerank candidate limit | Fact retrieved and injected |
| --- | ---: | --- |
| RRF + Jev | 30 | No |
| RRF + Jev | 60 | Yes |
| Min-Max: vector 0.7, text 0.3 + Jev | 30 | Yes |

The larger RRF request still returns at most 30 documents and keeps vector k=30;
Jev actually scores 40/41 candidates for the primary/context queries. The weighted
Min-Max control also injects the fact without Jev. Both are existing-feature
rescues of this case, not validated full-set defaults. The weight was selected
after the failure analysis and is not independent confirmation evidence.

Bayesian fusion has a useful fixed-budget signal: both frozen variants improve
post-Jev evidence from 31/32 to 32/32 relative to equal-weight RRF/Min-Max. That
supports backend investigation, but does not show a unique advantage over existing
weighted fusion or a larger rerank pool. Keep product defaults unchanged. The next
product decision can compare the existing-feature candidate on the full set before
requiring LambdaDB Bayesian support; generated answers and independent data remain
necessary before an answer-quality adoption claim.

The run made 602 query calls, submitted 1,394 documents including one failed
managed upsert, and deleted all 34 owned collections with independent 404 checks.
After seven completed cases, an HTTP 503 upsert was preserved and its collection
cleaned; an explicit bounded recovery resumed only unfinished cases. No completed
quality outcome was retried. The main comparison used 208 managed rerank calls;
all 6,240 scored candidate identities matched their requested sets. An additional
six rerank calls belong to the focused control. No generation call was made.
All 4,798 local Bayesian candidate scores replay exactly; 4,806 arithmetic examples
agree with four methods extracted from the pinned Java source within 3e-8. This
verifies score arithmetic, not a full Lucene index integration. Maintained tests
(315), syntax and release checks pass. One-off tools and full evidence stay ignored
and archived; no runtime, dependency, schema or settings change is shipped.

## Full 32-case comparison on GPT-6.1 Sol

This is the current paired result, not a sum of historical runs. Both arms ran all
32 unique authored cases in one bounded run through SillyTavern, live LambdaDB and
OpenAI. The initial 12 and later 8 + 6 + 6 source fixtures/builders are byte/structure
identical to 763906a. These known synthetic histories are not public-benchmark,
independent holdout, multilingual or natural 32K-overflow evidence.

| Set | Cases | Vector only | English raw hybrid + Jev |
| --- | ---: | ---: | ---: |
| Initial state/temporal/attribution cases | 12 | 12/12 | 11/12 |
| Retrieval diagnostics | 8 | 6/8 | 8/8 |
| Additional confirmation | 6 | 4/6 | 6/6 |
| Reference/topic/temporal controls | 6 | 6/6 | 6/6 |
| **Total** | **32** | **28/32 (87.5%)** | **31/32 (96.9%)** |

Hybrid wins `rare-name`, `semantic`, `new-rare-name` and `new-exact-ticket`; vector
wins `current-location`. There are no shared wrong answers in this run. Scoring uses
the original identifier grader for 20 cases and a source-grounded assistant semantic
review for all 24 initial-set answers, with explicit per-answer rationales retained.
All 64 answers were inspected; this is not independent human judging. Initial-set
exact matches are retained only as diagnostics, not the correctness score.

| Failure | Where the evidence was lost | Actual wrong answer |
| --- | --- | --- |
| Hybrid: current compass location | Updated attic-cabinet statement absent from both returned top-30 lists | Superseded cedar chest |
| Vector: Neralith supplier | Fact absent from both returned lists | UNKNOWN |
| Vector: compass paraphrase | Primary rank 9, omitted by packing | UNKNOWN |
| Vector: Velanthir supplier | Primary rank 18, omitted by packing | UNKNOWN |
| Vector: freight receipt | Secondary rank 16, omitted by packing | UNKNOWN |

All five wrong answers lacked the required fact in the final prompt. Complete
labeled evidence appeared among candidates for 31/32 cases in each arm, but was
injected for 28/32 vector cases and 31/32 hybrid cases. The hybrid regression is
not stale synchronization or a deleted-message leak: the old statement is valid
historical source text, while the new statement is missing from returned candidates.
That answer run did not isolate which retrieval component caused the exclusion;
the subsequent fusion diagnosis above supplies a fresh component reproduction.
Raising the injection budget cannot recover a
fact absent from both lists. Preserve this case before any future retrieval change.

The previous topic-switch failure is now correct in both arms: `MAPLE-CABINET`.
The initial two-fact answers also give `desk drawer; blue tin`, without the previous
unsupported paint detail. These are favorable observations, not a model-only causal
result: retrieval ran again, both topic-switch message arrays differ from their
historical counterparts, and generation settings changed. No old-model arm was
rerun concurrently. Historical failures remain in the earlier sections and archives.

Both arms use the same physical documents, vectors, branch, owner/scope filters,
managed text-embedding-3-small, SDK 0.7.0, two queries, k/size/candidateSize=30,
recent=4, budget=800 and unchanged packing. Hybrid uses English-only `text_en`,
identical to `text`, with the entire query and `skipSyntax:true`; no word extraction
or manual OR. Jev-1.13.0 uses each leg's own query and `text` field, with applied
status verified. Vector request construction matches the shipped client. Probe
order alternates by case; exact live candidate lists are replayed through host
answers after source resets and owner/scope/branch/query identity checks.

The pinned host is SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, with 32K context and nonstreaming Chat
Completions. [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
uses `reasoning_effort:low` and `max_completion_tokens:4096` including reasoning.
Unsupported sampling controls and legacy `max_tokens` are omitted through the
host's Custom API body settings. This differs from the historical temperature=0,
256-token contract. The bridge forwards the host request unchanged. All responses
returned `gpt-6.1-sol`; the official page supplies no dated snapshot for this model.

Vector/hybrid query medians were 365.5/815.4 ms. Answer-input totals were
30,053/30,229 tokens and output totals 209/229; injected-memory medians were
770.5/771.5 tokens. These are observed small-run metrics, not cost/latency guarantees.
The API reported zero reasoning tokens for these answers despite the requested low
effort. Managed embedding/reranker token usage and cost were not measured.

All 64 scheduled quality answers completed without retries or truncation. One direct
READY preflight and one actual-host READY preflight are separate from that score:
66 total generation calls, with 65 in the host report. The 64 probes made 128
comparison queries; including the transport gate, the run made 130 queries and
submitted 1,409 documents. All 694 selected passages matched local source. Frozen
producer hashes, actual final prompts, 15-second provider spacing and session-only
key handling passed. Both owned collections were deleted and confirmed 404, with no
pending cleanup ledger. The maintained 315 tests, syntax and release checks passed.

<details>
<summary>All 32 case outcomes from this run</summary>

| Set | Case | Vector | English raw hybrid + Jev |
| --- | --- | --- | --- |
| initial12 | current-location | Correct | Incorrect |
| initial12 | earlier-location | Correct | Correct |
| initial12 | revoked-access | Correct | Correct |
| initial12 | canceled-meeting | Correct | Correct |
| initial12 | flashback-current | Correct | Correct |
| initial12 | flashback-past | Correct | Correct |
| initial12 | future-location | Correct | Correct |
| initial12 | completed-location | Correct | Correct |
| initial12 | speaker-preference | Correct | Correct |
| initial12 | speaker-possession | Correct | Correct |
| initial12 | stable-fact | Correct | Correct |
| initial12 | two-facts | Correct | Correct |
| diagnostic8 | exact-code | Correct | Correct |
| diagnostic8 | rare-name | Incorrect | Correct |
| diagnostic8 | exact-expression | Correct | Correct |
| diagnostic8 | place | Correct | Correct |
| diagnostic8 | semantic | Incorrect | Correct |
| diagnostic8 | correction | Correct | Correct |
| diagnostic8 | speaker | Correct | Correct |
| diagnostic8 | revoked-unknown | Correct | Correct |
| confirmation6 | new-rare-name | Incorrect | Correct |
| confirmation6 | new-exact-ticket | Incorrect | Correct |
| confirmation6 | new-paraphrase-journal | Correct | Correct |
| confirmation6 | new-paraphrase-medicine | Correct | Correct |
| confirmation6 | new-revocation | Correct | Correct |
| confirmation6 | new-historical-state | Correct | Correct |
| reference6 | intent-fire-supplies | Correct | Correct |
| reference6 | intent-journal-reference | Correct | Correct |
| reference6 | intent-person-reference | Correct | Correct |
| reference6 | intent-topic-switch | Correct | Correct |
| reference6 | intent-flashback-control | Correct | Correct |
| reference6 | intent-revocation-control | Correct | Correct |

</details>

## Earlier GPT-4.1-mini comparisons

| Stage | Comparison | Finding | Interpretation |
| --- | --- | --- | --- |
| Initial 12 cases | Vector / vector + Jev | Required evidence 12/12 each; exact matches 4/12 / 5/12 | Apparent gain was wording only, with no semantic gain |
| Known eight diagnostics | Vector / hybrid + Jev | Correct answers 6/8 / 8/8 | Rare-name and paraphrase misses rescued |
| Six new confirmation cases | Vector / hybrid + Jev | Correct answers 4/6 / 5/6 | Two gains, one baseline-correct answer lost; no-regression gate failed |
| Shared-question, 14 known probes | Original hybrid + Jev / shared-question hybrid + Jev | Tagged fact injected 14/14 each | Medicine secondary rank improved 30 → 1, with no delivery gain in this run |
| Five targeted answer pairs | Original hybrid + Jev / shared-question hybrid + Jev | Correct answers 5/5 / 4/5 | UNKNOWN despite the full medicine fact in the final prompt; answer gate failed |
| Final fixed-prompt diagnostic | Original full / shared full / shared relevant-only | 6/6 / 6/6 / 6/6 correct | Historical miss did not reproduce; no demonstrated benefit from removing distractors |
| Native English text, 14 known cases | Dual-analyzer manual OR / English-only raw text, both hybrid + Jev | Correct answers 14/14 each; all four lexical controls injected 14/14 | Tie; manual OR superiority and a quality gain from English-only analysis were not established |
| Remaining six controls | Vector / original hybrid + Jev / English raw hybrid + Jev | Correct answers 5/6 each, facts injected 6/6 each | Shared topic-switch answer failure with evidence present; no new gains or losses |

The initial answers shared an unsupported elaboration: both changed “blue tin” to
“blue paint tin.” Eleven other cases had supported answers. The exact-match gain
was “Theo was the orchard gardener” versus “Orchard gardener,” both correct. Preserve
that distinction; a format-sensitive score is not an adoption decision.

Hybrid + Jev's positive evidence is real but narrow. It rescued the known rare-name
and semantic cases, retained the six baseline-correct diagnostic answers, and
recovered a correction omitted by unreranked hybrid. In new confirmation it rescued
rare-name and exact-ticket answers, while losing the medicine-location answer.
Journal, revocation and historical-state answers were correct in both arms.

## What the failures mean

In the confirmation run, the medicine fact was absent from the primary top 30.
The secondary vector list ranked it second; hybrid fusion put it in a tied 25–30
range and Jev ranked it 30. The secondary relevance query was a neutral prior turn,
not the medicine question. The loss was candidate ordering/packing, not an edited
or deleted fact leaking back. Do not attribute the entire vector 2 → reranked 30
change to Jev; hybrid had already demoted it.

The next frozen comparison evaluated both hybrid lists against one current question
plus labeled reference context. Within that run all 14 paired candidate sets
matched, and only rerank.queryText changed. The medicine secondary rank improved
30 → 1, from score 0.3285 to 0.8925. However, its primary list now also contained the
fact and ranked it first in both arms. Relative to the prior run, each hybrid list
shared only 29/30 passage texts despite identical conversation source hashes. The
source of that cross-run candidate drift was not established; do not label it an
ANN defect, lexical-tie defect or reranker defect on this evidence.

Both final medicine prompts contained the complete BIRCH-CUPBOARD statement. Memory
used 776 tokens in the original arm and 764 in the shared-question arm, below 800.
Other selected distractors and speaker patterns differed. The original answer was
correct; the shared-question answer was UNKNOWN. This is a generation failure with
evidence present, not missing injection or budget exclusion. Rare-name, correction,
revocation and historical-state answers remained correct in the other four pairs.
The six newly frozen reference/temporal confirmation cases were not run under that
protocol because the diagnostic answer gate failed. They were later executed in
the separately authorized English-text confirmation below; the original gate remains
failed, and the shared-question arm was not carried into the new comparison.

## Final generation diagnostic

Replay the two stored actual-host medicine requests with identical message arrays
and recorded options; for the third arm, remove past-excerpt messages without the
medicine fact from the shared-question prompt. Keep the intact fact, speaker label,
system messages, recent turns and question. This third arm uses **oracle selection**:
it is a mechanism diagnostic, not an implementable retrieval improvement.

Each arm has six scheduled calls, in all six permutations of arm order. The protocol,
runner, source report and request hashes were frozen before traffic. The cap was
18 scheduled answers/22 attempts, up to four transient retries, 15-second start
spacing; no successful-answer retry or post-result prompt tuning. All 18 calls
completed without retries; every answer was exactly BIRCH-CUPBOARD.
Input/output totals were 5,700/36, 5,628/36 and 1,362/36 respectively. The lower
third-arm input reflects oracle removal, not a measured product token saving.

These are **direct OpenAI replays of retained SillyTavern requests**, not another
host integration or LambdaDB run. No remote memory data was created. Six repetitions
per arm do not estimate general reliability or establish that distractor removal
helps. The historical UNKNOWN remains in the evidence; it is not replaced by a
successful repeat. The historical failed request and the successful replays have
the same recorded messages/options. Fingerprints were stable within each replay arm but differed
between arms; the historical host report did not capture that field. These data
cannot separate model variability from backend changes across runs, or prove that
the surrounding excerpts caused the earlier miss. No further paid sweep is needed
to close this non-adoption decision.

## Native English text follow-up

The user requested a specific follow-up: delegate the original question to LambdaDB
with an English-only analyzer instead of regex splitting and quoted OR construction.
The original configuration already used `['english', 'korean']`; it was not missing
English analysis. Multiple analyzers apply independently to the field, not as
language detection. See the official [analyzer guide](https://docs.lambdadb.ai/guides/collections/choose-text-analyzers)
and [query-string guide](https://docs.lambdadb.ai/guides/search/query-string).

Reuse the exact eight diagnostic and six confirmation dialogues/questions, without
new cases or post-result tuning. Within one physical story collection, store identical
content in `text` (English + Korean) and `text_en` (English only). All arms share the
same document IDs, branch and managed vectors; embedding and Jev continue to read
`text`. Only the lexical field and query construction differ. The raw lexical clause
is the following, inside the existing filtered hybrid/RRF query:

```js
queryString: {
    query: originalQuestion,
    defaultField: 'text_en',
    skipSyntax: true,
}
```

`skipSyntax` treats the question as ordinary text instead of Lucene syntax; field
analysis still applies. Keep each retrieval leg's own text as `rerank.queryText`,
not the previously tested shared-question target. Rotate the four probe arms, then
alternate the two answer arms using exact captured-candidate replay through the
actual host. Keep the shared model, 800-token budget, two top-30 queries, isolation
filters, branch and consistent reads unchanged.

| Lexical configuration, all hybrid + Jev | Fact retrieved | Fact injected | Correct host answers | Median query latency |
| --- | --- | --- | --- | --- |
| English + Korean, manual OR | 14/14 | 14/14 | 14/14 | 818.7 ms |
| English + Korean, raw question | 14/14 | 14/14 | Not generated | 785.3 ms |
| English only, manual OR | 14/14 | 14/14 | Not generated | 818.9 ms |
| English only, raw question | 14/14 | 14/14 | 14/14 | 788.2 ms |

There were zero answer gains and zero losses in the concurrent comparison. All 28
answers exactly matched their expected identifiers/UNKNOWN; direct inspection of
the questions, source facts and responses agreed with the automatic grader. The
original/candidate arms used 13,248/13,266 input tokens and 67/67 output tokens;
median injected memory was 775.5/775 tokens. These differences do not establish a
latency or cost advantage. Managed embedding/reranker cost was not measured.

Ranks and surrounding excerpts changed without changing the final answers. For the
medicine case, primary/secondary target ranks were 30/1 in the original arm and 1/2
with English raw text. For Neralith they were 1/6 and 5/1 respectively. Therefore this
is not a uniform ranking improvement. The historical medicine failure did not recur
in the concurrent original arm either; do not credit that recovery to the new
configuration or replace the historical failure with this successful repeat.

**Decision:** raw text with English-only analysis is a reasonable, simpler basis
for any future English hybrid implementation; these cases provide no evidence that
manual OR is better. This is a neutral quality result, not proof of equivalence or
reranker adoption. All four arms reached the fact-coverage ceiling, so the controls
do not establish a quality benefit from either individual setting. These are known,
compact synthetic diagnostics, not held-out validation, multilingual evidence or a
new vector-only comparison. Product schema/search defaults remain unchanged.

The first attempt stopped at its schema assertion because a test hook was installed
before a browser reload. It ran zero comparison probes/answers; both owned
collections were removed. After moving installation after the reload, the unchanged
quality protocol completed 56 probes (112 comparison queries), 28 actual-host
answers, and zero provider retries. All reranks reported `applied`; 588 selected
passages matched local source exactly. The corrected run submitted 645 documents,
made 114 queries including its transport gate, and deleted both owned collections
with confirmed 404 responses. There are no unresolved cleanup ledgers. Frozen hashes,
request construction, final prompts, provider spacing and session-only key handling
were verified. The setup failure and correction remain in the evidence bundle.

## Remaining six-case confirmation

At the user's request, execute the six previously frozen but unexecuted
`rerank-intent-v1` cases, preserving their exact fixture bytes and 44-turn builder
from 763906a. Compare production vector search, original hybrid + Jev and English
raw-text hybrid + Jev concurrently. The original shared-question protocol was stopped;
this is a new bounded comparison of the English-text candidate, not completion or
passing of that earlier gate. All settings and field-sharing controls above remain
fixed. Rotate arm order and generate each answer once through the actual host from
its captured live candidates: 18 probes and 18 answers.

| Condition | Tagged fact retrieved / injected | Correct answers | Median query latency | Total answer-input tokens |
| --- | --- | --- | --- | --- |
| Production vector | 6/6 / 6/6 | 5/6 | 356.5 ms | 5,616 |
| Dual-analyzer manual OR + Jev | 6/6 / 6/6 | 5/6 | 719.5 ms | 5,562 |
| English-only raw question + Jev | 6/6 / 6/6 | 5/6 | 729.2 ms | 5,566 |

All three answer the paraphrase, object reference, person reference, flashback and
revocation controls correctly. English raw has zero gains and zero losses against
either comparator. Direct inspection of all source/context and answers agreed with
the identifier grader. The flashback also has an earlier statement independently
supporting its current-venue answer; tagged fact coverage is not complete scoring.

All three fail the **topic-switch** question: “Changing topic: where is the kitchen
ledger kept?” The expected answer is `MAPLE-CABINET`. Vector answers `UNKNOWN`;
both hybrid arms answer `CABINET-339`, the location of a different, numbered ledger.
The exact correct statement is present in all three final prompts. It ranks 1/2 in
the vector lists and 2/1 in both hybrid lists. Both hybrid prompts also include the
numbered-ledger distractor associated with their wrong answer. Thus this is an
answer failure despite delivered evidence, not a top-30 retrieval or 800-token
exclusion. Distractor/entity confusion is a plausible interpretation, not an isolated
causal finding: surrounding excerpts differ and there is only one answer per arm.
Do not repair the score by retrying this answer or changing its fixture.

**Decision:** the six remaining controls show no additional English-raw regression,
but also no answer improvement over vector. Retain the product defaults. Together
with the prior comparison, the two hybrid configurations each score 19/20, but these
known/authored sets are not a general benchmark; vector was rerun on these six only.
The concrete remaining quality issue is distinguishing the requested entity from
similar supplied excerpts when switching topics. A future change should address and
validate that behavior directly, rather than increase candidate count or memory
budget on the assumption that this fact was missing. Shared-question reranking,
natural long-history and public-benchmark results for this candidate remain untested.

All 18 provider calls completed without retry; all 24 rerank responses were applied.
The 180 selected passages matched local source. The run submitted 277 documents,
made 38 queries including the transport gate, and deleted both owned collections
with confirmed 404 responses. Frozen hashes, final prompts, session-only keys and
15-second provider-start spacing passed. No pending cleanup ledger remains. The
315 maintained tests, syntax and release checks passed again. One-off producers and
raw output remain archived, without new product code or CI dependencies.

## Shared method and practical limits

The three earlier stages used real SillyTavern 1.19.0, revision
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, browser CORS, SDK 0.7.0 and live LambdaDB
managed embeddings/Jev `jev-1.13.0`. Answers went through the actual host and its
local test forwarding bridge to OpenAI. The staged answers replayed exact captured
live candidates with query/owner/scope/branch identity and final-prompt checks.

The earlier stages used gpt-4.1-mini-2025-04-14, temperature 0 and output cap 256. Host runs
kept a 32K context, recent=4, memory budget=800, k/size/candidateSize=30, existing
chunking/interleaving, explicit chat branch, owner/scope filters and consistent reads.
Default Jev criteria were used. Tagged-fact coverage is not complete semantic
coverage; earlier statements can independently answer some historical questions.

Initial vector/Jev median query latency was 322/673.5 ms; confirmation vector/hybrid
+ Jev latency was 344/665.7 ms; the shared-question comparison's two hybrid arms were
765.6/766.7 ms. Initial input/output totals were 11,310/69 and 11,260/71; confirmation
5,767/19 and 5,755/26; shared-question targeted pairs 4,744/22 and 4,733/17. These small
differences do not demonstrate cost savings. Managed embedding/reranker costs were
not measured. Compact synthetic dialogues, explicit temporal wording and single
host-answer pairs are not a public benchmark or natural 32K-overflow evaluation.

## Validation and retained changes

The earlier stages completed 24, 28 and 10 actual-host answers, without retries.
The latter two completed 44 and 42 live probes. They verified 461 and 438 selected
passages against local source; all rerank responses were applied. Three owned
collections per run were deleted and independently verified absent; no cleanup
ledger remains unresolved.

The initial raw report still records a teardown failure caused by an obsolete UI
completion phrase. Separate read-only verification confirmed all three collections
404 and owner lists empty, with no recovery deletion. Its final hash map also omitted
src/delivery.js despite a matching initial plan/end-of-run hash comparison. The
current generation harness retains both independent fixes: the current deletion
completion phrase and all initially frozen files in the final hash map.

Experiment-specific hooks, staged runners, fixtures, protocols and their nine unit
tests were archived before removal. The corrected exact-match evidence guard and
its regression test remain in that historical source, not as orphan active tests.
Current checks pass 315 unit tests, all script/runtime syntax, release metadata and
locked SDK rebuild. The pinned actual host/Chromium with a local HTTPS LambdaDB
emulator passes 37 lifecycle checks, ending with zero collections. This is emulator
evidence, separate from live provider results. Product runtime/UI and dependencies
are byte-for-byte unchanged from develop. Archived flags fail before reading keys
or making network requests; current CI needs no historical artifacts.

## Evidence and reproduction

All bundles are **local-only**, under
`/Users/steven/Dev/sillymemory-managed-reranking/artifacts/archive/` and unavailable
in a fresh clone. Preserve them before removing this worktree. Original bundles are
unchanged; full prompts, scores, failures, frozen inputs/settings and detailed
historical conclusions remain inspectable.

| Bundle | Exact producer / contents | SHA-256 |
| --- | --- | --- |
| managed-reranking-v1/evidence.tar.gz | 7af0568; initial comparison and separate cleanup receipt | 9a3081415fce4703aa111c019c6167bf859a16090dd7546815a11c874cb6bf03 |
| rerank-rescue-v1/evidence.tar.gz | f2f274a; diagnostic gains and confirmation regression | 35871f24ba6af95f0701cdc48b7fce71ce1749f8a78fcd98e7ea040de01e1393 |
| rerank-intent-v1/evidence.tar.gz | 763906a; shared-question run, its frozen stop and post-run guard patch | f16249c031d454fe55a38e405ed583accbc5b37d59f639834e052302a6144df0 |
| rerank-closeout-v1/evidence.tar.gz | Frozen replay runner/plan; full pre-cleanup source at 76293ab; retired-file index; final checks | 8af324a4388a28c451ed5b87437339f582982c73737a38c8b9af570e9b88e19e |
| english-text-v1/evidence.tar.gz | Base e968b90 plus frozen one-off producer; four lexical controls, 28 host answers, setup failure/correction, verification | e7afc3835df883c137eef9f9b83fd7fb40035d4c7b34f814d18a52de98f71dee |
| english-confirmation-v1/evidence.tar.gz | Base e65e539 plus frozen one-off producer; six previously unexecuted controls, three arms, 18 host answers, shared failure and verification | c8242a6df8b0b646167adf9cc95152fda3e1a2882260e240ad5b4ac84c8f447f |
| gpt61-comparison-v1/evidence.tar.gz | Base 3f80946 plus frozen producer; all 32 cases/two arms, 64 GPT-6.1 Sol answers, source reviews, preflights and verification | 641a16d18c25f61cd35f190387bb3d8e6389ef716e44ffde08fd0a4e7c4d66cf |
| fusion-analysis-v1/evidence.tar.gz | Base 02ee82d plus one-off producer; 32-case live component scores, local Bayesian/Jev replay, focused server controls, preserved 503/recovery and Java arithmetic verification | 90c8ee5f669d3e98b4c2b7e1a63919d29eedd31367613bbb23f28131a3416b22 |

The closeout bundle is 1,260,312 bytes with 21 members, all read back byte-for-byte.
Its pre-cleanup source contains 311 files verified against commit 76293ab; all 15
retired/consolidated paths match the preservation index. Configured secrets were
absent. The frozen replay verified all 18 request hashes, exact source/options,
provider-start spacing and completion records.

The English text bundle is 1,430,771 bytes with 23 members, verified by exact
readback and configured-secret scan. Its base source contains 298 verified files;
all four preceding archives retain their recorded hashes. The extra runner and
experimental field remain ignored artifacts, with no product or CI dependency.

The remaining-controls bundle is 1,083,051 bytes with 19 members. Exact readback,
298 base-source files and configured-secret absence were verified; all five
preceding archives are unchanged. Its protocol and verifier preserve the shared
wrong answers as quality failures despite successful execution and cleanup.

The GPT-6.1 bundle is 1,480,964 bytes with 27 members and 298 verified base-source
files. Exact readback and configured-secret absence passed; all six earlier archives
are unchanged. The full run, case matrix and separate source-grounded reviews are
preserved, including the hybrid current-location regression.

The fusion bundle is 6,769,871 bytes with 37 members and 298 verified base-source
files. It includes the frozen original input report, exact protocols before/after
the bounded transport recovery, both producers, component scores, candidate sets,
local/Java arithmetic checks and all cleanup receipts. Exact readback and
configured-secret scan passed; the seven earlier archives remain unchanged. The
archive's README separates offline verification from paid live reproduction.

For historical host reruns, restore the relevant archived source/protocol and pinned
host; original commands are in those preserved records. The current runner no
longer offers the retired reranking modes. The closeout runner's --freeze/--run
commands and exact retained request bodies live in its bundle. Reproduction is
paid traffic with possibly different outcomes, not a required CI step or unfinished
part of this adoption review.
