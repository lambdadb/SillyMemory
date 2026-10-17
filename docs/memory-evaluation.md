# Memory evaluation criteria

Evaluate source retrieval, prompt delivery and answer correctness separately.
Use these criteria when designing or interpreting a memory-quality experiment;
see the [experiment lifecycle](../CONTRIBUTING.md#experiment-lifecycle-and-retention)
for scope, confirmation cohorts and evidence retention. A better answer score
alone does not identify which stage improved, and better evidence coverage can
be meaningful even when generation or judging masks its benefit.

## Separate the stages

| Stage | Question | Required observation |
| --- | --- | --- |
| Search candidates | Did the search retrieve the evidence before final ranking? | Per-leg or merged candidates and their ranks, when exposed. Mark unavailable stages explicitly. |
| Returned retrieval | Is the evidence in the final returned chunks? | Exact returned IDs, source coordinates and ranks; distinguish vector k, rerank candidate count and final size. |
| Prompt delivery | Is the evidence in the final dispatched generation context? | Selected source spans, final rendered prompt, labels/clocks and counted budget. Separate retrieval loss from budget, assembly or host truncation loss. |
| Answer generation | Does the answer correctly use the available evidence? | Saved answer, original question and source review, including ambiguity, contradictions and abstention. |
| Answer judging | How does the chosen scoring protocol label that answer? | Exact judge model/options, rubric, request and original label. Keep supplemental judges separate. |
| Resources | What does the method consume? | Actual API tokens, cached tokens, calls/retries, indexing/query work, latency and estimated full operating cost, with measurement boundaries. |

Cached retrieval replay measures downstream selection/generation for those saved
results. It does not establish new search performance or end-to-end host behavior.
If a comparison changes only the memory budget, returned-retrieval recall is fixed;
prompt-delivery coverage and answer behavior can change. Do not attribute that
change to embeddings, ANN or the reranker.

Include evidence delivered through recent native dialogue or other fixed prompt
parts when assessing answer sufficiency. Report that separately from recalled
memory coverage. Preserve source-time dependencies: a relative-date fact can need
both its original words and the known conversation clock. A sent date is not
automatically an event date.

## Separate standalone memory and host evaluation

Keep two named protocols. A **fixed-memory standalone replay** calls the generator
and judge directly with frozen selected excerpts, question/date, shared memory
guidance and model settings. A contemporaneous control replays the original host
messages. Removing host system/persona/start messages and native recent dialogue
is a bundled input change, not proof about one instruction or a new retrieval run.
Preserve excerpt bytes, source roles/order and all original labels; do not refill
freed space or silently include reference answers in model-visible inputs.

Audit removed recent dialogue against original sources. The product's recent-five
partition is outside its indexed memory; deleting that dialogue can remove the
only available fact. Report that separately, without excluding affected questions
from the frozen score. A **standalone ingestion/search benchmark** must explicitly
choose and freeze its history boundary: index all completed source messages if no
recent-history channel exists. That is a different retrieval experiment, not the
same cached replay. Do not attribute its eventual gains to host prompt removal.

Use product chunking/query/selection functions directly where applicable, keeping
benchmark session clocks explicit. Report source-span coverage and ranked coverage
before generated-answer labels. Exact source bindings make these structural metrics
model-independent, but do not turn message annotations into necessary-fact labels.
Keep host/browser installation, streaming and synchronization validation separate;
a standalone answer score neither validates nor replaces those user-facing checks.

## Account for full operating cost

Every subsequent paid quality comparison must include a cost ledger alongside
recall, delivery, accuracy and latency. Use one frozen, dated rate card and currency
across arms; link the official sources. Distinguish measured usage, reconstructed
estimates, scenario assumptions and unavailable meters. Unknown is not zero.
Do not label a partial subtotal as total cost or provider list prices as an invoice.

Report these separate cost groups:

| Group | Required accounting |
| --- | --- |
| Initial import or reindex | Successful and retried upserts, document payload bytes and per-request minimums; initial managed or external embedding tokens. |
| Ongoing chat | New/edited message writes, removals, reload/synchronization reads, queries, query embeddings, reranking and final answer generation. State the workload and amortization horizon. |
| Stored memory | Physical stored GB-hours, version/branch sharing and retained deleted bytes. Raw JSON, vector dimensions and archive size do not measure physical billing. |
| Evaluation overhead | Corpus verification fetches, probes, repeated corpus construction, diagnosis calls and judge tokens. Keep these out of user-turn operating cost, but include them in experiment spend. |

Count actual server attempts where possible, including SDK retries. Record the
billing outcome of failed/uncertain attempts as unknown when unavailable. Query
results alone may omit inference and physical-storage meters. Prefer an isolated
project/time interval or per-request usage receipts; a shared-project total can
include unrelated work. Preserve sanitized usage evidence without keys or chats.

For LambdaDB, freeze [the official cost contract](https://docs.lambdadb.ai/guides/costs/understanding-costs)
and [pricing](https://lambdadb.ai/pricing), checked on 2026-10-16:

- Writes: $1/GB; upsert/update/bulk requests have a 50 KB minimum. A document
  delete request adds a fixed 100 KB write meter. Native-generated embedding
  vectors are not client-sent upsert payload; externally supplied JSON vectors are.
- Reads: $5/PB, with a 1 GB request minimum. Direct-branch query/fetch with
  `consistentRead:true` adds 1 GB. Use collection/selected physical-partition size
  as specified; an ordinary owner/chat predicate is not physical partition pruning.
- Physical storage: $0.33/GB-month from hourly averages. Returned query data and
  deleted-data retention have published $0.05/GB and $0.10/GB-month rates, currently
  waived during a promotion. Show the waiver and post-promotion scenario separately.
- Native inference: $1.05 per million LIU. Input LIU/token is 0.02 for OpenAI
  small, 0.13 for OpenAI large and 0.042 for Jev 1.13.0; output is zero. Aggregate
  LIU across the billing period before integer rounding. Do not add direct-provider
  embedding/rerank list charges again to the native inference charge.

Confirm decimal/binary billing-byte conventions before claiming precision beyond
a rough estimate. Under an explicitly decimal assumption, a sub-1-GB collection's
strong branch query has a $0.00001 minimum-based estimate, and a minimum upsert
costs $0.00005, before inference and plan allowances. These are arithmetic
examples, not measured server bills or a universal per-turn cost.

Reranker comparisons must preserve the same complete pre-rerank candidate inputs.
Final50 receipts do not reveal all100 inputs or token usage; scored document count
is not a token meter. When unavailable, leave native rerank cost unknown, or label
and justify a tokenizer/prompt-overhead estimate. Use actual external-provider
usage for its separate charge. Keep shared index construction/storage common;
do not charge a fresh reindex to each reranker arm or assume a saved-input replay
means zero product retrieval cost. Report gross usage cost before free allowances,
then any account-wide allowance/promotion scenario without assigning the same
remaining free balance independently to every arm.

## Map chunk results to message annotations

LongMemEval's retained evidence annotations identify source messages, whereas the
product retrieves chunks. Keep the chunk storage/search unit and map results back
to the original annotated source coordinates for evaluation.

Use the source revision, message identity and each chunk's `[start, end)` range.
Current offsets are UTF-16 positions in the canonical source text used to produce
the chunks. Preserve the recorded source transformations and coordinate system;
do not apply raw-text or code-point offsets to a different representation.
Scope identities to the question/chat so equal message positions from different
histories never match. Validate source binding before counting a returned hit.

For each annotated message, compute the following at **both** the returned-result
stage and the final prompt stage:

| State | Structural criterion | Interpretation |
| --- | --- | --- |
| Missing | No valid source span is present. | That annotated source was not delivered at this stage. |
| Partial | Some source text is present, but its span union does not cover the entire message. | Required facts may or may not be present. Review their locations. |
| Complete | The union of valid spans covers the entire canonical message without gaps. | That message's body is available; this alone does not prove that the question is answerable. |

Merge overlapping spans before counting coverage; repeated or overlapping chunks
must not inflate recall. Chunk count and text-coverage percentage are diagnostics,
not semantic recall. Do not split an annotated message's credit evenly across its
chunks or treat one matching chunk as proof of sufficient evidence.

Always name the unit, stage and denominator:

- **Any annotated-message coverage:** partial plus complete annotated messages,
  divided by all annotated messages in the frozen cohort.
- **Complete annotated-message coverage:** complete annotated messages divided by
  that same denominator.
- **All-annotated-messages-complete questions:** questions whose every annotated
  message is complete, divided by questions with at least one annotation. Report
  zero-annotation questions separately rather than awarding vacuous success.
- **Necessary-fact/span coverage:** use only when the required evidence has been
  independently specified and frozen as described below. State its denominator.

Micro message coverage weights questions with many annotations more heavily.
Question-level coverage gives a complementary view. Any/complete message coverage
are structural proxies, not exact upper/lower bounds on semantic recall. An
annotation need not identify every alternative source or only indispensable text.

## Resolve partial coverage without changing the benchmark

Start by auditing the partial messages across the entire frozen cohort, including
already-correct cases. Do not select only candidate wins or baseline wrong answers.
For a newly studied mechanism, inspect original questions, source messages and
references before comparing candidate answers or labels where feasible.

Record the minimal source spans needed to support the requested facts. Multi-fact
questions can require several spans, with conjunctions and alternative supporting
sources recorded explicitly. Preserve required dates, units, negation, referents
and distinctions between plans and completed events. If the source/reference is
ambiguous or contradictory, retain that uncertainty rather than forcing a span
annotation that makes one answer win.

Abstention questions can lack a positive answer-bearing span by design. Assess
whether the available context supports a factual answer or an acknowledgment of
missing information; do not manufacture a missing fact from a related annotated
message. Freeze any not-applicable classification and report its count separately.

Freeze and version these annotations, their source hashes, coordinates and
provenance before using them for candidate comparisons. When annotations are
created after results were inspected, label them as a development diagnosis;
freeze them before the next comparison and use separate confirmation data for
generalization claims. Do not redefine spans per arm or infer sufficiency from
whether the generated answer was accepted. Any model-assisted annotation requires
disclosed provenance and source verification; no additional model call is required
by this policy.

Keep spans and gold/reference answers strictly on the evaluation side. Never feed
them into retrieval, ranking, selection or generation. These custom diagnostic
annotations do not replace the original benchmark references or official-protocol
answer labels. Keep small reusable regressions in Git; retain bulky annotation
records and source reviews as checksummed ignored evidence under the lifecycle
policy.

An unannotated retrieved chunk is not automatically irrelevant: it can contain a
duplicate fact, a missing referent or useful context. Conversely, a hit on an
annotated message may contain only unrelated sentences. A source-specific miss
and absence of every valid supporting fact are different findings. Report reviewed
alternative support explicitly, without silently rewriting the historical metric.

## Interpret results and make product decisions

Report retrieval coverage, prompt-delivery coverage, answer accuracy and resource
use side by side. A conditional accuracy on evidence-sufficient questions is useful
only with an independently reviewed sufficiency definition and an explicit case
count. Compare a common reviewed subset across arms when attributing generation
differences; do not silently compare different denominators or equate complete
message coverage with sufficiency. Leave this metric unavailable when it has not
been assessed.

Review changed answers against actual delivered evidence. Distinguish source
retrieval loss, budget/dependency loss, available-evidence interpretation/omission,
ambiguous or conflicting targets, and judging sensitivity. A label flip alone is
not proof of a source improvement or a judge error. Preserve original answers and
labels; avoid selective reruns or rejudging. Record generator and judge changes as
separate factors, and disclose consumed development cohorts and repeated-run
variation. Stable source-coordinate checks are less model-dependent than answer
judging, but annotation limitations still apply.

For evaluator reproducibility checks, freeze saved answers, references, task rules,
model version and any decision threshold before calls. Report both raw-score
variation and per-input binary flips across repeated identical requests, alongside
aggregate score variation. Stable labels do not establish accurate judgments;
finite repeats do not prove determinism. Keep historical Yes cases as evaluator
controls, rather than inventing new product errors from a replacement judge's No.
Preserve original labels; do not tune thresholds, exclude questions or selectively
rejudge favorable cases after seeing results. Separate evaluator uncertainty from
generation changes before treating small score differences as product gains.

Choose adoption, deferral or rejection using the measured mechanism, actual gains
and regressions, resource tradeoff and evaluation uncertainty. Do not dismiss a
demonstrated evidence-recall improvement solely because the final answer score
barely changes, or claim an end-to-end benefit from recall alone. Freeze the
semantically agreed source/time policy across arms. See the
[same-policy budget comparison](query1-retrieval-quality.md#same-policy-capacity-comparison-4096-versus-8192)
for a completed example; its message-coverage counts are not a completed
necessary-span audit.

## Answer evaluator policy

By Steven's decision on 2026-10-17, use **Jev `jev-1.13.0`, Noul >=0.50 for Yes**
as the primary answer judge for new internal English LongMemEval evaluations.
Pin the version rather than an alias. Preserve dataset questions/references and
original task-specific rule wording, including preference and abstention rules.
The adapter moves question/reference/response values into JSON state, preserves
the exact rule prefix and final grading proposition, and removes only the literal
`Answer yes or no only.` output-format instruction. This is an evaluator adaptation,
not a byte-identical request or an upstream-supported Jev integration.

The [upstream evaluator](https://github.com/xiaowu0162/LongMemEval/blob/main/src/evaluation/evaluate_qa.py)
already selects among GPT-4o, GPT-4o-mini and Llama 3.1 70B. Its judge choice is
part of the scoring protocol. Our Jev results remain meaningful measurements on
LongMemEval, labelled **LongMemEval-S, Jev 1.13.0, threshold 0.50**, alongside the
reader, retrieval/budget settings, dataset identity and any input adaptation.
Do not present them as reproduced GPT-4o scores or directly comparable rankings
against results with another judge. For a controlled system comparison, use the
same judge, threshold, rules and dataset for every arm. Rejudge saved baseline
answers under that protocol when needed; do not regenerate them solely to change
the judge. Preserve all historical GPT-4o labels and results in separate records.

The completed repeat study found stable binary labels for 498/500 inputs across
five Jev calls, not deterministic inference or independently verified judge accuracy.
Record raw probabilities as well as labels and treat small answer-score changes
in light of observed evaluator variation and evidence/delivery diagnostics. Do
not exclude low-probability questions or replace labels with favorable reruns.
The user-requested post-hoc 0.55/0.60 calculations do not change the adopted 0.50
threshold. This adoption is a prospective evaluation-policy decision; historical
runners and frozen receipts retain their producing protocol. It changes neither
product generation nor retrieval/reranking defaults and adds no paid run.
