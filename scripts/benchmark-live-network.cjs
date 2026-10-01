// Disposable host: generation/embedding bridge is loopback; only the configured
// LambdaDB origin may be reached remotely, by the built-in CORS proxy.
const net = require('node:net');
const original = net.Socket.prototype.connect;
const allowed = ['127.0.0.1', '::1', 'localhost', process.env.BENCHMARK_LAMBDA_HOST].filter(Boolean);
net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined;
    if (!allowed.includes(host)) { process.stderr.write('BENCHMARK_NETWORK_BLOCKED\n'); throw new Error('Benchmark network allowlist'); }
    return original.apply(this, args);
};
