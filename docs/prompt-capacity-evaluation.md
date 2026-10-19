# Native prompt capacity audit

> Historical protocol (2026-09-30), not the current product's capacity test.
> Its individual-excerpt messages, four-message retention and quarter-context
> allocation precede the quoted archive and recent-five policy. Use the maintained
> [final-delivery validation](prompt-delivery.md#verification-and-reproduction) for current behavior.
> The obsolete runner and inspector are retired; restore the recorded producer
> below to reproduce this audit. Do not run the historical observer against current
> code: its old prefix can report zero memory while generation succeeds.

## Question and fixed scope

Measure what SillyTavern actually keeps after SillyMemory's interceptor returns.
The extension's default 800-token allocation and one-quarter cap are heuristics.
The hook receives the configured context limit minus the output reserve, before
the host packs system/character instructions, control prompts and chat messages.
Neither that number nor `contextSize - recentTextTokens` is exact free space.

This audit changes no product behavior. It uses SillyTavern 1.19.0 at
`06bde939fb1e9c4c8d8641d810f0a916b5bce127`, its real manifest loader, Chromium,
normal `Generate`, tokenizers and built-in CORS proxy. LambdaDB and completions
are local emulators. The GPT-4.1 mini model name selects host token accounting;
no OpenAI request or model inference occurs. Source-ordered search results are
synthetic controls, not ANN or managed embedding evidence. `.env.local` is never
read, and the host starts with a fresh temporary profile and a synthetic key.

## Controls fixed before measurement

[Historical case definitions](https://github.com/lambdadb/SillyMemory/blob/94b9bc04cf664587ae4c96b7739c22af87897b6b/scripts/prompt-capacity-cases.mjs) specify six controls:
memory off/on with the same small prompt; larger system instructions; long recent
messages; a larger context; and a larger output reserve. Keep four recent messages
(including the new question), configured memory budget 800, native user/assistant
roles, no system-message squashing and no custom prompt post-processing.
The base case is 1536 context tokens and 256 reserved output tokens.

The runner writes a plan and runtime/harness hashes before starting either
emulator. It refuses to overwrite that plan and checks hashes again afterward.
Retain failed attempts separately. Do not adjust cases to make the current policy
look better; a harness correction requires a new output filename.

Observe without replacing host or product logic:

- Hook capacity, returned chat, source-chat immutability and extension inspection.
- Native `ChatCompletion` message/collection costs and remaining budget at
  `promptManager.setChatCompletion`, before optional system-message squashing.
- The non-dry-run `CHAT_COMPLETION_PROMPT_READY` event and the actual JSON request
  received by the local completion endpoint. Require exact message equality.
- Selected memory and recent-message retention in the final request, including
  losses. Require one completed host generation per case.

For this text-only configuration the native ledger should close as
`message tokens + remaining tokens + 3 reply-priming tokens = context - output`.
These are host estimates, **not provider-billed token counts**. The fixed fixture
does not test whether an actual provider accepts the request or agrees with that
accounting. No claims cover tools, images, World Info, other extensions, other
providers, other generation types, system squashing or newer host versions.

## Reproduction

Prepare an isolated checkout of the pinned host with its dependencies installed.
Restore the historical extension producer, then link that checkout at
`public/scripts/extensions/third-party/sillymemory` in the isolated host.
Do not repoint another experiment's host link or use a personal data directory.

```sh
git worktree add --detach ../SillyMemory-capacity-history 94b9bc04cf664587ae4c96b7739c22af87897b6b
cd ../SillyMemory-capacity-history
npm ci
npx playwright install chromium
ST_SOURCE=/path/to/pinned/isolated/SillyTavern \
  node scripts/prompt-capacity.mjs artifacts/prompt-capacity-new.json
```

The runner verifies the SHA and extension link, uses port 18134 (override with
`ST_CAPACITY_PORT`), creates a temporary localhost certificate with `openssl`,
and trusts it only in the child host. Browser requests outside the local host are
blocked. The host's only configured completion endpoint is the local fixture.
The host process, browser and emulators stop in `finally`; temporary data is
removed. The owned emulator collection is deleted through the product UI on a
successful run, and the report records its remaining count and key-storage check.

Use the observations to design a future protected-content allocation contract.
Do not ship a dynamic allocator or remove the quarter cap based on this audit
alone. Context selection quality and exact dependency spans remain separate
work. The product retains managed embeddings, ordinary upserts, `knn.queryText`
and session-only LambdaDB credentials; final managed-path live revalidation is
still required before public promotion.

## Retired tool preservation

The last active runner/inspector and these two capacity documents are preserved
from `827f24cd765d3dd74fab99dfc3657122785b8e3a` in local-only
`artifacts/archive/capacity-harness-retirement-v1.tar.gz` (12,166 bytes; SHA-256
`9dc6dc3fe967835149f99a37a561da4f5c74be56044d2dbbab04c5bc93b61108`).
All four original files pass hash readback. This preserves the obsolete tools for
inspection; use the older recorded producer above to reproduce the original six
measurements. The shared small capacity fixture remains because the maintained
final-delivery runner still uses it.

The current delivery runner was revalidated on the pinned real host and Chromium
153.0.8010.12 with local LambdaDB/completion emulators: all 18 delivery cases plus
repeated-passage packing and same-message assembly pass, with zero remaining owned
collections. No live provider or answer-quality claim. The report, pre-run source
hashes and log are retained in local-only
`artifacts/archive/capacity-retirement-validation-v1.tar.gz` (15,293 bytes;
SHA-256 `ecc3bcfbf788ff73f65c5fb006d82f128d66d44eba933eaa3d0fc923485080d8`); full byte readback passes.
