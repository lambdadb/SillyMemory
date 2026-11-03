// LambdaDB redirects here after approval. Forward only the attempt's state and
// code (or error) to the initiating tab through that attempt's channel, then
// clear the query so the code does not stay in history. No keys pass here.
const params = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);
const state = params.get('state');
const status = document.getElementById('status');
if (state && /^[A-Za-z0-9_-]{16,128}$/.test(state)) {
    const channel = new BroadcastChannel(`sillymemory-oauth-${state}`);
    channel.postMessage({ state, code: params.get('code'), error: params.get('error') });
    channel.close();
    status.textContent = 'You can close this window and return to SillyTavern.';
    setTimeout(() => window.close(), 300);
} else {
    status.textContent = 'This page has nothing to complete. Return to SillyTavern and start Connect again.';
}
