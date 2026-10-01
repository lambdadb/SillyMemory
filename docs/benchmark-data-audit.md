# External benchmark data audit — 2026-10-01

This completes the offline data-audit step from the
[benchmark selection discussion](https://github.com/lambdadb/SillyMemory/blob/c0636bee22a6c7c9aa49657dd896dd29b54ada2c/docs/benchmark-selection.md).
It inspects released data and counts tokens locally. There are **no new model,
embedding, retrieval-quality or actual-host answer results**. PR #34 contains the
selection rationale separately; this work starts from develop after PR #33.

## Pinned inputs and reproduction

The [source lock](benchmarks/sources-v1.json) records dataset revisions, exact
download URLs, byte counts, SHA-256 hashes, source-document hashes and inspected
upstream code revisions. The [audit](benchmarks/audit-v1.json) and
[question selection](benchmarks/selection-v1.json) reference that lock's hash.

| Dataset | Inspected scope | Download bytes |
| --- | --- | ---: |
| LongMemEval cleaned S, revision `98d7416c24c778c2fee6e6f3006e7a073259d48f` | All 500 questions | 277,383,467 |
| ConvoMem, revision `e3e9b39115b02346824c70d349350de738f8be41` | 18 pre-mixed files, 3,583 contexts and 7,614 associated questions | 232,682,980 |

The ConvoMem audit selects the first, middle and last file **among files no larger
than 32 MB** in six declared strata: user/assistant/changing evidence count 3 and
abstention/preference/implicit-connection evidence count 2. The inventory records
all 216 files in those strata and the selections. This is a bounded structural
sample, not a representative full-dataset token distribution. Some excluded
individual files exceed 390 MB. Do not extrapolate its counts or scores to the
dataset's advertised 75,336 QA pairs.

Raw data stays under ignored `artifacts/`; it is not redistributed in Git. The
scripts neither read `.env.local` nor call model providers. Downloads are sequential,
bounded and checksum-verified; bad or partial downloads are not published as cache
entries. The audit uses one local tokenizer process, with no GPU requirement.

```sh
npm ci
node scripts/fetch-benchmark-data.mjs artifacts/benchmark-audit
ST_SOURCE=/pinned/SillyTavern node --max-old-space-size=1536 \
  scripts/benchmark-audit.mjs artifacts/benchmark-audit artifacts/benchmark-check
# Compare the generated -audit.json and -selection.json with docs/benchmarks/.
```

Use the pinned SillyTavern revision `06bde939` with its installed dependencies.
The counter verifies `tiktoken` 1.0.22 and uses `o200k_base`. It encodes the
adapted source content and adds six tokens per message, with the question counted
separately. This is a declared preflight estimate: character/system instructions,
host wrappers, output reservation and actual prompt truncation are not measured.
The JavaScript heap limit is not a claim about measured total process RAM.

## LongMemEval-S: useful 32K/128K contrast, with date and split caveats

| Adapted history estimate | Tokens |
| --- | ---: |
| Minimum | 98,958 |
| Median, nearest-rank | 105,717 |
| 90th percentile | 107,050 |
| Maximum | 107,814 |

All 500 histories exceed 32,768 and fall below 131,072 under this estimate. This
makes S suitable for investigating the proposed overflow/fitting contrast without
padding or replacing the corpus. It does **not** prove that all final 128K host
requests fit; inspect those requests before interpreting memory savings. Histories
contain 38–62 sessions and 396–616 messages (median 48 sessions / 491 messages).

The source has six question types; this selection treats the 30 `_abs` questions
as a seventh, disjoint abstention stratum. Original type metadata remains intact.
Two development and six evaluation questions per stratum produce a frozen local
split of **14 development / 42 evaluation** questions. This balanced subset is not
the official 500-question score or a population-weighted estimate.

Questions sharing an answer-session ID are grouped before split assignment. In
the full dataset there are 495 such components, but only **one component** if
every shared background session is included. The selected splits share 33 history
session IDs; no selected evaluation answer-session ID appears in development
history. These checks use released IDs, not semantic near-duplicate detection.
Call this a local question holdout with shared background, not fully unseen users
or histories, nor proof of training-data independence.

All histories are ordered by **calendar day**, and none has a session on a later
calendar day than its question. Within-day times are less consistent: 211 histories
have a timestamp inversion; 76 contain a session later than the question's time
on that same day, including 44 with a labeled answer session later that day. This
does not by itself prove incorrect reference answers. Preserve released order and
exact date strings for benchmark comparability; do not silently sort, delete
sessions or advertise the replay as strictly chronological. Report these flags
alongside temporal-task results and review time-sensitive cases before live use.

There are also 12 empty messages across seven histories. The adapter preserves
them instead of silently changing source indexes. Actual host handling of empty
messages must be checked before mapping evidence positions into final prompts.

## ConvoMem: use the actual schema and resolve usage terms first

The distributed pre-mixed JSON is a **list** of objects with `evidenceItems`,
`conversations` and `contextSize`. This differs from raw evidence files wrapped
in `evidence_items`. A context can have multiple associated questions: treating
one context as one QA would discard valid questions. Each question must use an
independently restored copy of that context when answers are generated.

`contextSize` equals the number of **conversations**, not messages, in every
audited context. The inspected upstream
[TestCase implementation](https://github.com/SalesforceAIResearch/ConvoMem/blob/624f582ecf0d336ae1d4539d19186089800774b1/src/main/scala/com/salesforce/crmmembench/evaluation/TestCase.scala)
confirms that interpretation. Message counts vary within conversations; 100
messages is not a reliable per-conversation assumption. The pre-mixed files use
lowercase speakers, while inspected raw evidence examples use `User`/`Assistant`.
The adapter handles both cases and rejects unsupported roles.

Among the audited 300-conversation contexts, estimated history sizes range from
119,806 to 480,720 tokens. Three of eight assistant-fact examples fall below
131,072; the ten user-fact and two preference examples all exceed it. Shorter
audited contexts span 2–10 conversations. A nominal context size therefore cannot
replace measuring tokens, and this uneven sample cannot establish category-wide
or full-corpus distributions. There are 3,340 distinct persona/question-list
groups among the 3,583 audited contexts, so length variants must not be randomly
split as independent questions during later tuning.

The dataset card declares
[CC BY-NC 4.0](https://huggingface.co/datasets/Salesforce/ConvoMem/blob/e3e9b39115b02346824c70d349350de738f8be41/README.md),
while [dataset_info.json](https://huggingface.co/datasets/Salesforce/ConvoMem/blob/e3e9b39115b02346824c70d349350de738f8be41/dataset_info.json)
still declares Apache-2.0. The provider's
[license-change commit](https://huggingface.co/datasets/Salesforce/ConvoMem/commit/e3e9b39115b02346824c70d349350de738f8be41)
explicitly changes the dataset card from Apache-2.0 to CC BY-NC 4.0. This suggests
stale metadata in `dataset_info.json`, rather than two equally current license
choices. The code repository's license does not establish dataset permissions.

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/legalcode.en)
does not prohibit publication as such; its noncommercial condition concerns the
purpose of the use, not whether a model API costs money. Publishing aggregate
evaluation scores or token counts is distinct from redistributing source dialogues
or questions. However, publishing aggregates alone does not settle whether the
underlying dataset use for product evaluation or promotion meets that condition.
This audit establishes neither blanket permission nor a prohibition on our
evaluation or publication of its results.

Proceed with LongMemEval first. Defer ConvoMem answer-quality comparisons until
the provider clarifies whether our product comparison and publication of aggregate
results are permitted, or grants suitable permission. This is a project sequencing
decision, not a finding that paid API calls or public results are forbidden. The
completed offline schema/token audit remains available; no ConvoMem model-quality
run is claimed. LongMemEval's
[cleaned dataset card](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/blob/98d7416c24c778c2fee6e6f3006e7a073259d48f/README.md)
declares MIT, so its independent host preflight can proceed.

## Input boundaries and next implementation

Follow-up: the [host preflight](benchmark-host-preflight.md) now exercises the
two development inputs through real SillyTavern with local service fixtures.
It records final prompt delivery and automatic summary events, plus macro/empty
message limitations. The subsequent [bounded 32K live pilot](benchmark-live-pilot.md)
records real provider execution, costs, recovery boundaries and separate results.
The frozen design below remains the historical pre-execution plan.

The adapters whitelist model-visible fields. LongMemEval exposes only source
role/content, explicit session/date markers and question/date. ConvoMem exposes
only conversation role/text, numbered boundaries and the chosen question. Answer
keys, `has_answer`, evidence IDs, `containsEvidence`, scenario descriptions and
scoring rubrics stay out of generation/indexing input. Source content itself is
preserved, including empty text; known special token spellings are counted as
literal text. These are offline adapters, not an installed host importer.

The [pilot design](benchmarks/pilot-design-v1.json) fixes two development questions
(`8ebdbe50`, `eeda8a6d_abs`), neither carrying the audit's timestamp/empty-message
flags. First build a **no-provider host preflight** at 32K and 128K. Verify role and
date delivery, macro handling, empty-message behavior, all four memory modes,
source restoration, document counts and cleanup. Do not use answer labels to
choose source windows, questions or memory budgets.

The subsequent paid pilot is designed for 32K only, with one answer per question
and mode: eight answers. Use the same `gpt-4.1-mini-2025-04-14`, temperature 0 and
1,024 output cap across arms; the higher cap accommodates longer benchmark answers
and inherited summary output, rather than reusing the small regression cap of
256. This was a newly declared condition; model availability required verification
before live execution. See the subsequent live pilot for that evidence.

- **Plain:** memory features disabled.
- **Vector Storage:** OpenAI `text-embedding-3-small` through the existing
  compatible test bridge, a declared change from local Transformers; retain the
  host defaults Protect 5, Insert 3, Query 2, chunk 400 and threshold 0.25. This is
  not the previous Protect 8 tuning cohort or a local-embedding resource test.
- **Summarize:** Main API instead of Extras, retaining Classic, 200 words,
  automatic interval 10, no response-length override and the default prompt and
  placement. Advance through real events in released order; no forced catch-up.
- **SillyMemory:** managed embeddings and shipped Recent 12 / Budget 800 / Chunk
  800 settings. Observe the effective delivered budget; do not force native
  modes into SillyMemory's pruning policy.

The pilot reserves at most 51 and 50 automatic summary calls for its 487- and
477-message sources: `ceil(messages / 10) + 2` is a stopping bound, not a prediction
or instruction to force that many calls. Eight answers, up to 101 summaries and
eight judge calls imply 117 scheduled calls, at most 125 attempts with a shared
eight-retry allowance. A successful poor answer/summary is never retried. Judge
model/prompt provenance must follow the pinned
[official evaluator](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py);
its `gpt-4o` alias maps to `gpt-4o-2024-08-06`, temperature 0 and output cap 10.

At design freeze, this was **not yet an executable frozen live plan**. Its launch
gates required finite indexing/query limits, actual prompt occupancy, summary
triggers and monetary limits before paid execution. The host preflight and live
pilot linked above record those subsequent checks. The 42-question evaluation
split remains untouched by model calls; expansion to it and both context sizes
requires a separate bounded run plan. Report recall, input/cache/output tokens,
summary/embedding overhead and failures separately, including unfavorable cases.

## Validation boundaries

All locked files were downloaded and checksum-verified; the audit processed all
500 LongMemEval-S questions and the declared ConvoMem subset with the pinned local
tokenizer. The fetcher also passed a fresh public-file download and cache reuse.
Unit tests cover label isolation, date/role preservation, empty text, shared-evidence
split isolation and incomplete/corrupt download rejection. Existing tests remain
separate from this audit. No host generation, remote collection, embedding or
provider-quality result is claimed by these artifacts.
