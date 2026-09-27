// Independent cleanup boundaries: a native purge failure must not strand
// remote LambdaDB collections. Keep the recovery record until both succeed.
export async function cleanupGenerationResources({ purgeNative, deleteRemote, removePending }) {
    let nativeCleanupComplete = false, cleanupComplete = false;
    try { await purgeNative(); nativeCleanupComplete = true; } catch {}
    try { await deleteRemote(); cleanupComplete = true; } catch {}
    if (nativeCleanupComplete && cleanupComplete) await removePending();
    return { nativeCleanupComplete, cleanupComplete };
}
