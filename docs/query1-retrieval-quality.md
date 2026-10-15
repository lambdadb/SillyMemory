# Query1 retrieval quality and ranked memory assembly

## Decision (2026-10-16)

Adopt retrieval-order admission using the final rendered memory size. Remove the
unassembled source-floor/refill stages that could reserve space for lower-ranked
hits before higher-ranked evidence was reconsidered through assembly.

Retain Query1, original source chunks, managed embeddings, English Bayesian fusion,
Jev, vector k100, rerank candidate 100, final size 50 and the 4096-token memory budget.
Keep existing native timestamp formatting; do not promote contextual retrievalText,
200-deep search/reranking, the temporary dev SDK or the benchmark session-time map.
This work changes selection, not search, stored documents or model/API settings.
The code is validated in the work branch; no merge, release or deployment is claimed.

This completes one bounded quality decision across the previous diagnostic stages
and the selector fix. Detailed run outputs and the original stage-by-stage notes
are retained in verified local archives rather than maintained as growing scratch
reports or permanent CI fixtures. The base is Query1 PR 83's squash commit
`df95a03d6a38a9837be64c62995fcf9cd9238092`.

## Selection defect and implementation

The previous pipeline first selected whole passages before assembly, preserved
that selection, and then refilled saved space. A short lower-ranked hit could
therefore prevent an earlier rejected hit from entering even when that earlier
hit fit the final assembled representation.

The replacement visits valid hits once in retrieval order. For each hit it renders
the accepted sources plus that hit, compares separate and assembled layouts of the
same complete source set, and counts the cheaper final text. Accept it if it fits;
otherwise continue with later hits. There is no target-specific replacement,
lookahead, body truncation, role preference or extra retrieval/model call. It is
rank-ordered greedy admission, not a globally optimal evidence/knapsack solver.

Validation still precedes ID deduplication. Only current expected documents supply
text, role, speaker and offsets; foreign, stale, deleted or mismatched-time hits
are rejected. Assembly keeps identity/time boundaries, opaque repeated citations,
exact overlap checks, explicit gaps and literal macros. Presentation stays in
conversation/chunk order; admission follows retrieval order. Token failures stop
selection, and complete rendered text is checked against the same host-supplied
budget. The host's quarter-context cap and recent-five/pair policy are unchanged.
See [source assembly](source-assembly.md) for the current contract.

### Muir Woods: rank 29 fits without a larger budget

The question asks for the order of three completed trips. The necessary Muir Woods
family-hike source is original zero-based message 326 (display 327), returned at
rank 29. This is a message position, not a chunk number.

In the frozen benchmark-only shared-session-map representation:

| Selector | Selected retrieval ranks | Memory tokens | Muir source |
| --- | --- | ---: | --- |
| Previous floor/refill | 1–28, 36, 38 | 4085 | Missing |
| Final-layout admission | 1–29 | 4087 | Complete |

Appending 29 while preserving the old set costs 4178 tokens. That append-only
measurement did not show that a larger budget was necessary: replacing the
lower-ranked reserved sources fits. The new selector achieves this without a
special-case swap. Muir was already delivered and answered correctly under the
original product representation; the shared-map recovery is a diagnostic of this
selection defect, not a new product-answer gain.

## Frozen 500 selection regression

Reuse the original 500 real LambdaDB product100 query responses and source IDs,
text/spans, ranks and budgets. Reproduce the old selector exactly, then change
only selection. Compare separately within original native formatting and the
frozen benchmark shared time-map formatting; do not mix these interventions.

| Measure across 500 questions | Original product representation, old → new | Shared session map, old → new |
| --- | ---: | ---: |
| Selected passages | 16983 → 16798 | 15937 → 15797 |
| Median selected passages | 33 → 33 | 32 → 31 |
| Annotated messages with any source delivered | 883 → 883 | 882 → 882 |
| Complete annotated message bodies | 877 → 877 | 876 → 876 |
| Changed final memories | 206 | 173 |
| Lost annotated messages | 0 | 1 |
| Recovered annotated messages | 0 | 1 |
| Maximum final tokens | 4096 | 4096 |

