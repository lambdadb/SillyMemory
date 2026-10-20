# Query1 evidence index

Only checksums, availability and restoration dependencies belong here. Product
decisions and aggregate outcomes are in [the concise report](query1-retrieval-quality.md).
Detailed per-case, token, latency, cost and transition records remain in ignored
artifacts; do not append another experiment diary to tracked documentation.

## Final pre-merge audit (2026-10-19)

Local-only `artifacts/archive/pr84-final-audit-v1.tar.gz` preserves the pre-cleanup
files/PR body at `6441134d9bcbae753cc1a22c1e1986587ea4600d`, removed historical
session-clock helpers/tests, final-audit report and fresh unit/host-delivery receipts.
SHA-256: `8a9c9223f42de971a134c852f3dcc6de3f9144782e0839192255ae0c11fb4d58`;
611,187 bytes / 60 files. Configured-secret scanning and complete byte readback pass.
Restore under `artifacts/` and read `pr84-final-audit-v1/RESTORE.md`.

The audit verifies 90 retained archive-table hashes and 96 local document links,
377 unit tests, and 18 pinned-host/local-provider delivery cases plus packing and
assembly. No new paid benchmark or product-default change. Historical 380-test
receipts remain unchanged. The original reports and all prior archives are intact;
latest-head CI and automatic-review follow-through are recorded separately on
[PR #84](https://github.com/lambdadb/SillyMemory/pull/84).

## Full reports preserved before condensation

The original reports are preserved byte-for-byte in local-only
`artifacts/archive/retrieval-quality-report-history-v1.tar.gz`, SHA-256
`7126912b0bef710f712125e6efe6a3342cff77a8e5633b72574dc35b363fee35`. Its six members pass full hash readback and configured-secret scanning.
All 49 prior archive hashes below were checked before removing active-tree prose.
No raw evidence, prior archive or original label is deleted or overwritten.

| Original document | Lines | SHA-256 of original bytes |
| --- | ---: | --- |
| `docs/query1-retrieval-quality.md` | 2931 | `5952fd44c92af865d1c18cb649b17cef1bc82fcf4c56f0cb97b1140aae4987be` |
| `docs/small-default-error-analysis.md` | 410 | `d410b1b161f9ff62fc3ad4a28396b0af1120a2e65a6458819b57a82c627a8e77` |

The full files also remain in Git history at
[`1546bebaa318cda4bd73c663f0f7276eef34ba44`](https://github.com/lambdadb/SillyMemory/commit/1546bebaa318cda4bd73c663f0f7276eef34ba44).
That preserves report prose, not downloadable raw run data.

## Availability and offline restoration

All archive paths are relative to this retained worktree's `artifacts/archive/`.
They are **local-only, not uploaded and unavailable in a fresh clone**. Do not remove
the worktree before another retained copy is verified. Each bundle contains its
manifest, frozen plan/producers, input/resource bounds and dependency locks. Extract
under ignored `artifacts/`, restore its source revision and required parent bundles,
then use its recorded offline verifier; current runtime code may no longer reproduce
historical results. Verification is distinct from sending new paid API calls.

Canonical LongMemEval-S dataset SHA-256:
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
Original judge-source SHA-256:
`ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251`.
Licensed dataset/source inputs remain explicit local dependencies; a checksum alone
is not a promise that a raw bundle can be downloaded.

The full follow-up 500 quality bundle uses the pre-UTC/local-date-fix source at
`149d3db`; restore that producing source for its frozen runtime verifier. The later
`utc-local-date-guidance-v2` bundle preserves before/after source and unit/host
delivery checks, with no new paid answer-quality score.

The later `followup-guidance-adoption-v1` bundle records adoption of the exact
evaluated deletion from base `026204a`: 500 model-free budget checks and 18
actual-host/local-emulator delivery cases. It preserves changed selections and
producer snapshots without replacing the fixed-memory 470/472 answer results.

The later `judge-exact-answer-audit-v1` and `jev-judge-reference-v1` bundles use
producer `e27ebc43170b26167ab2eeeeedbf8131970b5f87` and depend on the original
`followup-guidance-full500-v1` bundle. Restore the clean producer checkout for their
source-binding verifiers. Both preserve generated answers and original 472/500
labels; no product changes accompany these judge-only runs. Full archive readback
verifies 90 and 6074 members respectively, with configured-secret scanning.

The `native-guidance-review-v1` bundle records the PR review corrections to
smoke assertions and architecture prose. Restore base `31961ba` plus its recorded
patch: 103 actual-host/Chromium checks with local providers, zero remaining emulated
collections and no runtime change. Preserve the initial tight-budget failure too.
All 14 archive members pass hash readback and configured-secret scanning.

The `jev-errors24-v1` audit restores producer `3f3b66b` and the declared original
Jev/full500/generation/retrieval bundles plus canonical dataset. It reviews all 22
always-No and two variable-label cases without a new paid call or changed label.
All 14 members pass archive hash readback and configured-secret scanning; detailed
source witnesses are local-only, not maintained fixtures or fresh-clone inputs.

## Immutable run archives

The `quoted-memory-product117-v2.tar.gz` archive retains the separate current-product
117-pair closure under source `3dd2a8584f78d9af797a5319dfc408023a6f430b`: 468 new
receipts, exact current-guidance/selection inputs, 115/117 in each arm and no label
transitions. Restore `quoted-memory-product117-v1/`, its declared parent bindings
and matching source; `analyze.py all` verifies dispatched input and original judge
labels. All 1,433 archive members pass hash readback and configured-secret scanning.
The v2 archive corrects only an explanatory wake-up-time typo (earlier 6:30 AM,
not 7 AM); raw calls and scores are unchanged, and the original v1 archive remains
preserved with its hash in `report-correction.json`.

| Archive | SHA-256 |
| --- | --- |
| `quoted-memory-product117-v2.tar.gz` | `c7280f3f27be9ad39a3b68160bf7d1e7a625c55b2f61d73bae90476e1b4b253b` |

The `quoted-memory500-complete-v1` bundle records the separately authorized
structural continuation, preserving the original pilot below. Restore base
`92b09573cf1f05aa741328bd90f1506ba2f12478`, the parent paths in its frozen locks,
and its `product-source/` overlay for current-product verification. `verify.py`
checks 2,857 pre-call hashes, 1,000 unchanged prepared inputs, all 2,000 receipts,
32 byte-identical reused pilot pairs, nine source-reviewed transitions and separate
product/host checks. It retains 500 offline product selections, 18 real-host
delivery cases and 103 browser checks with local providers. All 6,056 members pass
full archive readback and configured-secret scanning. `RESULTS.md` distinguishes
the fixed-source answer score from the reselected product contexts; neither
historical labels nor the pilot's failed gate are rewritten. Local-only, not a
fresh-clone/CI dependency or a new live-provider host score.

| Archive | SHA-256 |
| --- | --- |
| `quoted-memory500-complete-v1.tar.gz` | `d7f27c0beba524e517b0483a5ec4093205ac7c5170f0d63eed538a112b667605` |

The `quoted-memory500-v1` bundle restores producer
`92b09573cf1f05aa741328bd90f1506ba2f12478` and the budget/role-aware/standalone
parent bundles declared in its frozen locks. `verify.py` checks 1,521 hashes,
500 baseline reproductions, 1,000 prepared inputs, 128 actual pilot receipts,
unchanged source/recent/guidance boundaries, the failed gate and zero confirmation
calls. All 1,354 archive members pass full hash readback and configured-secret
scanning. `RESULTS.md` is final; the pre-call README/plan and unused 468 paired
inputs are preserved unchanged. This is a 32-case pilot, not a full-500 score,
product change or fresh-clone/CI dependency.

| Archive | SHA-256 |
| --- | --- |
| `quoted-memory500-v1.tar.gz` | `b340189ade7adc2e9dbea39c34a4100ef87c0c8d438ae81984dfefa454a06e9e` |

The `budget4096-8192-jev500-v1` bundle restores producer
`92b09573cf1f05aa741328bd90f1506ba2f12478`, the role-aware/personal-criteria/standalone
parent bundles and canonical dataset according to its frozen locks. Its offline
`verify-final.py` verifies 4,559 hashes, 500 exact baseline inputs, 2,000 actual
answer/judge receipts, identical retrieved results/recent context, per-arm budgets
and all 11 changed-pair reviews. All 7,048 members pass full archive hash readback
and configured-secret scanning. `RESULTS.md` is the final report; `README.md` remains
the pre-call snapshot. `resource-audit.json` supplies the bucket-aware cost estimate.
A preserved archive-attempt note records a safe no-overwrite assertion and corrected
destination; existing source-label evidence is unchanged. No new remote resources,
product changes or fresh-clone/CI dependency are introduced.

| Archive | SHA-256 |
| --- | --- |
| `budget4096-8192-jev500-v1.tar.gz` | `65adbedda47a128f87dc7073a69203d5a6180b6ca2a15fb9121cf36cdecc8574` |

The `role-criteria-interaction17-v1` bundle restores the same `92b09573` producer,
role-aware/personal-criteria parents and canonical dataset. Its offline verifier
checks the pre-run lock, 51 native receipts/prepared inputs, unchanged recent
context, the failed gate, zero answer calls and 17 owned deletions confirmed by
404. All 253 archive members pass hash readback and configured-secret scanning.

| Archive | SHA-256 |
| --- | --- |
| `role-criteria-interaction17-v1.tar.gz` | `876f12893654041af23fc0da93178afa841774716dd3c06bcf8a025a73c5bff3` |

The `compact-label500-v1` and `source-label500-v1` bundles restore producer
`92b09573cf1f05aa741328bd90f1506ba2f12478`, the role-aware parent bundle and
canonical dataset. Their offline verifiers check 500 exact baseline reproductions
and frozen selections/rendering; the latter also verifies 2,000 live provider receipts.
All 2,028 and 7,046 respective archive members pass hash readback; configured-secret
scans pass. Compact-label stops at its frozen offline gate; source-label completes
its paired 500 and rejects adoption. Detailed runs are local-only, not CI dependencies.

| Archive | SHA-256 |
| --- | --- |
| `compact-label500-v1.tar.gz` | `ceeab5d9892fe26c0361609565f264b297ffa8f730fadd1fe8526b26de8b51fb` |
| `source-label500-v1.tar.gz` | `e6b7152ec6312f02160a43bf9bb31e9fa3d31526219c20393eacce847f43f124` |

The `requested-relation-guidance-v1` negative trial restores clean producer
`f42149c3b5472fb986269a65cb7d999990168df1`, the original follow-up/Jev/error-audit
bundles above and source paths/checksums in its `source-bindings.json`. Its offline
`verify.py` checks 1000 frozen inputs, 420 real provider receipts, the failed
diagnostic gate and zero confirmation calls; it does not send new requests.
All 2085 archive members pass hash readback and configured-secret scanning.
Detailed reviews/runners remain local-only, not maintained code or CI dependencies.

The `context-interference-two-v1` diagnosis restores clean producer
`447e1900a2ac82cc255a1b2cce08f3202997999f` and the requested-relationship/Jev/error-audit
bundles declared in `source-bindings.json`. Its offline `verify.py` checks exact
whole-message deletion, competing witnesses and all 20 answers/40 real receipts.
All 151 archive members pass hash readback and configured-secret scanning.

The `standalone-memory500-v1` bundle restores producer
`e28aeeb8c8b1dd593cf6f01bdc645f6f2ec59b2c` and the parent bundles/dataset listed in
its README and source bindings. Its offline verifier checks 1,000 fixed inputs,
2,000 provider receipts, source-coordinate coverage and all 12 label transitions.
All 6,037 archive members pass full hash readback and configured-secret scanning.
The host-free core audit covers 500 cases; no new remote indexing/search is claimed.

The corrected `standalone-same-history500-v1` comparison restores producer
`4418d993b8d2084703fe63c36998cab6cd7489c8`, the earlier standalone bundle and its
source dependencies. It preserves identical recent dialogue in both arms and changes
only the host prefix. Its offline verifier checks 1,000 inputs, 2,000 real receipts,
all 15 changed-label pairs and unchanged parent source/core-audit bindings.
All 6,034 members pass full hash readback and configured-secret scanning. The earlier
recent-deletion result remains a distinct preserved experiment, not its control.

The later `sent-system-review-v1` host validation restores producer
`5d4ca808de41515075a7fbeb445808a018ec0464` plus its archived patch. It verifies
system-role date guidance with 18 actual-host prompt cases and 103 browser checks
against local providers, retaining failed fixture attempts. Both suites clean all
emulated collections. The 21-member archive passes hash readback and secret scanning.
This later product fix does not alter the frozen same-history benchmark inputs/scores.

The `standalone-errors21-v1` offline audit uses producer
`92b09573cf1f05aa741328bd90f1506ba2f12478` and the frozen same-history candidate.
Restore its declared parent bundles/dataset from `bindings.json`; `audit.py` verifies
all 21 No-case input identities, source spans, returned/selected coordinates and
unchanged labels. The 10-member archive passes full hash readback and secret scanning.
Interpretations are agent source review, not independent adjudication or relabeling.
No new model/search calls or product changes are included.

The `personal-rerank-criteria-v1` native pilot uses the same producer plus its
retained local source snapshots and canonical dataset. Its frozen 16-case criteria
comparison includes 32 native searches, 40 fresh answers and 40 judgments under
unchanged rules.
All 16 owned collections are verified absent. Restore its declared source-bound
parent bundles for `preflight.mjs` and `verify.py`; both checks are offline. Full
archive readback verifies 403 members, with configured-secret scanning. The exact
criteria, request bounds, selected sources, answers, interpretation and partial
cost estimates remain local-only. Product defaults and historical labels are unchanged.

The `personal-rerank-criteria500-v1` full comparison uses producer
`92b09573cf1f05aa741328bd90f1506ba2f12478`, its retained source snapshots and the
unchanged pilot criteria. Restore the canonical dataset, pilot plan and parent
paths/hashes in `source-bindings.json` before running its offline `verify.py`.
All 500 questions receive fresh paired native retrieval and generation/judgment;
no pilot answers are reused. The verifier checks 4,039 locked hashes, 1,000 native
requests, 2,000 model receipts, source fields, budgets, recent context and all 18
changed-label reviews. All 500 owned collections are verified absent. Full archive
readback verifies 9,566 members with configured-secret scanning. Original labels,
source assessments, frozen rates, partial costs and the keep-default decision are
retained locally; historical pilot gate and evidence remain unchanged. This is not
current-product/browser evidence or a downloadable public benchmark bundle.

The `role-aware-rerank500-v1` comparison uses producer
`92b09573cf1f05aa741328bd90f1506ba2f12478`, its frozen source snapshots and the
canonical dataset. Restore parent paths/hashes in `source-bindings.json`, own inputs
and snapshot bindings before its offline `verify.py`. It verifies 2,557 bound hashes,
500 paired questions, 1,000 native requests, 2,000 answer/judge receipts, unchanged
recent context and guidance, source fields, budgets and all 16 changed-label reviews.
The shared role-keyword schema and fields-only request difference are preserved;
all 500 owned collections are absent with 404 verification. All 10,076 archive members
pass hash readback and configured-secret scanning. Raw probabilities, source-review
limits, partial cost estimates and the retain-default decision remain local-only.
This is a standalone consumed-development comparison, not current-product/host proof.

The `message-diversity500-v1` bundle uses producer
`92b09573cf1f05aa741328bd90f1506ba2f12478` and the saved text-only results in the
parent `role-aware-rerank500-v1` bundle. Restore those source/input paths and the
canonical dataset declared in `execution-lock.json` and `preflight.json`.
Its offline `verify.py` checks 2,526 frozen hashes, 500 exact baseline prompt
reproductions, 1,000 prepared inputs, unchanged recent context/guidance, rank-and-source
identity admission, budgets and zero dispatched provider calls. All 34 structural
losses receive source-excerpt review; three full-input necessary-operand losses fail
the predeclared paid gate. This is a rejected selection replay with no candidate
answer score or host claim. All 2,031 local-only archive members pass full hash
readback and configured-secret scanning; the original parent evidence is unchanged.

| Local archive filename | SHA 256 |
| --- | --- |
| `message-diversity500-v1.tar.gz` | `836eec05880f97388e797193049d350ab613b73f32d571db4a5a1406d61e27ea` |
| `role-aware-rerank500-v1.tar.gz` | `400d2b52ebbd175e435976e845e31685fa235e0e42155168f17fbaf3e2670929` |
| `personal-rerank-criteria500-v1.tar.gz` | `9558c61f8f76a8732f52de900ec58a077be5aa30858073d94abe4ff8a0d0c1f9` |
| `personal-rerank-criteria-v1.tar.gz` | `18374032788533cd604c043ebe8eb2dc46406468acd9ca4dcae590f2d575f90d` |
| `standalone-errors21-v1.tar.gz` | `b2ef49bb81b26dea088a382bf0d7cfa5de769b2b207edbf60a67575fc8bea44c` |
| `sent-system-review-v1.tar.gz` | `e6da2707984cb3a367c3cecea87d6becd021e1f3682d4fe56ad43121ef7a9cec` |
| `standalone-same-history500-v1.tar.gz` | `2d4085b70b70a49f109915fc5d6593fd7f730833642ff8586ba591cd28997365` |
| `standalone-memory500-v1.tar.gz` | `07b5c51abcd046d5977442ce6c9186a7b7164e52f37431bf7b7d2830f8291b88` |
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
| `ranked-depth200-full500-v1.tar.gz` | `734bd6474f74442666e981dc024c276cdede472202c94c8c6f58c312a1a40b7f` |
| `ranked-depth200-answers500-v1.tar.gz` | `71088cf776717fa53e80ac1ff4dbdbb007a78aed419c504c30f5f9b1047a8a41` |
| `sol-judge-audit1000-v1.tar.gz` | `76688b7fe665f473e18690778b59190462acfffa77adcf4ec4f191cd44089e4a` |
| `query1-errors31-v1.tar.gz` | `91195674a65ed93fdc3eec419665e9c1fde9cc8ad8c6b0ac8decf2cac320062f` |
| `embedding-large-full500-v1.tar.gz` | `0a823a8e71683970f6a2e9e852aaa854e34b16ed46df45ee7ac27f14b76c86ca` |
| `embedding-large-answers500-v1.tar.gz` | `4050546035a4fe30f08733d3bb52062d82c0a62ecb59a3f36675af814d190629` |
| `compact-date-provenance500-v1.tar.gz` | `01c6df24b1dceeeb7527509a55611fa183341250c7cffc251b3491155e84b79f` |
| `sent-date-delivery500-v1.tar.gz` | `f28bc1bcaca48ac34bbe657ef04731c45a8192d652e5dec0ce9884701086c145` |
| `sent-budget4096-8192-500-v1.tar.gz` | `994cd09369a2d50208aec38d3501db833afefaf3468d6d37efd346d07d29550a` |
| `embedding-voyage500-v1.tar.gz` | `94f9296bf35d070daeeba327c02097e94aff0a66e89e47fe24f40c915068a1c7` |
| `embedding-voyage-answers500-v1.tar.gz` | `543314272d33d578305f279a4edfb49413d6ac9ace563d7c1d98d1a8b9964ccf` |
| `embedding-large-sent-comparison500-v1.tar.gz` | `b2da2d42147729b8d99e6eeba2331e4b8cdf68b37d6c7871d0d8e2c721ee605c` |
| `lambdadb-cost-baseline-v1.tar.gz` | `87bdae13c0fcdb3b182df4276cd0dd8b62a55f90c8e6b9cc185dcb6763c27f9e` |
| `rerank-voyage-large500-blocked-v1.tar.gz` | `c04202668146d519dbec4283ff418050b7afd7816092990039f2466fe03c0fc1` |
| `rerank-voyage-large500-completed-v1.tar.gz` | `d339cea17fbdb61bcdb2d419887ca8184a4f0599e116474bbced08a36f8ea345` |
| `luna-judge-large-jev500-v1.tar.gz` | `12213a97e4d3a1b40a60312fac820248a9beb1d867757ce311fdfa4e193b9156` |
| `luna-mem0-judge-large-jev500-v1.tar.gz` | `2d47edffa73e83a6f283bf5425a724cdfb4e8868bda267fca15d96cc0011d426` |
| `luna-generator-default500-v1.tar.gz` | `a78fa1c91f4ce2b3d846318f3ef3dfd60bdef44a4b5cdb58d66f1e88e1f6c8f9` |
| `sol-medium-generator500-v1.tar.gz` | `b79313c5e0444cc630c822677cc0a772c8a26c3487ad59b66db975140d68b3d7` |
| `embedding-small-large-matched500-v1.tar.gz` | `f5e572d54934e08056bb5bd86eedd85204baa2427de0aeb13f958a7128ec2fe2` |
| `small-default-error-audit-v1.tar.gz` | `b37a68fcd84ba86ae1d178ddd2701d5e4bbd910161971e80cb31f14fe8f08c85` |
| `small-retrieval-stage3-v1.tar.gz` | `ed8abb6acd4271b5009ef7583712a21973bf7dbbb755c45a7aed4c9cbbe81c8b` |
| `small-depth100-200-sent500-v1.tar.gz` | `93255946e574588a899c81056c209a869048a73b249ef3af5c3998b7001c6a93` |
| `depth200-product-adoption-v1.tar.gz` | `cc4a2ead26f80b1b2be381927a1455b26aef636658431e21772e7ff00d782caa` |
| `small-rerank100-200-k200-sent500-v1.tar.gz` | `dd18be5cc97441e835d040e42e9f913fb89c17cb659e482431f4c5a0a1363791` |
| `judge-minimal-clarification500-v1.tar.gz` | `8e37411b62645340d83594c4deacd5a848be1a632bbbd391f41fc5e00ada346c` |
| `generation-guidance-paired500-v1.tar.gz` | `d58ee5cbd4400e62727ca0ad99f4ccb90cb22a3a779013d8956d0942ba6fbe7a` |
| `guidance-default-errors29-v1.tar.gz` | `16dfd2db8af2e33ce52088b80e44ccd4576013758198cfa01717f1c95057cc6e` |
| `memory-presentation-order-v1.tar.gz` | `5b9a509f137574b11467e02e537dcb4df959c289349c1090fbbb9371ed1b14a3` |
| `minimal-guidance-ablation-v1.tar.gz` | `3f9cf9e06f9be8ef829be7a7b8785f46f96191a0abc5835dd10bb73dbcf0427b` |
| `followup-guidance-ablation-v1.tar.gz` | `a02fd108e2f4b4118710d14eba35f6ba7ca69424f92d7262051dbe6de43165a5` |
| `followup-guidance-full500-v1.tar.gz` | `a03a0ee5ae1ac9e7064fd6360c8d4175a7fdd662ea6b8560e314cb94b77c5397` |
| `utc-local-date-guidance-v2.tar.gz` | `6914edb4bb7592c5b693c315eae9e6d32c6ce0b2eeb3528050ccde127730d7a6` |
| `followup-guidance-adoption-v1.tar.gz` | `314bce6afa55faa9c0b2f6a686903c723bbe173f05b7e60cdccd395238ae14ed` |
| `judge-exact-answer-audit-v1.tar.gz` | `b2bd885e1c6a595cd241a48680b03e7010ba2f6646fe87cf368f7f0162decbdc` |
| `jev-judge-reference-v1.tar.gz` | `ba0dcf42d71c6b43eedf31eabe8e00ee3a732ae9331a8e4e1aaaa450a4314afc` |
| `native-guidance-review-v1.tar.gz` | `f642f53bbb195d552343b2c9c363633201d40640c0c1e033d584f6c94731ac83` |
| `jev-errors24-v1.tar.gz` | `8fe1dd6481b937fe72df59eb85165f9847274a92e31a101fd03e2ff3e5a50d4b` |
| `requested-relation-guidance-v1.tar.gz` | `0db323f832e03dd168047384fce62fe0d880efb9a6e2a315ec0ef273e0456ffb` |
| `context-interference-two-v1.tar.gz` | `6a5fda275c811202bd86ed966f5007c625c6160cea3cc83a9839558bb8e6bf30` |
