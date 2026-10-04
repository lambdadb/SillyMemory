// Synthetic API responses with required SDK fields; no production normalization.
export function collectionResponse(definition = {}) {
    return { projectName: 'synthetic', collectionName: 'test', indexConfigs: { text: { type: 'text' } },
        description: '', tags: {}, numPartitions: 1, numDocs: 0, defaultBranchName: 'main',
        snapshotRetentionInDays: 1, createdAt: 0, updatedAt: 0, ...definition };
}
export function branchResponse(name, source) {
    return { name, parentBranch: source ? { name: source, branchId: `synthetic-${source}` } : null,
        headSnapshot: null, parentSnapshot: null, createdAt: 0 };
}
export function documentResponse(docs = [], collection = 'test') {
    return { docs: docs.map(doc => ({ collection, doc })), total: docs.length, took: 1, isDocsInline: true };
}
export const accepted = () => Response.json({ message: 'Accepted' }, { status: 202 });