Annotations are not an exhaustive inventory of every relevant fact. A lower
passage count can reflect preferring a larger high-ranked source; it is not by
itself evidence of worse recall. All 1000 old selections/messages/token counts
reproduce, and independent verification checks new final text tokenization,
returned-source membership, rank order, source presentation and date references.
Both previously useful today-event date dependency pairs remain complete.

The shared map recovers Muir but loses `b6025781` message 185 at rank 30: the user's
quinoa/roasted-vegetable protein preference. Higher-ranked sources 27–28 now enter
first and consume that space. The original product representation keeps this
source under both selectors. Defer the map; do not hide this tradeoff with a
combined score, a larger budget or an oracle-based source rule. No shared-map 500
answer run is claimed.

## Completed answer regression

Run all 500 questions with the new selector and original product representation:
`gpt-6.1-sol`, reasoning low, max completion 4096; official LongMemEval judge
`gpt-4o-2024-08-06`, temperature 0, max tokens 10. Original native system/character,
recent dialogue, query responses, memory budget and judge templates remain fixed.
This is actual OpenAI generation/judgment on frozen host-derived prompts, not a
new browser/LambdaDB retrieval run. The earlier baseline is non-contemporaneous.

| Measure | Earlier unchanged selector | Ranked final-layout selector |
| --- | ---: | ---: |
| Official correct /500 | 467 | 469 |
| Accuracy | 93.4% | 93.8% |
| Answer input tokens | 2524218 | 2523802 |
| Answer output tokens | 30015 | 30655 |
| Answer API median /p95 | 2400/5416 ms | 2505/5586 ms |

There are 9 gains and 7 losses. All 16 changed labels were read alongside both answers;
none was overridden or selectively rejudged. Of 294 byte-identical generation
prompts, four gained and five lost correctness. Of 206 changed prompts, five gained
and two lost. Thus the +2 aggregate difference does not establish a causal quality
improvement. The existing 500 have already been used for development, not independent
confirmation. Timings are actual provider spans, not a controlled speed comparison
or browser end-to-end latency; token counts are not an invoice-based dollar cost.

Important interpretations:

- The train/taxi loss occurs under an identical prompt: the model uses an assistant
  fare estimate instead of the user's conflicting quote. This is answer generation,
  not new evidence eviction.
- The two losses under changed prompts preserve the needed sources. The plant
  answer distinguishes a rolling month from a calendar month; the follower answer
  prefers 1250 confirmed over a later uncertain near 1300 statement. Both are
  reference/uncertainty interpretation issues, not demonstrated source loss.
- Website 19 days and church 30 days answers give the same numeric facts as before.
  Near-equivalent workshop, aunt, museum, ratio and abstention responses also
  receive different labels. Retain the official score while disclosing sensitivity.
- Commute advice drops a visual-reading suggestion; several preference outputs
  change wording without demonstrating recovery of a missing fact. Do not credit
  every gained label to retrieval or assembly.

All 500 answers and 500 judges finish: 1000 provider calls, zero retries/errors,
310094 ms elapsed. Admission uses server rate headers and at most 6 concurrent calls,
with no fixed delay after success. Complete responses, request hashes, models,
finish statuses and independently rebuilt official judge prompts are verified.

## Previous candidates and why they remain deferred

