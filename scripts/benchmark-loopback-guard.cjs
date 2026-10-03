// Preload in the disposable host only. Reject outbound TCP before connecting.
// Covers node-fetch/http(s) and undici; no keys or URLs are logged.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined;
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
        process.stderr.write('BENCHMARK_NETWORK_BLOCKED\n');
        throw new Error('Preflight permits loopback TCP only');
    }
    return original.apply(this, args);
};
