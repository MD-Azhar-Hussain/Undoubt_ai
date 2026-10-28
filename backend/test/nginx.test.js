// Run with NGINX_BIN=/absolute/path/to/nginx. Only isolated loopback fixtures
// and synthetic identities are used; never connects to Supabase or Firebase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { spawn, execFile } = require('node:child_process');
const http = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../app');
const { AppError } = require('../lib/security');

const event = (target, name) => new Promise((resolveEvent, reject) => {
  const timeout = setTimeout(() => { target.off(name, receive); reject(new Error(`Timed out waiting for ${name}`)); }, 5000);
  const receive = (...args) => { clearTimeout(timeout); resolveEvent(args); };
  target.once(name, receive);
});
const emit = (socket, name, ...args) => new Promise((resolveEmit, reject) => socket.timeout(5000).emit(name, ...args,
  (error, result) => error ? reject(error) : result?.ok ? resolveEmit(result) : reject(new Error(result?.message || 'Action failed'))));

test('real Nginx delivers questions, votes, replies and reconnect snapshots without refreshing',
  { skip: !process.env.NGINX_BIN, timeout: 60000 }, async t => {
  const engine = new PGlite();
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  const db = { query: (sql, params) => engine.query(sql, params), transaction: fn => engine.transaction(fn), ready: async () => true };
  const verify = async token => {
    if (!['proxy-host', 'proxy-student'].includes(token)) throw new AppError(401, 'Unauthorized');
    return { uid: token, email: `${token}@example.invalid`, email_verified: true };
  };
  const backend = createServer({ db, verify });
  backend.app.set('trust proxy', 1); // Exactly one local Nginx hop in this fixture.
  const sockets = [];
  let nginx;
  const prefix = mkdtempSync(join(tmpdir(), 'undoubt-nginx-')).replaceAll('\\', '/') + '/';
  mkdirSync(prefix + 'logs'); mkdirSync(prefix + 'html'); mkdirSync(prefix + 'temp');
  writeFileSync(prefix + 'html/index.html', '<h1>Isolated UnDoubt fixture</h1>');
  try {
    await new Promise(resolveListen => backend.server.listen(0, '127.0.0.1', resolveListen));
    const reservation = http.createServer();
    await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
    const port = reservation.address().port;
    await new Promise(resolveClose => reservation.close(resolveClose));
    const base = `http://127.0.0.1:${port}`;
    // Exercise the exact production location rules, with isolated ports/root.
    const locations = readFileSync(resolve(__dirname, '../../deploy/nginx/undoubt-locations.conf'), 'utf8');
    writeFileSync(prefix + 'nginx.conf', `daemon off; master_process off; pid logs/nginx.pid; error_log logs/error.log warn;
events { worker_connections 1024; }
http {
  client_body_temp_path temp/client_body;
  proxy_temp_path temp/proxy;
  fastcgi_temp_path temp/fastcgi;
  uwsgi_temp_path temp/uwsgi;
  scgi_temp_path temp/scgi;
  access_log off;
  map $http_upgrade $undoubt_connection_upgrade { default upgrade; '' close; }
  upstream undoubt_backend { server 127.0.0.1:${backend.server.address().port}; }
  server { listen 127.0.0.1:${port}; root "${prefix}html"; ${locations} }
}`);
    nginx = spawn(resolve(process.env.NGINX_BIN), ['-p', prefix, '-c', prefix + 'nginx.conf'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let failure, output = '';
    nginx.on('error', error => { failure = error; });
    nginx.stderr.on('data', data => { output += data; });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (failure || nginx.exitCode !== null) throw failure || new Error(`Nginx exited: ${output}`);
      try { ready = (await fetch(base + '/health/live', { signal: AbortSignal.timeout(500) })).ok; } catch { /* Wait for startup. */ }
      if (ready) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.ok(ready, `Nginx failed to become ready: ${output}`);
    assert.equal((await fetch(base + '/api/missing')).status, 401);
    const forbidden = await fetch(base + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'https://untrusted.example.invalid' } });
    assert.ok([400, 403].includes(forbidden.status));

    await t.test('deployment probe checks both transports without credentials or mutations', async () => {
      const stdout = await new Promise((resolveProbe, reject) => execFile(process.execPath,
        [resolve(__dirname, '../scripts/check-realtime.js'), base], { timeout: 30000, windowsHide: true },
        (error, output, stderr) => error ? reject(new Error(`Transport probe failed: ${output} ${stderr}`)) : resolveProbe(output)));
      assert.match(stdout, /PASS polling transport handshake/);
      assert.match(stdout, /PASS websocket transport handshake/);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM undoubt.rooms')).rows[0].count, 0);
    });

    await t.test('historical /be socket URL fails as a namespace even behind a working proxy', async () => {
      const legacy = connect(base + '/be', { autoConnect: false, auth: { token: 'proxy-host' }, transports: ['websocket'], reconnection: false });
      sockets.push(legacy);
      const failed = event(legacy, 'connect_error'); legacy.connect();
      const [error] = await failed;
      assert.match(error.message, /Invalid namespace/);
      legacy.disconnect();
    });

    for (const mode of ['polling', 'websocket', 'upgrade']) await t.test(mode, async () => {
      const response = await fetch(base + '/api/rooms', { method: 'POST', headers: { Authorization: 'Bearer proxy-host', 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: `Nginx ${mode}` }) });
      assert.equal(response.status, 201);
      const room = (await response.json()).room.roomId;
      async function client(uid) {
        const socket = connect(base, { autoConnect: false, auth: { token: uid }, transports: mode === 'upgrade' ? ['polling', 'websocket'] : [mode], reconnection: false, forceNew: true });
        sockets.push(socket);
        const connected = event(socket, 'connect');
        socket.connect(); await connected;
        if (mode === 'upgrade' && socket.io.engine.transport.name !== 'websocket') await event(socket.io.engine, 'upgrade');
        assert.equal(socket.io.engine.transport.name, mode === 'polling' ? 'polling' : 'websocket');
        await emit(socket, 'joinRoom', room);
        return socket;
      }
      const host = await client('proxy-host');
      const student = await client('proxy-student');
      const [received, saved] = await Promise.all([event(host, 'newDoubt'), emit(student, 'newDoubt', room, { text: 'Does live delivery work?' })]);
      assert.equal(received[0].id, saved.doubt.id);
      const [voted] = await Promise.all([event(host, 'upvoteDoubt'), emit(student, 'upvoteDoubt', room, saved.doubt.id)]);
      assert.equal(voted[0].upvotes, 1);
      const [answered] = await Promise.all([event(student, 'markAsAnswered'), emit(host, 'markAsAnswered', room, saved.doubt.id, 'Confirmed through Nginx')]);
      assert.equal(answered[2].answer, 'Confirmed through Nginx');
      student.disconnect();
      const missed = await emit(host, 'newDoubt', room, { text: 'Created while disconnected' });
      const reconnected = event(student, 'connect'); student.connect(); await reconnected;
      const [snapshot] = await Promise.all([event(student, 'existingDoubts'), emit(student, 'joinRoom', room)]);
      assert.ok(snapshot[0].some(doubt => doubt.id === missed.doubt.id));
      host.disconnect(); student.disconnect();
    });
  } finally {
    sockets.forEach(socket => socket.disconnect());
    if (nginx && nginx.exitCode === null) {
      const exited = new Promise(resolveExit => nginx.once('exit', resolveExit));
      nginx.kill(); await exited;
    }
    await new Promise(resolveClose => backend.io.close(resolveClose));
    await engine.close();
  }
});
