import assert from 'node:assert/strict';

export const summaryTrafficFile = 'scripts/summary-traffic.mjs';

// Record attempts even when no upstream call succeeds. Do not store request
// bodies, URLs containing credentials, or authentication headers.
export function createSummaryTrafficGuard({ embeddings, vectorQueries, stage, onViolation }) {
    let vectorRoutesInstalled = false;
    function record(rows, method, path) {
        rows.push({ stage: stage(), method, path, status: 403, blocked: true });
        onViolation('Unexpected embedding/vector traffic during Summarize evaluation');
    }
    return {
        blockBridgeRequest(req, res) {
            const pathname = new URL(req.url, 'http://localhost').pathname;
            if (!/^\/v1\/embeddings\/?$/.test(pathname)) return false;
            record(embeddings, req.method, pathname);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end('{"error":"Embedding requests forbidden in Summarize evaluation"}');
            return true;
        },
        async installVectorRoutes(page) {
            // Also block indexing, which could invoke a server-side embedding
            // provider before a query. Install before navigating to the host.
            await page.route(/\/api\/vector(?:\/|\?|$)/, async route => {
                const req = route.request();
                record(vectorQueries, req.method(), new URL(req.url()).pathname);
                await route.fulfill({ status: 403, contentType: 'application/json',
                    body: '{"error":"Vector requests forbidden in Summarize evaluation"}' });
            });
            vectorRoutesInstalled = true;
        },
        observation() {
            return { version: 1, embeddingBridge: true, nativeVectorRoutes: vectorRoutesInstalled };
        },
        assertClean() {
            assert.equal(embeddings.length + vectorQueries.length, 0,
                'Unexpected embedding/vector traffic during Summarize evaluation');
        },
    };
}

export function validateSummaryTraffic(report) {
    assert.deepEqual(report.embeddings, []);
    assert.deepEqual(report.vectorQueries, []);
    assert.deepEqual(report.nativeTrafficObservation,
        { version: 1, embeddingBridge: true, nativeVectorRoutes: true },
        'Embedding bridge and native vector routes must both be instrumented');
    assert.match(report.sourceSha256?.[summaryTrafficFile] || '', /^[a-f0-9]{64}$/,
        'Traffic guard producer hash required');
    return { verified: true, coverage: 'current-process' };
}