| Candidate / observation | Completed evidence | Decision |
| --- | --- | --- |
| Preceding-message contextual retrievalText | 440/500 versus its 469/500 Query1 control; 4 gains, 33 losses; embedding input 2.161 times | Reject after full regression. Added context can introduce topic/entity noise; keep original chunks. This earlier control is distinct from the later 467 baseline. |
| Helmet vector diagnosis | Necessary source exact rank 103 among 972 documents; server top 100 matched exact top 100 | Not demonstrated ANN approximation failure. Top 100 leg limits excluded it. |
| Temporary dev SDK/depth 1000 and candidate 200 pilots | Recover helmet, age, museum and sculpting facts; age answer remains interpretation-sensitive; increasing rerank pool roughly doubles scored documents | Useful diagnosis, not a default-adoption result. Product SDK remains 0.8.0. |
| Matched full 500 k100/c100, k200/c100, k200/c200 | 467, 465, 464 correct; candidate 200 query median 1181 ms versus 707 ms, Jev 933 ms versus 465 ms | Defer deeper defaults; fact recoveries do not establish aggregate answer improvement. All 500 owned collections deleted with 404 confirmation. |
| Explicit date provenance per excerpt | Native path already captures/stores/validates host times, but benchmark send_date was 0. Benchmark session-clock delivery gives 466/500 versus 467; 10 gains, 11 losses | Repairs two date dependencies, but adds prompt pressure and does not establish aggregate gain. Session clocks are not event times. |
| Shared session-time map | Removes repeated metadata, raises selected passages 14996 → 15937 versus repeated-date format; old selector still loses Muir | Defer after subsequent selector replay also shows a meal-preference loss. No paid answer score for this map. |

Raw benchmark session clocks have unknown timezone and are shared by many messages.
They must not be invented as exact UTC message/event instants. Valid native host
message timestamps remain supported. Dates of utterances can anchor explicit
today references, but cannot prove when an undated past-tense event happened.

## Validation boundaries

- `npm test`: 369 passed, 0 failed, Node 24.15.0. Small fixed regressions cover the
  higher-ranked assembled fact beating lower-ranked short filler, exact budgets,
  source/time isolation, stale/deleted/forged hits and fail-closed token counting.
- `npm run check`, `npm run check:release`, `npm run check:sdk` and
  `node --check` for all maintained scripts/tests pass. SDK 0.8.0 bundle unchanged;
  release metadata remains 0.4.0 dated 2026-10-13. Node 20 CI matrix was not run locally.
- Real pinned SillyTavern 1.19.0 (`06bde939fb1e9c4c8d8641d810f0a916b5bce127`)
  and Chromium 153.0.8010.12: 102 browser checks pass, including actual extension
  dispatch, source assembly, edits/swipes/deletion/races, reload and cleanup.
- `prompt-delivery-smoke.mjs`: 18 allocation/delivery cases plus overlap, repeat
  and same-message assembly checks pass. Full sources/native roles reach the local
  completion endpoint; final verification and stored-history preservation pass.
- The first delivery attempt failed an old five-excerpt expectation. Rank-priority
  admission selects four groups containing all higher-ranked repeat citations,
  displacing a lower-ranked fifth excerpt in this existing Korean synthetic input.
  Preserve that observed selection difference; it is not a Korean quality gain.
  Updated fixed expectations still check complete bodies, exact citations, roles,
  unchanged history and final dispatch. Initial report/log/screenshot remain retained.
- Browser runs use local HTTPS LambdaDB and completion emulators, zero external
  provider calls, and end with zero emulated collections. Separately, the 500 answer
  run uses actual OpenAI. No new live LambdaDB write/query, model sweep, release,
  deployment or claim of fresh managed-provider verification accompanies this fix.

## Evidence and reproduction

