# BEAM 10M Small/Large embedding screen

## Decision (2026-10-19)

**Defer Large adoption and retain original-text managed OpenAI Small.** The
40-question development screen finds real new evidence with Large, but also loses
concrete facts already delivered by Small. It does not establish a net benefit
that justifies the higher embedding cost. Stop at the frozen screen gate: the
remaining 160 questions and fresh paired answer/judge calls were **not run**.
This closes the bounded product decision; it does not claim Large is globally
inferior or that generated answers became worse. No product defaults changed.

This is a new comparison after [PR #84](https://github.com/lambdadb/SillyMemory/pull/84)
merged. The [earlier BEAM scores](beam-evaluation.md) and retrievalText decision
remain unchanged. No phrase search, extra generation model, dimension sweep,
new judge, deployment or browser-quality claim is included.

## Frozen comparison

[Input/settings lock](beam-large-embedding-inputs.json) records the measured
revision, immutable dependencies and full protocol checksum. All 40 questions in
10M chats 2/3 were included; the two original diagnostics are identified separately.
The other 160 questions were frozen conditionally but their baseline had already
been inspected. Neither cohort is unseen-data confirmation.

Both arms use identical original chunk `text` for English full-text search and
managed embedding. The same two owned collections contain Small and Large vector
fields. Server metadata verifies cosine distance and provider defaults of
**1,536 / 3,072 dimensions**. Original source text, metadata, query text, Bayesian
fusion, k200, native Jev1.13.0 candidate 200, default reranking criteria and fields
(`role`, `batch_time_context`, `text`), final 50, ranked 4096 packing, and four recent
messages plus the active probe are fixed. No retrievalText prefix is used.

The original BEAM generation guidance is frozen verbatim, including its older
relative-day wording. The later product guidance change is not a treatment here.
Batch reference dates are **not message send times or event dates**. Source and
rubric annotations never enter runtime retrieval inputs.

Before querying, preflight checked 141,991 source chunks, 800 SDK request
serializations covering both arms/all 200, and 40 exact historical prompt replays.
The screen allowed two concurrent corpora, 160 search requests, 80 native reranks,
15,000 operation attempts, at most three attempts per operation, six hours and a
$12 modeled ceiling. The ceiling excludes unobserved billing components and is
not an enforceable invoice cap. Conditional whole-decision bounds remain in the
lock; they were not consumed by an expanded run.

## Retrieval and delivery

Counts below are **complete / partial / absent annotated source-message spans**,
not necessary-fact recall or answer correctness. Full source coverage requires
the union of returned original-text spans to cover the message. Partial coverage
receives no claim that the needed fact is present. Four questions have no source
annotations; all 40 are retained in raw results and context review.

| Cohort / stage | Small | Large |
| --- | --- | --- |
| All 40, 227 references: candidate 200 | 34 / 17 / 176 | 32 / 18 / 177 |
| All 40: final 50 | 28 / 15 / 184 | 27 / 15 / 185 |
| All 40: delivered 4096 | 23 / 14 / 190 | 21 / 12 / 194 |
| Other 38, 192 references: candidate 200 | 33 / 16 / 143 | 31 / 17 / 144 |
| Other 38: final 50 | 27 / 15 / 150 | 26 / 15 / 151 |
| Other 38: delivered 4096 | 22 / 14 / 156 | 20 / 12 / 160 |
| Diagnostic 2, 35 references: candidate 200 | 1 / 1 / 33 | 1 / 1 / 33 |
| Diagnostic 2: final 50 and delivered 4096 | 1 / 0 / 34 | 1 / 0 / 34 |

Delivery has one newly present annotated reference and five newly absent ones;
these affect one gaining and four losing questions. They are **not one fact gain
and five fact losses**. Candidate membership is identical before/after reranking
within each arm/case. All 32,000 returned chunks pass original-span checks;
all 80 assembled prompts replay exactly with final 50-only selection and the 4096
budget. Source-span union comparison finds 14 changed references in 8 questions,
including code-tail changes; no partial-to-partial union changes were hidden.

## Source review and gate

The source review covers all 14 changed annotated references and eight fact
witnesses frozen before candidate queries. All 40 selected-chunk differences are
retained, including unannotated messages. Screening the 217 chunks newly present
in Large candidate 200 and delivery identified additional gains/losses; 13 targeted
fact/alternative checks bind matching passages to original UTF-16 spans. This is
Codex semantic inspection, not an independent judge or exhaustive fact census.

| Case | Source-grounded interpretation |
| --- | --- |
| Chat 2 event ordering 0 | Large newly retrieves and delivers user 2062/2056 describing CARLA 0.9.24 with 20 sensor configurations. This is useful content, not proof of event dates from batch anchors. |
| Chat 2 summarization 0 | Large newly delivers user 6976: 220 vehicle paths, 170ms overlays, 75% GPU use. Small delivers the 300-agent/58fps milestone in user 6880; Large loses it. The 200–500 density ranges/94% fact survives through other user messages. Requested future GPU reduction is not an achieved improvement. |
| Chat 3 summarization 1 | Large newly delivers FastAPI function redundancy/250ms for 30 agents (user 12244) and TaskSplitter detail (user 12912). Small's Redis cache-miss/400ms for 30 agents (user 12992) disappears already at Large candidate 200. Both are relevant incident details; this is a substantive tradeoff. |
| Chat 2 information extraction 0 | Annotated user 11624 disappears from Large delivery, but user 11506/11914 preserve the asked 380ms physics fact. Do not count this as an answer-fact loss. |
| Chat 2 preference following 0 | Large delivers Deborah's 10% call-reduction/20% speed recommendation (user 5570). It was already in Small candidate 200/final 50; this gain is ranking/packing, not new candidate recall. Both retain the inter-module-call bottleneck in user 5574. |
| Chat 3 knowledge update 0 | Historical 20-agent/90%-target context disappears; current 25-agent/93% evidence remains. The latest source loses only its code tail. |
| Chat 2 temporal reasoning 1 | The lost user source says July 1, 2024, while the rubric asks for 2025. Neither batch dates nor assistant plans resolve this reference contradiction; no verified 2025-event loss is asserted. |
| Original diagnostic 2 | Chat 2 summarization 1 and chat 3 event ordering 1 have unchanged annotated coverage. In the latter, neither arm delivers the specific MQTT 200ms/30-agent or Redis 400ms/30-agent incident. Generic Redis caching plans are insufficient. |

Other source changes are candidate-only advice, a final 50-only launch statement,
or an extra mock-test code tail; the asked 5,000 mocked points stay delivered.
Generic assistant grid/profiling advice does not establish completed user work.
Large also adds named-module examples to chat 3 instruction following 1, but Small
already supplies ReportBuilder and CPUMetrics; more examples do not prove repair
of that requirement. Original reference ambiguities and labels are preserved.

The **positive discovery threshold is met**: concrete new candidate-and-delivered
content exists in multiple non-diagnostic questions. The **preservation/net-benefit
gate is not met**: verified losses accompany those gains, diagnostic incident
failures remain, overall annotated coverage falls, and embedding cost rises 6.5x.
The decision to defer is conservative product judgment, not arithmetic cancellation
of unlike facts or a statistical claim. No new answer scores can be inferred.

## Resource use and verification

The live screen finished in 1,724.662 seconds (28m45s): 141,991 documents, 160 search
requests, 80 native reranks, 4,430 logical operation attempts, zero errors/retries,
and two additional read-only schema checks. Both owned collections were deleted
and verified absent with 404. No generation or judge requests were sent.

At the checked [LambdaDB rates](https://lambdadb.ai/pricing), 19,272,127 document
input tokens per arm model Small embedding at $0.4047 and Large at $2.6306 (6.5x).
Paired write is $0.1817; query embedding, read minima and native-rerank token proxies
bring the combined estimate to **$3.3579**. This excludes unknown physical storage
and unreported billing overhead, before free allowances; it is **not an invoice**.
Two vectors in shared test collections also differ from single-arm production
storage. The admission ledger reserved $3.9663; that is not final measured cost.

Native reranked-query median/p95: Small 1,626/1,784ms; Large 1,646/1,873ms.
These are 40 calls per arm with alternating order and two corpus workers. Candidate
probes can warm caches. This is diagnostic latency, not an independent causal
benchmark or browser end-to-end latency.

Offline verification checks 94 locked file entries, exact source spans, independent
aggregate counts and all 80 prompt replays. Repository validation: `npm test`
(377 passed), `npm run check`, `npm run check:release`, `npm run check:sdk`, and
`node --check` for every `scripts/*.mjs` and `tests/*.js` pass. No new host run was
needed for this documentation-only change; historical host checks are not reruns.

## Retained evidence

The local-only bundle preserves the exact one-off producer, preflight, frozen
inputs/settings/runtime locks, raw SDK requests/responses, all 80 packed prompts,
timing/cost/cleanup receipts, all 40 analyses, semantic review and offline checks.
It is not a CI dependency and is unavailable in a fresh clone. The original
PR84 archives remain unchanged. See the archive receipt appended below and the
bundle's `RESTORE.md` / `FINAL-RESTORE.md`; do not blindly rerun the paid producer.

- Primary archive: `/Users/steven/Dev/sillymemory/artifacts/archive/beam10m-large-screen-v1/evidence.tar.gz`.
- SHA-256: `006c93f4919556c448dfef63679e464e444641655f84982401586777d9505cb0`;
  9,975,051 bytes, 299 members including manifest; every member read back and verified.
- Same-directory `manifest.json` SHA-256:
  `69fff9a7bed3ffb6f3016dc8e44d6bab86283004c4913ca8ac9b586a8e5c54cf`.
- Identical copy in the evaluation worktree's `artifacts/archive/beam10m-large-screen-v1/`.
  These are two copies on one machine, not independent remote backups.
- Configured-credential scan passed, including decompressed response/prompt files.
  No credentials or private chat data are included; sources are the frozen public
  synthetic BEAM corpus. The producer reads the primary `.env.local` directly.
- Producer base: `77ccc95a0c00efb0461d5ec0ee10f6268f83697d`; the archived one-off
  scripts and pre-call runtime/input locks bind the run to its actual source.
  No experiment infrastructure, raw results or scratch scripts enter maintained CI.
