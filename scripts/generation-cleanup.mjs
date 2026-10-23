// Retain ownership records until every remote deletion has been verified.
export async function cleanupGenerationResources({ deleteRemote, removePending }) {
    try { await deleteRemote(); } catch { return { cleanupComplete: false }; }
    await removePending();
    return { cleanupComplete: true };
}