New selection bundle: `artifacts/ranked-assembly-full500-v1/` contains the frozen
plan, original/candidate producers, 1000 selection results, independent verifier,
source/test snapshots, browser/delivery reports, initial failure and checks.
New answer bundle: `artifacts/ranked-assembly-answers500-v1/` contains all 500 frozen
inputs, 1000 request/response receipts, official labels, analysis and review of all
16 label changes. Dataset SHA 256:
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`;
official judge source SHA 256:
`ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251`.

The complete earlier stage notes are preserved byte-for-byte as
`ranked-assembly-full500-v1/prior-stage-notes.md`, SHA 256
`1551722c70bc4f56830b7bacb3815873d6b346c4ff5cba3b00bc7c4dc23f0538`. No original evidence was removed or overwritten.
Each archive contains its file manifest; readback verifies every member. The new
bundles also passed configured-secret scanning including decompressed receipts.

All archives below are **local-only** under the retained worktree's `artifacts/archive/`;
they are not uploaded or available from a fresh clone. Reproduction requires these
bundles and the retained licensed dataset/input/query dependencies identified by
SHA 256 in each plan. Extract into an ignored artifacts directory and use its frozen
producer sources, not a later changed runtime. Local verification entry points are
`node artifacts/ranked-assembly-full500-v1/verify.mjs` and
`python3 artifacts/ranked-assembly-answers500-v1/verify.py`; the latter does not
send model requests. Do not discard the worktree until unique archives have another
verified retained copy. Older original archives remain immutable.

| Local archive filename | SHA 256 |
| --- | --- |
| `retrieval-stage-audit-v1.tar.gz` | `8852bc3095bcbb074ff55b60b0ba0a43aa3170b8dedd44031a4e5b15ef90898c` |
| `retrieval-stage-score-variation-v1.tar.gz` | `f9f9a78ebdab49f05484461ef912da0932d500264962e9df4b8043a050f59b7c` |
| `contextual-retrieval-pilot-v1.tar.gz` | `2ee7e4650f75c784fea728cfa4f5caf5e237736e5b2653afdfdfcf6eb08f776c` |
| `contextual-pilot-answers-v1.tar.gz` | `0557d38a0d62714b955fa03a9090060f4f3ecb24f77f8f1ff9f7eca02aa5ee3e` |
| `contextual-retrieval-full500-completed-v1.tar.gz` | `cb073911a2732f7ede8c5ed811b7c0d77576544deb9f63c842f99671ff127331` |
| `contextual-retrieval-full500-review-v1.tar.gz` | `cf55559fd5ac97672a53ca1b7591ba81648d19484c62e49ab2e5cd1b2f8aa3b9` |
| `helmet-vector-diagnosis-v1.tar.gz` | `edb107c93fe2b95dbeb01eefee38c1f861e66b53a90ef382cca1e47a1af77673` |
| `sdk-dev-depth-v1.tar.gz` | `4128d603350cb7f69b09ac0922ee7ae784cc3137e3fd10eba94c7ec8dc21302f` |
| `jev-candidate-200-pilot-v1.tar.gz` | `83e86165ae77817eb58d32b9ad1aa26478dd6eaeef1c53ec9600bf7911184140` |
| `vector-k-200-pilot-v1.tar.gz` | `7c7875a513c7850961fa9b31c15533d5f5481e6b5a4c9d60e8247f5d0d991bfd` |
| `retrieval-200-full500-v2.tar.gz` | `677ec026faedb8c3b44264659f793903f955a07123ffe35135ed27f989362230` |
| `date-provenance-path-audit-v1.tar.gz` | `b78ee2f69bf587191421f3c21525cc9915b6ed1dd036383166a87b704914260f` |
| `date-provenance-full500-v1.tar.gz` | `fad914851997b3d5886e16999c2a0cf3373422cb66b3e00acf17ced9297f6311` |
| `date-provenance-answers500-v1.tar.gz` | `2c67e0084789f7deba15ef33c147eb64a6154284bcb16cafa412af328d30f39d` |
| `session-time-map-full500-v1.tar.gz` | `aa1f8dd391cc8264353889444cc08c3044d64283f797aad6b36b86230681fa6b` |
| `muir-woods-injection-audit-v1.tar.gz` | `d6869cd65f55222ccbf240e16140173479a45af25f8be504b585ef49820e52ea` |
| `ranked-assembly-full500-v1.tar.gz` | `67c7e20e67aa4fae22b318c33d46074cc0e5d2cc4e18ec7efa6824b59ee6bb35` |
| `ranked-assembly-answers500-v1.tar.gz` | `8008b97f410c69a692215b7790a64dc7c109fe35969ceb3461981956bfeff519` |
