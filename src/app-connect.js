import { ConnectionError, connectionConfig } from './client.js';

// LambdaDB OAuth for a browser installation: one registered public client per
// installation callback, Authorization Code with S256 PKCE in a popup, and a
// project connection that issues one project key. The account API origin is
// the only configuration; the issuer and every endpoint come from discovery.
export const CONNECTION_SCOPE = 'connection:read connection:issue';
const ATTEMPT_MS = 15 * 60_000;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** The extension's callback page, on the exact SillyTavern origin. */
export const callbackUrl = base => new URL('oauth-callback.html', base).href;
/** One BroadcastChannel per attempt, named by its unguessable state. */
export const callbackChannel = state => `sillymemory-oauth-${state}`;

async function request(url, { method = 'GET', form, token, signal, timeout = 30_000 } = {}) {
    let response;
    try {
        response = await fetch(url, {
            method, credentials: 'omit', redirect: 'error',
            headers: { Accept: 'application/json', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(form ? { body: new URLSearchParams(form).toString() } : {}),
            signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
        });
    } catch {
        signal.throwIfAborted();
        return { status: 0, value: {} };
    }
    const reader = response.body?.getReader();
    const chunks = [];
    let bytes = 0;
    try {
        if (reader) for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 65536) throw new Error();
            chunks.push(value);
        }
        const joined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
        const text = new TextDecoder().decode(joined);
        const value = text ? JSON.parse(text) : {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        return { status: response.status, value };
    } catch {
        signal.throwIfAborted();
        return { status: response.status, value: {}, unreadable: true };
    } finally { await reader?.cancel().catch(() => {}); }
}

