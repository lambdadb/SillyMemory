# English primary-priority selection

## Completed decision

**Retain the existing equal-interleaving runtime.** The fixed 2:1 candidate
completed all 14 English development answers through the pinned SillyTavern host,
LambdaDB managed embeddings and OpenAI. It scored 12/14 versus the historical
baseline's 10/14, but lost one previously correct answer. It therefore fails the
frozen no-answer-loss gate below. The tested runtime patch and its provisional
tests were archived and reverted; this change ships no selection change.

| Measure | Baseline | Candidate |
| --- | ---: | ---: |
| Correct answers / 14 | 10 | 12 |
| Median final-answer input tokens | 3,361.5 | 3,356 |
| Paired newly correct / newly wrong | — | 3 / 1 |

The net gain is promising development evidence, not an adopted improvement.
In particular, one win had an **identical complete API request** to the old run:
it cannot be attributed to the selection change. No score, acceptance criterion
or candidate was changed after these observations, and no answer was rerun for
quality. The 42 held-out questions remain unused.

## Interpretation of changed answers

- `d23cf73b` (cuisines): all four labeled facts now reach memory instead of three,
  and the answer is correct. The two queries' ranked candidates match the old
  run, supporting selection competition as the source of the delivery gain.
- `gpt4_7a0daae1` (tennis dates): both dated messages now reach memory instead of
  one, and the answer is correct. Fresh candidate rankings also changed, so this
  run does not isolate selection weighting as the only cause.
- `gpt4_2ba83207` (grocery spending): the complete request is byte-identical,
  including model/settings/messages, but the old answer was wrong and the new
  one correct. This is observed response variability even with temperature zero,
  not evidence of a policy gain.
- `d24813b1` (baking preference): the baseline linked its recommendation to the
  user's past lemon-poppyseed cake; the candidate gave generic suggestions.
  Both prompts delivered that exact user source (zero-based message 403).
  The loss is therefore an observed failure to use delivered evidence, not a
  demonstrated missing retrieval/selection result. Changed distracting passages
  and generation variability are possible causes, not isolated causal findings.
- `gpt4_2f584639` (gift order): both answers remain wrong; only one of the two
  labeled dated messages reaches memory. This remains a selection/delivery gap.

Across the twelve cases with saved baseline traces, ranked candidates are
identical in six. The other two baseline questions came from the old pilot and
lack those traces. Comparisons are paired development observations at different
execution times, with fresh managed retrieval and model responses. They do not
prove statistical improvement, deterministic regression, general English quality
or ANN recall. No new Korean evaluation was run.

## Validation, usage and retention

The offline English-only replay retained 98/98 previously selected required-source
observations across 112 case/budget rows. Twelve cached development traces gained
five labeled messages (14 to 19 of 21). These overlapping source checks are not
answer-correctness scores. One real-host/local-service fixture passed before paid
execution; its synthetic responses are not provider-quality evidence.

The paid run completed 14 answers and 14 exact yes/no judgments in 28 successful
first attempts. There were no provider retries, native embedding calls or summary
updates. All fourteen observations passed source/prompt/token checks and exact
candidate-selection replay; 70 checkpoint receipts passed checksum verification.
Both owned remote collections were verified inaccessible, and the disposable host
profile/worktree was removed. No unrelated remote data was changed.

OpenAI successful usage was 49,866 input / 1,101 output answer tokens and 3,136 input
/ 23 output judge tokens: about USD 0.030 using frozen uncached price assumptions,
not an invoice. Conservative OpenAI reservation was USD 0.3512 of 2. LambdaDB work
was 379 non-cleanup requests, 12,672 document-write attempts, 1,540,306 estimated
embedding-input tokens and 11,990,349 POST bytes. Managed-provider/LambdaDB billing
is excluded from the OpenAI estimate. All work stayed within the original hour.

The provisional candidate passed 31 runtime tests; nine of the full suite's 311
tests stopped on historical producer-hash mismatches rather than a behavioral
assertion. After reverting the rejected candidate and its tests, all 309 existing
unit tests and syntax/release checks pass. No historical source snapshots or
compatibility branch were added just to make those old evidence checks pass.

The [compact manifest](benchmarks/english-primary-summary-v1.json) retains every
paired verdict, source/report hashes, usage and archive checksum. Full prompts,
receipts, observations, frozen plan, producer patch and one-off tools are in
`artifacts/archive/english-primary-v1/evidence.tar.gz` in the evaluation worktree.
The 5.5 MiB archive is **local-only**, not uploaded or available in a fresh clone.
It excludes credentials, dataset cache and host dependencies. To revalidate,
check out the manifest's producer base revision, extract the bundle, apply
`artifacts/candidate.patch` and run `node artifacts/analyze-primary.mjs` after
restoring the separately archived baseline evidence and locked dataset/tokenizer.
Use a fresh output path or move the extracted analysis report aside; the analyzer
refuses overwrite. This is offline verification, not another paid run.

Close this candidate instead of trying more weights or rerunning the loss until
it passes. Retain the current policy as the baseline for a separately frozen
English held-out evaluation. The preference failure should inform future
answer-use evaluation; it is not a reason to silently add another prompt/reranking
experiment here. Promotion/release remains separate.

## Frozen decision before new calls

Evaluate one already selected candidate: interleave two primary-query candidates
per contextual candidate. Query construction, managed embeddings, candidate
counts, local validation, chunking, packing, recent 12 and memory budget 800 stay
fixed. There is no language classifier or user-facing setting. The current
English-first scope accepts disclosed Korean quality regressions as deferred.

Reuse the completed 14-question development comparison as the baseline. Generate
only 14 new SillyMemory answers at context 32,768 and judge them with the same
pinned models, prompts, input adapter and settings. Do not rerun plain, native
Vector Storage or Summarize. The 42 held-out questions remain untouched. Before
provider work, check existing English recorded follow-ups and one actual-host
local-service case. Unit fixtures do not establish provider answer quality.

Adopt only if every formerly correct development answer remains correct and at
least one formerly incorrect answer becomes correct, with successful delivery,
budget enforcement, source preservation and owned-data cleanup. A tie or loss
rejects this candidate. Record all answers/failures; do not retry for quality,
change the candidate after results or present this as independent held-out proof.

Bounds: one hour; 14 answers + 14 judges + at most four transient retries;
USD 2 conservative OpenAI reservation, 15-second completion spacing, 90-second
attempt timeout, three attempts per request. No native embeddings or summary
calls. LambdaDB bounds: 1,000 non-cleanup requests, 20,000 document-write attempts,
3M estimated embedding-input tokens, 50MB write bodies and four exclusively owned
collections. These are workload bounds, not a LambdaDB billing quote. Unknown
provider delivery stops without automatic resend; keep receipts and ownership
records and verify cleanup. Do not reset bounds after interruption.

The one-off executor is derived from PR39's runner and ledger, with a frozen
SillyMemory-only schedule and candidate source bindings. It remains under ignored
`artifacts/`, archived with its producer patch/results. No parallel general-purpose
runner will be added to maintained source. Product changes remain provisional
until this gate completes; rejected runtime changes will be reverted.
