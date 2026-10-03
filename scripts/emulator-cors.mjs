// Local HTTPS test services only. Browsers must enforce the real CORS boundary.
export function emulatorCors(req, res, enabled = true) {
    if (enabled && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type,x-api-key');
        res.setHeader('Access-Control-Max-Age', '0');
    }
    if (req.method !== 'OPTIONS') return false;
    res.writeHead(204); res.end(); return true;
}
