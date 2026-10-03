// Test-only observation around the unchanged runtime. Original calls, results,
// ranking and packing are retained. Install once after the final page reload.
export async function installRetrievalObserver(page) {
    await page.evaluate(async () => {
        const { MemoryEngine, documents } = await import('/scripts/extensions/third-party/sillymemory/src/memory.js');
        const { LambdaClient } = await import('/scripts/extensions/third-party/sillymemory/src/client.js');
        const active = new WeakMap(), search = LambdaClient.prototype.search, retrieve = MemoryEngine.prototype.retrieve;
        LambdaClient.prototype.search = async function (...args) {
            const trace = active.get(this), entry = { query: args[3] };
            if (trace) trace.queries.push(entry);
            const result = await search.apply(this, args);
            if (trace) entry.hits = structuredClone(result);
            return result;
        };
        MemoryEngine.prototype.retrieve = async function (...args) {
            if (active.has(this.client)) throw new Error('Overlapping benchmark retrieval');
            const snapshot = structuredClone(args[0]), config = structuredClone(args[1]);
            const trace = { queries: [], budget: config.budget };
            globalThis.benchmarkRetrieval = null;
            active.set(this.client, trace);
            try {
                const result = await retrieve.apply(this, args);
                trace.result = structuredClone(result);
                trace.prepared = await documents(snapshot, this.owner, config);
                globalThis.benchmarkRetrieval = trace;
                return result;
            } finally { active.delete(this.client); }
        };
    });
}
