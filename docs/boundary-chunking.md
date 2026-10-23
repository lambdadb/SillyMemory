# Boundary-aware indexing

Index messages using source-preserving `boundary-v1` chunks, with a default
800-code-point ceiling. Prefer the last paragraph, then sentence, then whitespace
boundary in the second half of a full chunk; otherwise split at the ceiling.
Short messages remain whole. English sentence segmentation is intentional;
other languages are not optimized.

Keep exact UTF-16 source offsets and include policy/boundaries in document IDs.
Chunks introduce no overlap and reconstruct the eligible source text exactly.
Reconciliation removes superseded IDs after edits or chunk-layout changes.
Indexing limits are characters, not embedding tokens or a linguistic correctness
guarantee; final prompt selection uses the host tokenizer independently.

See [current defaults](conversation-memory-defaults.md),
[source assembly](source-assembly.md) and `tests/chunking.test.js` for the current
contract. The original bounded comparison found no answer-quality improvement;
its mechanical source-boundary result is not a general recall-quality claim.

## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/boundary-chunking.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
