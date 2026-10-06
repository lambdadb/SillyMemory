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

// Deterministic transport metadata only; this does not evaluate relevance.
export function rerankedResponse(docs = [], collection = 'test') {
    return { ...documentResponse(docs, collection), docs: docs.map(doc => ({ collection, doc, score: 0.8, retrievalScore: 0.7 })),
        rerank: { status: docs.length ? 'applied' : 'skipped', provider: 'typesafe', model: 'jev-1.13.0',
            candidateCount: docs.length, scoredCount: docs.length, took: 1,
            ...(docs.length ? { criteriaVersion: 'default-relevance-v1' } : { reason: 'noCandidates' }) } };
}
