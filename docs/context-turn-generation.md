# Context-turn generation preflight amendment

Before any generation call, local pinned-tokenizer preflight found that the new
English source is 1,787 tokens and the Korean source is 2,469 tokens. The proposed
2,048-token host context in the search protocol therefore cannot demonstrate
English source overflow. Preserve that original protocol and its search evidence.
For the conditional generation follow-up, freeze a separate fixture identity
`context-turn-generation-v1` with context 1,536. Source text, questions, rubrics,
recent window 8, memory budget 400, output limit 256, model/instruction and the
original 56-answer off/on schedule remain identical to context-turn-v1.
Also include the two original English/Korean ordinary assistant-topic boundary
inputs from contextEdgeCases, preserving source roles and the message-8 banner
target. Use the same host character name as the new stories. This adds eight
answers (off/on, twice), for 16 cases and 64 answers total. The fresh corpus
alone is not proof of the repaired historical input; retain these two controls
before viewing any generated answer. The existing 72-attempt limit leaves up
to eight bounded transient retries for this schedule. This is a static
preflight correction, not a response to generated answers or a budget increase.

Require measured source overflow and actual off-prompt truncation. Report actual
required-source delivery in both modes, since truncation need not remove every
old target. Use the actual SillyTavern Generate path, managed retrieval and pinned
OpenAI snapshot. Keep source roles, recent messages, question, original source
chat, source hashes, retry/spacing limits and key/cleanup audits. Retain all
semantic failures. Read randomized answers before condition-key aggregation;
assistant judgments are provisional, with independent human review unset.
