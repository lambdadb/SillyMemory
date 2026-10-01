// The pinned native synchronizer checks enabled_chats BEFORE waiting up to 1s
// for generation/sync locks. Disable, leave the old chat/stage intact through
// that wait, then drain requests and require a quiet interval before switching.
import assert from 'node:assert/strict';
export function nativeBarrier(page, { settleMs = 1500, quietMs = 250, timeoutMs = 30000 } = {}) {
    const active = new Set(); let lastActivity = 0, started = 0;
    const matches = request => new URL(request.url()).pathname.startsWith('/api/vector/');
    const begin = request => { if (matches(request)) { active.add(request); started++; lastActivity = Date.now(); } };
    const end = request => { if (active.delete(request)) lastActivity = Date.now(); };
    page.on('request', begin); page.on('requestfinished', end); page.on('requestfailed', end);
    return { async suspend() {
        const before = started, start = Date.now(), deadline = start + timeoutMs;
        await page.evaluate(async delay => {
            $('#vectors_enabled_chats').prop('checked', false).trigger('input');
            await new Promise(resolve => setTimeout(resolve, delay));
        }, settleMs);
        while (active.size || Date.now() - lastActivity < quietMs) {
            assert(Date.now() < deadline, 'Native synchronization did not settle before stage transition');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert(Date.now() < deadline, 'Native synchronization barrier timeout');
        return { disabled: true, pending: active.size, startedDuringBarrier: started - before, settleMs, elapsedMs: Date.now() - start };
    }, close() { page.off('request', begin); page.off('requestfinished', end); page.off('requestfailed', end); } };
}
