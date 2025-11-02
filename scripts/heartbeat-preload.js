// Heartbeat preload: reports all loaded modules periodically for any Node process
// Usage: NODE_OPTIONS="--require /home/blake/8bp-rewards/scripts/heartbeat-preload.js" node your-app.js

const http = require('http');
const https = require('https');
const { URL } = require('url');

const HEARTBEAT_URL = process.env.HEARTBEAT_URL || `${process.env.PUBLIC_URL || 'http://localhost:2600'}/api/heartbeat/beat`;
const INTERVAL_MS = Math.max(30000, parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10)); // Increased to 30 seconds
const DISABLE_HEARTBEAT = process.env.DISABLE_HEARTBEAT === 'true';
const SERVICE_HINT = process.env.SERVICE_NAME || undefined;

function postJson(urlStr, body, timeoutMs = 1500) {
	try {
		const u = new URL(urlStr);
		const lib = u.protocol === 'https:' ? https : http;
		const payload = Buffer.from(JSON.stringify(body));
		const req = lib.request({
			hostname: u.hostname,
			port: u.port || (u.protocol === 'https:' ? 443 : 80),
			path: u.pathname + (u.search || ''),
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'content-length': payload.length
			},
			timeout: timeoutMs
		}, res => {
			res.on('data', () => {});
		});
		req.on('error', () => {});
		req.write(payload);
		req.end();
	} catch (_) {}
}

function beatModule(mod) {
	const filePath = (mod && mod.filename) ? mod.filename : 'unknown';
	const moduleId = (mod && mod.id) ? mod.id : filePath;
	postJson(HEARTBEAT_URL, {
		moduleId,
		filePath,
		processId: process.pid,
		service: SERVICE_HINT
	});
}

function sendAllBeats() {
	if (DISABLE_HEARTBEAT) return;
	const cache = require.cache || {};
	for (const key of Object.keys(cache)) {
		beatModule(cache[key]);
	}
}

// initial and interval
sendAllBeats();
const timer = setInterval(sendAllBeats, INTERVAL_MS);
process.on('exit', () => clearInterval(timer));


