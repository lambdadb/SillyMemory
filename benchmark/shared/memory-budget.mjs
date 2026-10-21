import assert from 'node:assert/strict';

// One collection is active at a time. Owned deletion makes at most 17 requests
// (ownership, delete, 15 absence polls), with at most three operation attempts.
export function memoryOperationBudget(state, limit) {
    let cleanup = false;
    return {
        consume() {
            assert(state.operations < limit - (cleanup ? 0 : 51), 'Memory operation bound exceeded');
            state.operations++;
        },
        async run(job, isCleanup = false) {
            cleanup = isCleanup;
            try { return await job(); }
            finally { cleanup = false; }
        },
    };
}
