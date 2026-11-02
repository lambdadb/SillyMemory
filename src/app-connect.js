import { ConnectionError, connectionConfig } from './client.js';

const id = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const sleep = (ms, signal) => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
});

// Only an initiator secret in POST bodies can redeem a connection; never use host cookies.
export async function connectThroughConsole({ signal, popup, onLink, onStatus, beforeRedeem, projectId, projectName, recoveryId,
    apiOrigin = 'https://api.lambdadb.ai', consoleOrigin = 'https://app.lambdadb.ai', wait = sleep }) {
    const request = async (path, body) => {
        let response;
        try {
            response = await fetch(`${apiOrigin}/auth/apps/${path}`, { method: 'POST', credentials: 'omit', redirect: 'error',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
        } catch { signal.throwIfAborted(); throw new ConnectionError('LambdaDB connection could not be confirmed. Start Connect again to recover.'); }
        const reader = response.body?.getReader();
        if (!reader) throw new ConnectionError('Invalid LambdaDB connection response.');
        let bytes = 0; const chunks = [];
        try { for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length;
            if (bytes > 65536) throw new Error(); chunks.push(value); }
            const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
            const value = JSON.parse(new TextDecoder().decode(joined));
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
            if (!response.ok) {
                if (response.status === 429) return { slow: true };
                throw new ConnectionError(value.error === 'issuance_unconfirmed'
                    ? 'Key delivery is uncertain. Start Connect again for this project; do not create another project.'
                    : 'LambdaDB connection is unavailable or was not authorized. Retry Connect or use manual setup.');
            }
            return value;
        } catch (error) { if (error instanceof ConnectionError) throw error; throw new ConnectionError('Invalid LambdaDB connection response.'); }
        finally { await reader.cancel().catch(() => {}); }
    };
    const start = await request('start', { client_id: 'sillymemory', ...(projectId ? { project_id: projectId } : projectName ? { project_name: projectName } : {}), ...(recoveryId ? { recovery_id: recoveryId } : {}) });
    if (!/^[a-f0-9]{64}$/.test(start.device_code || '') || !/^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(start.user_code || '')
        || !Number.isInteger(start.expires_in) || start.expires_in < 1 || start.expires_in > 900
        || !Number.isInteger(start.interval) || start.interval < 1 || start.interval > 30) throw new ConnectionError('Invalid LambdaDB connection request.');
    try {
    const uri = new URL(start.verification_uri);
    if (uri.origin !== consoleOrigin || uri.pathname !== '/auth/connect' || uri.search || uri.hash || uri.username || uri.password) throw new ConnectionError('Unexpected LambdaDB approval page.');
    uri.searchParams.set('user_code', start.user_code);
    onLink(uri.href, start.user_code);
    if (popup && !popup.closed) popup.location.href = uri.href;
    onStatus('Approve this connection in LambdaDB. No chat data is uploaded by account setup.');
    const deadline = Date.now() + start.expires_in * 1000;
    let interval = start.interval * 1000;
    while (Date.now() < deadline) {
        await wait(Math.min(interval, deadline - Date.now()), signal);
        const result = await request('poll', { device_code: start.device_code });
        if (result.slow) { interval = Math.min(30000, interval + 5000); continue; }
        if (result.status === 'pending' || result.status === 'issuing') continue;
        if (result.status === 'region_requested') { onStatus('Region requested. Not connected yet. When the project is ready, start Connect again and select it.'); return null; }
        if (result.status !== 'approved') throw new ConnectionError(result.status === 'expired' ? 'Connection approval expired. Start Connect again.' : 'Connection did not complete. Start Connect again for the existing project.');
        if (!id(result.request_id) || !id(result.project_id) || !id(result.organization_id) || (projectId && result.project_id !== projectId)) throw new ConnectionError('Unexpected project connection identity.');
        // Save only recovery identity before a one-time key could be issued.
        beforeRedeem({ requestId: result.request_id, projectId: result.project_id, organizationId: result.organization_id });
        const granted = await request('redeem', { device_code: start.device_code });
        const key = granted.credentials?.api_key;
        if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key) || !id(result.project_id)
            || typeof granted.credentials?.key?.key_id !== 'string') throw new ConnectionError('Project key delivery could not be confirmed. Retry Connect for the existing project.');
        const config = connectionConfig({ endpoint: granted.endpoint, project: granted.project });
        return { ...config, projectId: result.project_id, key, keyId: granted.credentials.key.key_id };
    }
    throw new ConnectionError('Connection approval expired. Start Connect again.');
    } finally {
        if (signal.aborted) {
            await fetch(`${apiOrigin}/auth/apps/cancel`, { method: 'POST', credentials: 'omit', redirect: 'error',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_code: start.device_code }),
                signal: AbortSignal.timeout(5000) }).catch(() => {});
        }
    }
}
