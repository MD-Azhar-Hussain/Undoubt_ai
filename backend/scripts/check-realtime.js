// Deployment transport probe: no sign-in token and no room/data mutations.
// Run from a development checkout (socket.io-client is a dev dependency).
const { io } = require('socket.io-client');

async function main() {
  const base = new URL(process.argv[2] || 'http://localhost:6108');
  const origin = new URL(process.argv[3] || base.origin).origin;
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Supply the public backend origin, without credentials, a path or query string.');
  }
  let failures = 0;
  for (const path of ['/health/live', '/health/ready']) {
    try {
      const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000), redirect: 'error' });
      const body = await response.json();
      if (!response.ok || (path.endsWith('/live') ? body.status !== 'ok' : body.ready !== true)) throw new Error('Health check failed');
      console.log(`PASS ${path}`);
    } catch { failures++; console.error(`FAIL ${path}: check proxy routing, backend startup and database readiness.`); }
  }
  for (const transport of ['polling', 'websocket']) {
    const socket = io(base.origin, { autoConnect: false, transports: [transport], reconnection: false, timeout: 10000,
      extraHeaders: { Origin: origin } });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Transport timeout')), 11000);
        socket.io.once('open', () => { clearTimeout(timer); resolve(); });
        socket.io.once('error', () => { clearTimeout(timer); reject(new Error('Transport rejected')); });
        socket.connect();
      });
      console.log(`PASS ${transport} transport handshake`);
    } catch {
      failures++;
      console.error(`FAIL ${transport}: check /socket.io/ routing, exact allowed Origin, TLS and proxy upgrade settings.`);
    } finally { socket.disconnect(); socket.io.disconnect(); }
  }
  console.log('Transport checks do not prove authentication, cross-client delivery, heartbeat survival or multi-instance correctness. Complete the two-account acceptance checklist.');
  if (failures) process.exitCode = 1;
}
main().catch(() => { console.error('Use: npm run check:realtime -- https://backend.example.edu https://frontend.example.edu'); process.exitCode = 1; });
