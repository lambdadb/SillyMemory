# Small-default error analysis

## Current guidance: all 29 original No cases (2026-10-17)

Retain the adopted work-branch profile and its original **471/500 (94.2%)** record.
The complete offline audit uses original source, returned final 50, dispatched 4096
context, generated answer and unchanged original task-specific GPT-4o labels. It
adds zero API calls and no adjusted score. The cohort is distinct from the older
463/500 run below and the latest full follow-up control (470/500) and deletion
candidate (472/500). Its 29-case classification is not reassigned to those runs;
see [the product decision](query1-retrieval-quality.md).

| Primary disposition | Cases | Meaning |
| --- | ---: | --- |
| Necessary fact absent from returned final 50 | 0 identified | No new concrete missing dependency established; not proof of perfect recall |
| Necessary returned fact lost only during delivery | 0 identified | No new delivery-only loss established in this subset |
| Available-evidence response/provenance/alignment risk | 4 | Better source use/personalization is possible |
| Question/source/reference interpretation or chronology uncertainty | 20 | No unambiguous causal memory defect established |
| Reference value or personalization present, but judge says No | 5 | Label is not a complete source-use verdict |
| Total original No | **29** | Preserve 471/500 |

Across 28 cases, all 58 annotated source-message bodies are complete in returned and
delivered context; one abstention case has no positive annotation. This is
**whole-body annotation coverage, not necessary-fact recall**. Review includes
91 source witnesses and surrounding/unmarked dependencies. Coding-agent analysis
is not independent adjudication or proof that 20 reference answers are wrong.

The actionable boundary is generation/source use: omitted relevant alternatives,
weak personalization, conditional assistant estimates versus confirmed user facts,
and unclear event/role matches. Source timestamps describe conversation time;
they do not establish undated events. Counting units, date windows and repeated
stories can support multiple interpretations. Preserve those limits rather than
forcing a matching label or adding a case-specific prompt rule.

### Completed follow-up decisions

| Trial on fixed selected memory | Fresh paired score | Decision |
| --- | --- | --- |
| Chronological→best-ranked message groups | 29→28/32 | Retain chronological; conditional 74 not run |
| Current→three-sentence minimal guidance | 81→83/104 | Lost role qualification/personalization and wrong arithmetic; conditional 396 not run |
| Current→remove only follow-up obligations | 79→82/104; full 470→472/500 | All 396 remaining pairs completed after explicit authorization; defer automatic runtime promotion |

The last trial retains personalization/event-role instructions. Preference scores
26→29/30, abstention 28→28/30, historical 29 No 9→9/29. Completing the remaining
396 gives 391→390: the full net two accepted labels do not establish broad factual
improvement. Many transitions retain the same facts/caveats or have uncertain
source chronology. The known season/series qualification loss remains disclosed;
it does not automatically veto the explicitly authorized full comparison.
The clarification policy stays unchanged pending actual-budget adoption checks. Full source
reviews, original labels and resource costs are retained; see [the full comparison](query1-retrieval-quality.md#follow-up-obligation-only-bounded-comparison-2026-10-17).
The later UTC/local-date instruction fix is validated separately with unit/host
delivery checks; these recorded answer scores are not rerun for that wording.

## Decision and scope (2026-10-16)

The earlier fresh Small run scores **463/500 (92.6%)** at k100/candidate 100,
Query1/Bayesian English, Jev/final 50, sent/ranked 4096 and recent-five/pair context.
Its 37 No are a separate historical cohort; do not transfer that classification to
the current 29 No or treat it as installed-user/browser evidence.

| Earlier primary disposition | Cases |
| --- | ---: |
| Necessary fact absent from final 50 | 5 |
| Necessary returned fact lost only during delivery | 0 identified |
| Available-evidence response/personalization/provenance choice | 6 |
| Source/target/chronology uncertainty | 22 |
| Requested reference value present, judge says No | 4 |
| Total original No | **37** |

Three clear missing dependencies are a spending operand, a purchase linked to a
competition, and an unmarked relative-date anchor for a dinner party. Age and
museum sources are also missed but have separate answer-target caveats. Later
breadth 200 recovers the three clear answers; the fixed-k200 rerank comparison
supports retaining candidate 200. It does not redefine the earlier 37 case records.

## Live reconstruction of the three clear gaps (2026-10-16)

A bounded native reconstruction finds those three sources absent from each
single-leg top 100 and identical 100-ID Bayesian/Jev candidate sets. The observed
loss precedes Jev ranking; it does not establish ANN approximation failure.
No new generation/judge calls. All four owned collections, including diagnostic
request-recovery resources, are deleted with 404 confirmation. Detailed source
coordinates, request receipts, source reviews and cleanup proof remain retained.

## Evidence and reproduction

The [evidence index](query1-evidence-index.md) preserves full pre-condensation prose
and every original archive checksum. Current audit: `guidance-default-errors29-v1`;
earlier audit: `small-default-error-audit-v1`; native reconstruction:
`small-retrieval-stage3-v1`. Their frozen verifiers check retained dependencies
without sending model calls. The original dataset, raw retrieval/answer bundles
and full reports are local-only dependencies, not CI fixtures or fresh-clone data.
No original evidence or label is deleted/rewritten; restore the matching producer
and source locks before verifying a historical run.
