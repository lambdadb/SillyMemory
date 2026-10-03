# Speaker attribution perspective trial v2

> Historical evidence: detailed runs and retired tools are preserved at the
> [pre-cleanup revision](https://github.com/lambdadb/SillyMemory/tree/94b9bc04cf664587ae4c96b7739c22af87897b6b).
> Reproduction commands below require their recorded producer; see
> [evidence retention](evidence-retention.md) for archives and recovery.

Declared on 2026-09-29 after closing the first development trial as a provisional
quality failure. The [v1 inputs and protocol](speaker-attribution-evaluation.md)
remain frozen. Its [24 answers](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/docs/results/speaker-attribution-v1.json) are preserved:
off 12/12, on 8/12 strict provisional passes, with the original four attribution
flags. Role labels and block quotes reached the actual outgoing system prompt
but did not prevent copied first-person claims in the two original cases.

This is an explicitly new development revision, informed by that failure, not a
retry of successful responses, a hidden replacement or an independent benchmark.
The second wrapper states the reply perspective directly: user quotations should
be paraphrased as the user's actions (you/your), while assistant quotations may
support first-person claims. Verbatim user quotations must identify their speaker.
Original source text, retrieval queries, corpus, oracle and scoring rules stay
unchanged. This is a prompt-format hypothesis, not a claim of guaranteed behavior.

Freeze a new plan (`speaker-plan-v2.json`) with this amendment and changed source
hashes before the first call. Execute the complete same 24-sample schedule with
tag `speaker-v2`, the same bounded retry policy (32 attempts maximum), 15-second
provider spacing and separate cleanup. Do not combine the two runs. Stop this
iteration after that run and record every remaining quality failure; do not
repeatedly tune these six cases until they pass. Broader and independent evaluation
is still required even if the diagnostic gate passes.
