# Default story memory

## Product decision

There are no installed users or existing user conversations to migrate. The
0.4.0 development candidate therefore has one storage contract: an owned
collection per story, with an isolated writable branch per chat path. Remove
pre-release compatibility rather than retaining two implementations. The version
is Unreleased; this change does not promote main or publish a release.

Enable memory on a normal character chat after connecting and preparing memory.
The extension saves and verifies `{ version, id, story, integrity }` in native
chat metadata before remote access. Verified native forks preserve the story and
receive a new branch identity. Independent copies start another story. A rename
preserves identity. Checkpoints remain explicitly saved and resumed; default
branch storage does not create automatic transcript checkpoints.

Removed: the versioned-mode button/confirmation and conversion handler, filename
identity fallback, per-chat `smchat_*` creation, old shared-collection settings and
cleanup paths, conditional branch reconciliation, and the historical upgrade
adapter. Unsupported metadata fails safely; no conversion/reset is performed.
Only `smstory_*` memory families are discovered by all-owned cleanup. The separate
`smtest_*` transport test still uses its own explicit cleanup record.

Retained: complete metadata persistence, ownership checks, copy/fork isolation,
ordered commit confirmation, current-source validation, branch-specific journals,
uncertain-write recovery and direct browser CORS. The current candidate uses
[saved browser connections](saved-connection.md); session-only key observations
below retain their historical verification scope. Generic
LambdaDB client calls can still address `main` for transport tests and empty fork
sources; this is not a second product storage mode. Checkpoints still validate
both transcripts and remote state before resume.


## Historical evidence

[Original validation and intermediate trials](https://github.com/lambdadb/SillyMemory/blob/e858fbaff040e60ee0de2ed9264cdd10bc37d722/docs/default-story-memory.md) retain their producing settings, results and limitations. See [evidence recovery](evidence-retention.md). Current checks are listed in [development](development.md).
