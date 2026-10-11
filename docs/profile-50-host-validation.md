# LongMemEval profile through the actual SillyTavern host

## Decision and result

On 2026-10-11 UTC, all **six frozen LongMemEval-S cases** completed actual
SillyTavern generation with live LambdaDB retrieval: **6/6 official correct**.
All final memory excerpts and the current question passed host delivery checks.
This establishes bounded host compatibility for the tested profile. It is not
full 500 reproduction, independent confirmation, or proof of the normal-default query policy.
The cases were already consumed during earlier failure analysis.

The measured base source, UI, dependencies and defaults were unchanged during the
live run. The ignored test copy
changes k/candidate/return limits and the history partition to match the previously
authorized question-only benchmark input. It is not an installation profile users
can select in the current UI. No temporary patch or runner is committed.

## Frozen conditions

- Develop base `718ce65d390c0306b02471b1cb15b9c277dd5850`; unmodified SillyTavern
  1.19.0 at `06bde939fb1e9c4c8d8641d810f0a916b5bce127`; maintained SDK 0.8.0.
- Original LongMemEval-S data SHA-256
  `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
  No question, reference or source edits beyond the existing uniform macro
  literalization and session/question-date adapter.
- Index all historical user/assistant messages; retain only the current question.
  Query the original question alone, without its question-date prefix. Existing
  boundary-v1 chunk ceiling 800 codepoints, ownership/scope/revision validation,
  source assembly and final prompt verification remain active.
- Managed OpenAI text-embedding-3-small, Bayesian English natural text with
  skipSyntax:true, consistentRead:true. Vector k=100, managed Jev candidateSize=100,
  final size=50. Typesafe jev-1.13.0, default relevance criteria, onFailure:error.
  Every case response reports applied and 100/100 candidates scored.
- Memory budget 4096; host context 32768. Sol gpt-6.1-sol, low reasoning, output 4096.
  Actual forwarded input is exactly the frozen system instruction, native-role
  retrieved excerpts and date-decorated question. No other recent local history,
  gold answer, evidence marker or scoring rubric is sent to the answer model.
- Frozen official judge gpt-4o-2024-08-06, temperature 0, output 10, original
  question/reference templates and whole-response `^(yes|no)[.!]?$` parser.

The browser talks directly to LambdaDB through real CORS. An ignored loopback
completion bridge records and validates the original host request, then forwards
that body unchanged to OpenAI. It is test instrumentation, not a product server
plugin. The provider receipt and saved assistant answer match in every case.

Historical session dates remain inline prefixes on the first message of each
session. Host send_date=0 leaves host timestamp metadata unknown; no date is
invented. Runtime headers and host tokenization differ from the earlier compact
benchmark renderer. Input policy/search limits match; prompt bytes and admission
are not claimed identical.

## Complete cohort

Message indices are zero-based original flattened positions; passage/excerpt
counts distinguish stored chunks from joined prompt messages. Marker coverage is
only diagnostic source coverage, not exact answer-span recall.

| Case | Topic | Indexed docs | Delivered passages / excerpts | Memory tokens | Markers returned / delivered | Official |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| caf03d32 | Slow-cooker preferences | 972 | 36 / 24 | 4076 | 2/2 / 2/2 | Correct |
| 1da05512 | NAS purchase preferences | 973 | 37 / 18 | 4064 | 2/2 / 2/2 | Correct |
| 35a27287 | Cultural events | 989 | 31 / 17 | 4090 | 2/3 / 2/3 | Correct |
| gpt4_f420262d | Valentine's Day airline | 947 | 36 / 31 | 4038 | 3/3 / 3/3 | Correct |
| gpt4_7abb270c | Six museums in order | 936 | 34 / 27 | 4080 | 6/6 / 6/6 | Correct |
| a08a253f | Weekly fitness classes | 1007 | 33 / 27 | 4087 | 2/2 / 2/2 | Correct |

Each query returns 50 chunks. Their selection produces 17–31 assembled excerpts,
not 50 complete prompt messages. Agent inspection of all questions, references and
answers agrees with official labels; targeted source/prompt inspection confirms
beef-stew/yogurt experience, NAS capacity/external backup, language interests and
museum chronology. This is not blinded independent human adjudication.

The cultural case misses marked message411 during retrieval. Delivered message419
also states the French/Spanish preference, so the answer remains correct and asks
for current location instead of inventing event listings. A perfect answer score
therefore does not imply complete retrieval. The museum answer avoids assigning
an invented exact date to the contemporary-art visit.

Six successful answer receipts total 25249 input/1301 output tokens. Provider-call
elapsed time ranges 2299–9534ms; observed generation including final synchronization,
retrieval, packing and host preparation ranges 4965–11978ms. Jev service took 498–685ms.
These are six observed timings, not a representative latency comparison or invoice.

## Failures, bounds and cleanup

Two recorder-only episodes preceded the complete run. Final verification replaces
the inspector's numeric budget label with delivered excerpts; parsing that label
failed after one successful answer, then before another provider call. The complete
run counts the exact forwarded excerpts through the pinned host tokenizer instead.
The original answer remains archived but is not graded or substituted.

The first judge returned `Yes.`. An accidentally narrower recorder stopped;
recovery restored the actual historical parser above, reused that receipt and
called only the five remaining judges. No answer, prompt, reference, query or rank
was revised. Every original failed episode and producer is preserved.

Aggregate across all episodes: **11 owned collections, 7772 physical submitted
documents, 412 LambdaDB requests, 13 completion attempts**, original elapsed
clock 10.64 min, peak completion concurrency 1. A recorded continuation adjusts only
the collection cap 10→11 for the additional transport gate; failed episodes count
cumulatively. Original limits remain six cases, 10000 documents, 1000 requests,
24 attempts, three per call, 60 min and USD 2 conservative reservation. Reservation
USD 0.4129545 uses historical coefficients, not current pricing or invoice amounts.
Normal successful completions have no artificial delay; rate headers are observed.
No OpenAI retry was needed. Two gate query 503s recovered through client retries;
all six case queries succeeded. Live 429 behavior was not exercised.

All 11 collections have ownership-checked deletion and GET 404 confirmation; no
pending resources remain. This does not establish backup/physical erasure.
Session keys were absent from browser local/session storage after each episode;
364 local evidence/source files were scanned without credential matches. Temporary
host processes/profile were removed and the extension symlink restored. Host Git
source and measured-base product code were unchanged.

## Validation and next decision

The independent Python audit checks all submitted source slices/revision IDs,
returned document equality, assembled prompt source unions and omitted gaps,
whitelisted requests, provider identities/answers, strict judgments, aggregate
bounds and cleanup. Actual host token counts enforce 4096. Local Node24 validation:
`npm test` 335/335; `npm run check`, `npm run check:release`, `npm run check:sdk`
and development script/test syntax passed. No new maintained fixture is needed
for the live evidence record.

The existing complete-recent-dialogue/recent 12 profile is a different input policy:
a preserved offline admission check on these histories rejects all six queries
above 8 KiB before any live query. This result cannot establish normal-default chat
compatibility or justify silently changing that policy. The numeric-default adoption below
preserves it; resolving provider-size behavior and the history/query partition is
still a separate product decision. No rerun of all historical candidate methods is proposed.
Node20 is left to CI; no full 500 actual-host run, held-out confirmation, live 429
fault injection, release or deployment was performed.

See [the evidence index](evidence-retention.md#profile50-actual-host-validation)
for immutable archive hashes and local-only availability. Full raw runs, patched
copy, producers and failure records remain ignored rather than permanent CI inputs.

## Product default adoption

This is an intentional **provisional pre-release setting choice**, not a
quality-confirmed default. Independent capacity-pressure/no-answer-loss confirmation
and a matched quality comparison under the retained recent12 query policy remain
outstanding. The historical discovery/depth decisions are not relabeled as passed
gates. The six-case question-only score must not be presented as validation of
ordinary character-chat answer quality. The existing query-byte limit also remains
an operational limitation; larger search limits do not repair oversized queries.


Adopt vector k=100, rerank candidateSize=100, final
size=50 and a fresh-settings memory budget of 4096 tokens. The result supports a bounded
integration check; the earlier [full 500 comparison](jev-depth-100.md) supports the search/packing
candidate, with its consumed-cohort and renderer limitations preserved. Neither
establishes a new normal-default 500-case score.

Retain recent 12 and the complete-recent-dialogue query policy. Do not adopt the
experiment's recent 1/question-only partition for ordinary character chat. Budget
maximum 4096 and the host's one-quarter-context cap remain unchanged; saved explicit
budgets are respected. Ownership/branch filters, consistent reads, source checks,
rerank failure rejection, cancellation and final delivery protection are unchanged.
Generic administrative queries keep their existing size=30 default; only memory
search requests explicitly use size=50. More candidates can increase rerank/query work; a larger budget can increase
generation input. No new LLM
preprocessing call is introduced. The changed product passed `npm test`335/335, syntax/release/SDK checks and all
maintained script/test syntax checks. With the pinned actual host and local service
emulators, browser44, final fault77 and all13 final prompt-delivery cases passed,
including cancellation, stale-source rejection, deletion, context loss, packing
and assembly. Fresh UI budget4096 and outgoing k100/candidate100/size50 are asserted;
an explicitly saved budget512 survives reload. Effective budget remains capped by
the host context. The initial fault recorder assumed the normal-only timestamp
fixture's budget also applied in fault mode; its failed assertion and cleanup0 are
retained. The corrected test saves/checks its own explicit value. No production
regression or new paid quality run was needed. See the separate default-adoption
archive in the evidence index for measured source hashes and complete outputs.