async function post(url, body, signal) {
    let response;
    try {
        response = await fetch(url, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    } catch { signal.throwIfAborted(); return { status: 0, value: {} }; }
    try {
        const value = await response.json();
        return { status: response.status, value: value && typeof value === 'object' && !Array.isArray(value) ? value : {} };
    } catch { signal.throwIfAborted(); return { status: response.status, value: {}, unreadable: true }; }
}

function sameOrigin(value, origin) {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new Error();
    return url.href;
}

/** Discovers the issuer from RFC 9728 metadata on the account API origin. */
export async function discover(apiOrigin, signal) {
    const resource = await request(`${apiOrigin}/.well-known/oauth-protected-resource`, { signal });
    if (resource.status === 404) throw new ConnectionError('This LambdaDB server does not offer Connect yet. Use manual setup with a project key.');
    try {
        const issuer = resource.value.authorization_servers?.[0];
        if (resource.status !== 200 || new URL(resource.value.resource).origin !== apiOrigin || resource.value.authorization_servers.length !== 1) throw new Error();
        const issuerUrl = new URL(issuer);
        if (issuerUrl.protocol !== 'https:' || issuerUrl.pathname !== '/' || !issuer.endsWith('/') || issuerUrl.search || issuerUrl.hash) throw new Error();
        const metadata = await request(`${issuer}.well-known/openid-configuration`, { signal });
        const m = metadata.value;
        if (metadata.status !== 200 || m.issuer !== issuer) throw new Error();
        return {
            apiOrigin, issuer, audience: apiOrigin,
            authorization: sameOrigin(m.authorization_endpoint, issuerUrl.origin),
            token: sameOrigin(m.token_endpoint, issuerUrl.origin),
            registration: sameOrigin(m.registration_endpoint, issuerUrl.origin),
            revocation: sameOrigin(m.revocation_endpoint, issuerUrl.origin),
        };
    } catch (error) {
        signal.throwIfAborted();
        if (error instanceof ConnectionError) throw error;
        throw new ConnectionError('LambdaDB Connect is unavailable right now. Retry, or use manual setup with a project key.');
    }
}

/**
 * Registers this installation once (RFC 7591) and reuses the saved client for
 * the same issuer and callback. Registration is not per Connect click.
 */
async function client(provider, callback, clients, signal, fresh = false) {
    const saved = fresh ? undefined : clients.read();
    if (saved?.issuer === provider.issuer && saved.callback === callback && typeof saved.clientId === 'string') return saved.clientId;
    const registered = await post(provider.registration, {
        redirect_uris: [callback], client_name: 'SillyMemory', grant_types: ['authorization_code'], response_types: ['code'],
        token_endpoint_auth_method: 'none', scope: CONNECTION_SCOPE,
    }, signal);
    if (registered.status === 400) throw new ConnectionError('LambdaDB Connect needs SillyTavern on HTTPS or localhost. Use manual setup with a project key.');
    if (registered.status === 429 || registered.status === 503) throw new ConnectionError('LambdaDB Connect is busy. Retry later, or use manual setup with a project key.');
    const id = registered.value.client_id;
    if (registered.status !== 201 || typeof id !== 'string' || !/^[A-Za-z0-9._-]{8,128}$/.test(id))
        throw new ConnectionError('LambdaDB Connect could not register this installation. Retry, or use manual setup with a project key.');
    clients.write({ issuer: provider.issuer, callback, clientId: id });
    return id;
}

/** Waits for the callback page to report this attempt's code on its own channel. */
function callback(state, signal, openChannel) {
    return new Promise((resolve, reject) => {
        const channel = openChannel(callbackChannel(state));
        const settle = finish => { clearTimeout(expire); signal.removeEventListener('abort', abort); channel.close(); finish(); };
        const expire = setTimeout(() => settle(() => reject(new ConnectionError('Connection approval expired. Start Connect again.'))), ATTEMPT_MS);
        const abort = () => settle(() => reject(signal.reason));
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        channel.onmessage = ({ data }) => {
            if (data?.state !== state) return;
            settle(() => data.error || typeof data.code !== 'string'
                ? reject(new ConnectionError(data.error === 'access_denied' ? 'Connection was not approved. Nothing changed.' : 'Connection did not complete. Start Connect again.'))
                : resolve(data.code));
        };
    });
}

/**
 * Connects one project. Recovery identity is saved before authorization and
 * again with the approved project before the key is claimed, so an uncertain
 * delivery can be recovered for the same project instead of replaced.
 * Returns null when a region was requested instead of a ready project.
 */
export async function connectWithLambdaDB({ signal, popup, apiOrigin = 'https://api.lambdadb.ai', callback: callbackTo, clients,
    projectId, projectName, recoveryId, valid = () => true, onStatus = () => {}, beforeAuthorize, beforeIssue,
    openChannel = name => new BroadcastChannel(name) }) {
    const provider = await discover(apiOrigin, signal);
    let clientId = await client(provider, callbackTo, clients, signal);
    const target = { ...(projectId ? { project_id: projectId } : projectName ? { project_name: projectName } : {}), ...(recoveryId ? { recovery_id: recoveryId } : {}) };
    let created = await post(`${apiOrigin}/project-connections`, { client_id: clientId, ...target }, signal);
    if (created.status === 400 && created.value.error === 'invalid_client') {
        // The saved registration no longer exists; register this installation again.
        clientId = await client(provider, callbackTo, clients, signal, true);
        created = await post(`${apiOrigin}/project-connections`, { client_id: clientId, ...target }, signal);
    }
    const connectionId = created.value.connection_id;
    if (created.status !== 201 || !uuid(connectionId)) throw new ConnectionError('LambdaDB Connect could not start. Retry, or use manual setup with a project key.');
    beforeAuthorize({ connectionId, ...(projectId ? { projectId } : {}) });

    const verifier = random(), state = random();
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const url = new URL(provider.authorization);
    for (const [key, value] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: callbackTo, scope: CONNECTION_SCOPE,
        state, code_challenge: challenge, code_challenge_method: 'S256', audience: provider.audience, connection_id: connectionId })) url.searchParams.set(key, value);
    const code = callback(state, signal, openChannel);
    if (popup) popup.location.href = url.href;
    onStatus('Approve this connection in the LambdaDB window. No chat data is uploaded by Connect.', url.href);
    const authorizationCode = await code;
    if (!valid()) throw new ConnectionError('Connection canceled because the account changed.');

    const exchanged = await request(provider.token, { method: 'POST', signal, form: {
        grant_type: 'authorization_code', code: authorizationCode, redirect_uri: callbackTo, client_id: clientId, code_verifier: verifier } });
    const token = exchanged.value.access_token;
    if (exchanged.status !== 200 || typeof token !== 'string' || !token || String(exchanged.value.token_type).toLowerCase() !== 'bearer')
        throw new ConnectionError('Connection approval could not be completed. Start Connect again.');
    const scopes = String(exchanged.value.scope ?? CONNECTION_SCOPE).split(' ');
    try {
        const status = await request(`${apiOrigin}/project-connections/${connectionId}`, { signal, token });
        const view = status.value;
        if (status.status !== 200 || view.connection_id !== connectionId) throw new ConnectionError('Connection status could not be confirmed. Start Connect again for the same project.');
        if (view.status === 'region_requested' || !scopes.includes('connection:issue')) {
            onStatus('Region requested. Not connected yet. When the project is ready, start Connect again and select it.');
            return null;
        }
        if (view.status !== 'ready' || !uuid(view.project_id) || (projectId && view.project_id !== projectId))
            throw new ConnectionError('Connection did not complete. Start Connect again for the existing project.');
        if (!valid()) throw new ConnectionError('Connection canceled because the account changed.');
        beforeIssue({ connectionId, projectId: view.project_id });
        // The issuance claim takes an empty body; repeating it never returns the key again.
        const issued = await request(`${apiOrigin}/project-connections/${connectionId}/key`, { method: 'POST', signal, token });
        const v = issued.value;
        if (issued.status === 409 && v.error === 'issuance_unconfirmed') throw new ConnectionError('Key delivery is uncertain. Start Connect again for this project; do not create another project.');
        if (issued.status !== 201 || v.connection_id !== connectionId || v.project_id !== view.project_id || typeof v.api_key !== 'string' || !v.api_key.trim()
            || /[\r\n]/.test(v.api_key) || typeof v.key_id !== 'string')
            throw new ConnectionError('Project key delivery could not be confirmed. Start Connect again for this project.');
        const config = connectionConfig({ endpoint: v.endpoint, project: v.project_name });
        return { ...config, projectId: v.project_id, key: v.api_key, keyId: v.key_id };
    } finally {
        // The setup token has no further use; the project key is independent of it.
        await request(provider.revocation, { method: 'POST', signal: AbortSignal.timeout(5000), timeout: 5000,
            form: { token, token_type_hint: 'access_token', client_id: clientId } }).catch(() => {});
    }
}
