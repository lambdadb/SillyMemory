# Final local review

Reviewed on 2026-09-28 for the initial local commit. No GitHub repository creation,
push, public release, or deployment is included.

## Scope and outcome

The commit contains the installable SillyTavern UI extension, LambdaDB proxy
client, synchronization and retrieval engine, settings/inspection UI, regression
tests, synthetic live evaluation tools, and English installation/development
records. It includes the latest-user-plus-context query-policy change that
addressed the original synthetic old-fact misses. The implementation was still
uncommitted before this review; there was no PR containing it.

Review covered the pinned host's filtered-message indices/interceptor contract,
credential lifetime, collection ownership, durable write intent, cancellation,
current-source validation, token accounting, cleanup, and evaluation evidence.
No blocking product-runtime finding was identified. This is an experimental MVP,
not a claim of general reliability or a security audit.

## Review fixes

- Isolate native Vector Storage purge from LambdaDB cleanup in the generation
  harness. A native purge failure now still attempts owned remote deletion.
  Retain the recovery record until both boundaries complete. Regression tests
  exercise native failure, remote failure, and successful recovery-record removal.
- Count every live generation-provider attempt, including non-comparison runs.
  Previously that report field stayed zero outside comparison mode; individual
  recorded generation attempts were still available in historical reports.
- Declare Node.js 20.12+ in package metadata to match the live tools' `util.parseEnv`
  dependency and existing README. Recorded checks use Node.js 24.15.0.
- Include the new cleanup module in generation source hashes and comparison
  source matching. Older reports remain readable; mixing the two harness versions
  is rejected. Document that ignored raw reports are local evidence, not clone contents.

The four shipped JavaScript runtime files are byte-identical to the completed
query-policy live evaluation. Final-review changes affect development tools,
regression tests, package metadata, and documentation.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Unit regression tests | 34 passed, 0 failed | [Unit log](../artifacts/unit-final-review.log) |
| Runtime, script, and test syntax | All passed | `npm run check` and `node --check` for every script/test |
| Pinned SillyTavern + Chromium + local API emulator | 48 checks passed; no page errors; zero remaining collections | [Fault report](../artifacts/fault-smoke-final-review.json) |
| Pinned SillyTavern + live LambdaDB + OpenAI | 9 generated answers, 45 checks passed; 9 provider calls; owned remote cleanup confirmed | [Live report](../artifacts/generation-live-model-final-review.json) |
| Credential and evidence integrity | Configured keys absent from source/docs and new reports; `.env.local` unchanged; all new live-report source hashes match | Local content/hash audit |

The live run used `gpt-4.1-mini-2025-04-14` and exercised off/on, edit,
streaming regenerate/swipe, branch, deletion, controlled retrieval failure with
full-source fallback, and disabling again. No pending cleanup record remained.
The two cleanup-failure regressions use controlled callbacks, not induced real
provider failures; the successful cleanup path was exercised against LambdaDB.

Commands executed:

```sh
npm test
npm run check
SM_ARTIFACT_TAG=final-review npm run test:faults
SM_ARTIFACT_TAG=final-review npm run test:generation:live
```

The source and staged-blob credential scans cover the configured API keys;
they do not constitute a general-purpose secret-detection or security audit.

Before changing the harness, the strict comparison summarizer revalidated the
54 historical samples and independently recounted all injected prompts using the
pinned host tokenizer. Each mode scored 18/18; SillyMemory injected memory for
16 answers and retained full source after errors for two. The maximum injection
was 800 tokens. The result is preserved in
[the final-review summary](../artifacts/comparison-summary-final-review.json).
No new 54-sample run was performed for this review. These reports describe the
unchanged product runtime with the earlier harness, not the new cleanup code.
The strict CLI intentionally rejects a rebuild against mismatching current
harness hashes; it requires the exact recorded sources. Existing summary files
and historical reports were not rewritten.

## Remaining limits

Sustained service reliability, realistic held-out conversations, ambiguous
references, long assistant-only continuation, and committed-index ANN recall
remain unverified. Managed upserts previously exceeded the unchanged 15-second
request deadline, and a separate ordinary query returned 503. Concurrent bulk
embedding load is an unconfirmed explanation. Native Vector Storage retains more
source history, so the 54-sample comparison is not an equal-budget comparison.

Renamed/deleted chats can retain old remote scopes until full owned-collection
cleanup. Cross-device concurrent editing is unsupported. External result downloads,
groups, and system tool-invocation chats are outside this prototype. License
selection and GitHub publication still require review.

## Review inventory

Links below cover every file in the local commit. Raw test reports and credentials
are excluded from Git; report links above and in the validation record work only
in the development workspace until the corresponding commands are run elsewhere.

- [.gitignore](../.gitignore)
- [README.md](../README.md)
- [index.js](../index.js)
- [manifest.json](../manifest.json)
- [package.json](../package.json)
- [package-lock.json](../package-lock.json)
- [settings.html](../settings.html)
- [style.css](../style.css)
- [src/client.js](../src/client.js)
- [src/gate.js](../src/gate.js)
- [src/memory.js](../src/memory.js)
- [scripts/browser-smoke.mjs](../scripts/browser-smoke.mjs)
- [scripts/comparison-eval.mjs](../scripts/comparison-eval.mjs)
- [scripts/comparison-fixture.mjs](../scripts/comparison-fixture.mjs)
- [scripts/comparison-summary.mjs](../scripts/comparison-summary.mjs)
- [scripts/context-retrieval.mjs](../scripts/context-retrieval.mjs)
- [scripts/fault-scenarios.mjs](../scripts/fault-scenarios.mjs)
- [scripts/generation-cleanup.mjs](../scripts/generation-cleanup.mjs)
- [scripts/generation-smoke.mjs](../scripts/generation-smoke.mjs)
- [scripts/korean-eval.mjs](../scripts/korean-eval.mjs)
- [scripts/korean-fixture.mjs](../scripts/korean-fixture.mjs)
- [scripts/korean-summary.mjs](../scripts/korean-summary.mjs)
- [scripts/live-fault-scenarios.mjs](../scripts/live-fault-scenarios.mjs)
- [scripts/live-smoke.mjs](../scripts/live-smoke.mjs)
- [scripts/retrieval-analysis.mjs](../scripts/retrieval-analysis.mjs)
- [scripts/retrieval-diagnostic.mjs](../scripts/retrieval-diagnostic.mjs)
- [scripts/retrieval-summary.mjs](../scripts/retrieval-summary.mjs)
- [tests/client.test.js](../tests/client.test.js)
- [tests/comparison.test.js](../tests/comparison.test.js)
- [tests/generation-cleanup.test.js](../tests/generation-cleanup.test.js)
- [tests/interceptor.test.js](../tests/interceptor.test.js)
- [tests/korean-fixture.test.js](../tests/korean-fixture.test.js)
- [tests/memory.test.js](../tests/memory.test.js)
- [tests/retrieval-analysis.test.js](../tests/retrieval-analysis.test.js)
- [docs/architecture.md](../docs/architecture.md)
- [docs/comparison-evaluation.md](../docs/comparison-evaluation.md)
- [docs/contracts.md](../docs/contracts.md)
- [docs/korean-evaluation.md](../docs/korean-evaluation.md)
- [docs/query-policy.md](../docs/query-policy.md)
- [docs/retrieval-diagnostic.md](../docs/retrieval-diagnostic.md)
- [docs/review.md](../docs/review.md)
- [docs/validation.md](../docs/validation.md)
