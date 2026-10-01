# External memory benchmark selection

Review date: 2026-10-01. This is a source-based selection and experiment-design
record, not a completed benchmark, frozen run protocol, or claim of SillyMemory
superiority. No external benchmark adapter or new paid run is delivered here.
It complements the [evaluation follow-ups](evaluation-and-device-followups.md).

## Questions the next evaluation should answer

The existing 1,536-token synthetic comparisons establish narrow regression
behavior. The next evaluation should determine:

- When history fits a realistic configured context, can memory preserve answer
  fidelity while reducing actual input and total cost? Include memory losses.
- When history exceeds that context, which method recovers necessary evidence,
  handles corrections and time, and declines questions with no supporting facts?
- Does the answer use remembered preferences appropriately, beyond repeating a
  fact? Treat this as a later personalization question, not character consistency.
- Does memory stay correct as conversation proceeds? Separate ongoing updates
  from retrieval over a fully prepared, static index.

## Adoption evidence and its limits

Public provider evaluations support keeping LongMemEval and LoCoMo as external
reference points. [Mem0's evaluation documentation](https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/memory-evaluation.mdx)
reports LongMemEval, LoCoMo and BEAM; [Letta's evaluation](https://www.letta.com/blog/benchmarking-ai-agent-memory/)
uses LoCoMo. [Supermemory MemoryBench](https://github.com/supermemoryai/memorybench)
supports LoCoMo, LongMemEval and ConvoMem with interchangeable providers.

These are observed public uses, not a market-share survey, independent validation
of provider scores, or proof of an industry-wide standard. The review did not
establish a single replacement more widely adopted than LongMemEval/LoCoMo.
Different subsets, retrieval budgets, generators, judges and ingestion policies
make published scores unsuitable for direct ranking without protocol alignment.

## Candidate assessment

The priority column is a project decision based on the questions above, not a
ranking asserted by the benchmark authors.

| Benchmark and primary source | Useful coverage | Fit, limitation and priority |
| --- | --- | --- |
| [LongMemEval](https://github.com/xiaowu0162/LongMemEval) | 500 questions covering extraction, multi-session reasoning, updates, time and abstention. S has roughly 115K Llama 3 tokens per history; M is larger. | **First external suite: cleaned S.** A useful general memory reference. Measure lengths with our generator's tokenizer; the published token count does not prove that each request fits 128K. Oracle history is diagnostic only. |
| [ConvoMem](https://github.com/SalesforceAIResearch/ConvoMem) | 75,336 QA pairs covering user facts, assistant facts, changing facts, abstention, preferences and implicit connections, with different history sizes. | **Second suite.** Directly addresses full-context versus retrieved-memory tradeoffs. Synthetic assistant conversations are not representative character roleplay. Start with a declared stratified subset rather than the entire corpus. |
| [LoCoMo](https://github.com/snap-research/locomo) | Long conversations with temporal, multi-hop and other memory questions. | **Follow-up comparability suite.** Keep original categories, answerability and scoring visible; a vendor's non-adversarial subset is not the complete benchmark. Check the dataset's CC BY-NC 4.0 terms separately from code before intended use or redistribution. |
| [PersonaMem](https://github.com/bowen-upenn/PersonaMem) / [PersonaMem-v2](https://github.com/bowen-upenn/PersonaMem-v2) | Dynamic user profiles and personalized responses; v2 emphasizes implicit preferences and provides 32K/128K history construction. | **Later personalization cohort.** Choose and pin one version; v1 and v2 are not interchangeable. User preference application does not establish fictional-character identity, voice or narrative consistency. |
| [DialSim / LongDialQA](https://dialsim.github.io/) | An agent plays a TV character in long, multi-party scripted conversations, answering spontaneous, temporal and multi-hop questions under time limits. | **Roleplay-oriented follow-up.** Closer in format to character chat, but multi-party mapping and response deadlines change the task. A one-to-one adaptation must be labeled; inspect possible prior model knowledge of the TV scripts with a no-history control. |
| [GoodAI LTM Benchmark](https://github.com/GoodAI/goodai-ltm-benchmark) | Dynamic memory upkeep, combining information over time and prospective tasks that require acting on an earlier instruction later. | **Online-behavior follow-up.** Useful for incremental conversations. Synthetic tasks and filler-based length scaling limit natural-dialogue claims; pin a benchmark release and inspect dataset-specific usage terms. |
| [BEAM](https://github.com/mohammadtavakoli78/BEAM) | Histories up to 10M tokens and multiple abilities including updates, temporal reasoning, preference/instruction following and abstention. | **Later scale/stress suite.** Start at a smaller supported size after the evaluation pipeline is reliable; maximum-length ingestion is not a prerequisite for useful evidence. |

The [ConvoMem paper](https://arxiv.org/abs/2511.10523) explicitly compares full-context
and retrieval-based memory. Its result motivates testing cases where retrieval
is unnecessary or worse. The title's “150 conversations” is not a universal
cutoff for other models, message lengths, costs or memory implementations.

Supermemory's MemoryBench is an execution framework, not an additional dataset.
Its staged ingestion/index/search/answer/evaluate pipeline and resumable runs are
useful references. Running a provider through that framework does not establish
SillyTavern extension loading, automatic updates or final prompt delivery.

## Selected sequence and the next concrete deliverable

1. **Audit data without model calls.** Inspect cleaned LongMemEval-S and ConvoMem
   schemas, versions, licensing, evidence labels, roles, dates and actual token
   distributions. Save source revision, checksum, sample IDs and preprocessing
   decisions in a manifest. Resolve whether a subset can populate the intended
   fitting/overflowing cohorts before estimating paid work.
2. **Freeze a bounded protocol.** Use LongMemEval-S first, then a ConvoMem subset
   stratified by question type, evidence distribution and history size. Specify
   the exact sample count, selection seed, development/evaluation separation,
   model, scorer and spend limits before execution. No sample count or paid-run
   authorization is implied by this document.
3. **Validate the adapter and host path on a small pilot.** Verify chronological
   import, timestamp visibility, source isolation, context measurement, scoring,
   retries/resume and cleanup before expanding. Keep pilot data out of subsequent
   held-out claims when it has informed tuning.
4. **Run the fixed comparison, then decide whether another suite adds value.**
   Report failures and unfavorable outcomes. Add PersonaMem for personalization,
   LoCoMo for external comparability, or an online/scale suite only when the
   unanswered product question justifies it.

This revises the earlier discussion's LongMemEval-then-LoCoMo order by moving
ConvoMem ahead of LoCoMo. The immediate deliverable is a data audit and frozen
protocol, not implementation of every candidate.

## Host adaptation and leakage controls

- Compare plain SillyTavern, native Vector Storage, native Summarize and
  SillyMemory through the real pinned host generation path with the same source,
  question and generation settings within each cohort. Direct model/provider
  calls remain component tests, not host integration results.
- SillyMemory currently scopes memory to a host chat. Mapping benchmark sessions
  into one chronological host chat is an explicit adaptation, not evidence of
  cross-chat memory. Preserve session boundaries, speaker identity, roles and
  source dates, and expose the question date consistently to every arm. Verify
  how this information reaches both retrieval text and the final prompt.
- Never feed reference answers, evidence IDs, `has_answer` labels or oracle
  selections into indexing or answer prompts. Keep them in evaluation metadata.
  Respect each question's history cutoff; for example, PersonaMem's per-question
  end index must not expose later messages. Oracle runs are separate diagnostics.
- Restore the same source snapshot and corresponding memory/summary state for
  independent questions. Earlier benchmark answers must not become evidence for
  later questions. Include both user and assistant source messages according to
  the task, without creating missing answers or rewriting facts.
- Pin question selection before tuning and report every exclusion. Publish
  subset/adaptation scores under their actual names, not as official full-suite
  scores. Public benchmark holdout is a local tuning boundary, not proof that
  the generator never encountered the material during training.
- Preserve original benchmark language for external comparisons. Translated or
  newly authored Korean cohorts need separate IDs and validation; English scores
  do not establish Korean quality. Existing bilingual regression tests remain.

## Conditions and measurements to freeze

Use **32K as the proposed main configured host context and 128K as a robustness
check**, with the 1,536-token case retained for regression only. These are research
settings, not measured user defaults. Count actual formatted requests with output
reservation, system/character instructions and inserted memory included. Classify
history as fitting or overflowing from the observed prompt, not a dataset label;
record whether the required old evidence actually survives the plain baseline.
Do not produce length solely by repeating low-information padding.

Retain the default-oriented Summarize arm and distinguish default native settings
from explicitly tuned arms, as detailed in the
[existing follow-up record](evaluation-and-device-followups.md#summarize-needs-a-baseline-closer-to-ordinary-use).
Declare memory budgets and selection policies before the run. If evaluating a
budget curve, use fixed declared settings and a separate development set; do not
choose a per-question budget using its answer or tune against evaluation scores.

Report at least:

- **Answer quality:** benchmark-prescribed scoring and per-category counts,
  abstention and update correctness. Pin judge model/prompt and retain a human
  review sample. Report any stricter project rubric separately. Use paired cases
  and uncertainty estimates that account for questions sharing a source history.
- **Evidence delivery:** retrieval recall where labels permit, selected/injected
  evidence and what survives in the final model request. Distinguish retrieval
  misses, stale-source rejection, budget exclusion, host truncation and generation
  errors; aggregate QA accuracy alone cannot diagnose ANN quality.
- **Usage and cost:** provider input/cache/output tokens, embedding usage,
  summary-generation usage and storage assumptions. Separate initial ingestion
  from incremental updates and answer calls. Token reduction alone is not a
  demonstrated total-cost saving; declare pricing and amortization assumptions.
- **Operational behavior:** ingestion readiness, summary triggers, update/query
  and generation latency, retries, failures and fallbacks. Keep normal and
  recovered runs identifiable, bound attempts, and resume without duplicating
  scored samples. Verify owned test-data cleanup.

Prepare ready-index retrieval and sequential online-update cohorts separately.
The online cohort must advance through real host events and capture automatic
summary/index updates, rather than force a summary or complete indexing before
every question and call that ordinary use. Runtime gates must not silently remove
failed or slow samples from quality or latency reports.

Public QA benchmarks do not replace product tests for edits, swipes, deletion,
reload, chat/character/branch isolation, concurrent requests or key handling.
Likewise, factual recall alone does not establish engaging roleplay, emotional
continuity or character voice. Keep these claims outside the initial comparison.
