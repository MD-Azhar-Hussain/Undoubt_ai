// Isolated, finite workload. Never reads SUPABASE_DB_URL or contacts Firebase.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { io: connectClient } = require('socket.io-client');
const { createServer } = require('../app');
const { AppError } = require('../lib/security');

const levels = (process.env.BENCH_CLIENTS || '10,50,100,250').split(',').map(Number);
if (levels.some(n => !Number.isInteger(n) || n < 1 || n > 500)) throw new Error('Use 1–500 clients per level');
const identity = uid => ({ uid, email: `${uid}@example.invalid`, email_verified: true });
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] || 0;
const round = n => Math.round(n * 100) / 100;

async function main() {
  const engine = new PGlite();
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  let queries = 0, deliveries = 0;
  const counted = client => ({ query: (sql, params) => { queries++; return client.query(sql, params); } });
  const db = { ...counted(engine), transaction: fn => engine.transaction(client => fn(counted(client))),
    ready: async () => { queries++; await engine.query('SELECT 1'); return true; } };
  const { server, io } = createServer({ db, verify: async token => {
    if (!/^bench-[a-z0-9-]+$/.test(token || '')) throw new AppError(401, 'Unauthorized');
    return identity(token);
  } });
  const sockets = new Set();
  const lag = monitorEventLoopDelay({ resolution: 10 });
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 50);
  const results = { generatedAt: new Date().toISOString(), node: process.version, engine: 'PGlite (one connection, in memory)',
    limitations: 'Loopback sockets and mock verified identities. Not a Supabase capacity test, real PostgreSQL lock test, network simulation, or browser rendering test.', workloads: [] };
  try {
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const base = `http://127.0.0.1:${server.address().port}`;
    const emit = (socket, event, ...args) => new Promise(resolveEmit => socket.timeout(30000).emit(event, ...args,
      (error, response) => resolveEmit(error ? { ok: false, status: 'timeout' } : response)));
    async function connect(uid) {
      const socket = connectClient(base, { auth: { token: uid }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.add(socket);
      for (const event of ['newDoubt', 'upvoteDoubt', 'downvoteDoubt']) socket.on(event, () => { deliveries++; });
      for (const event of ['upvoteDoubt', 'downvoteDoubt']) socket.on(event, update => {
        if (!socket.benchmarkVote || update.revision >= socket.benchmarkVote.revision) socket.benchmarkVote = update;
      });
      await new Promise((resolveConnect, reject) => { socket.once('connect', resolveConnect); socket.once('connect_error', reject); });
      return socket;
    }
    async function measure(name, count, action, parallelism = count) {
      const startQueries = queries, startDeliveries = deliveries;
      const times = [], errors = {};
      lag.reset(); lag.enable();
      const start = performance.now();
      let nextIndex = 0;
      await Promise.all(Array.from({ length: parallelism }, async () => {
        while (nextIndex < count) {
        const index = nextIndex++;
        const since = performance.now();
        const result = await action(index);
        times.push(performance.now() - since);
        if (!result?.ok) errors[result?.status || 'unknown'] = (errors[result?.status || 'unknown'] || 0) + 1;
        }
      }));
      const duration = performance.now() - start;
      // Flush already queued local socket packets; not part of acknowledgement latency.
      await new Promise(resolveFlush => setTimeout(resolveFlush, 100));
      lag.disable();
      const row = { name, operations: count, failures: Object.values(errors).reduce((a, b) => a + b, 0), errors,
        durationMs: round(duration), operationsPerSecond: round(count * 1000 / duration), p50Ms: round(percentile(times, .5)),
        p95Ms: round(percentile(times, .95)), p99Ms: round(percentile(times, .99)), queries: queries - startQueries,
        deliveredEvents: deliveries - startDeliveries, eventLoopP99Ms: round(lag.percentile(99) / 1e6) };
      results.workloads.push(row); console.log(JSON.stringify(row));
    }
    await measure('shared-wifi-http', 160, async index => {
      const response = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer bench-http-${index}` } });
      await response.arrayBuffer(); return { ok: response.ok, status: response.status };
    });
    const rooms = require('../services/rooms')(db);
    for (const count of levels) {
      const host = identity(`bench-host-${count}`);
      const room = await rooms.createRoom(host, 'Isolated concurrent workload');
      const clients = [];
      await measure(`connect-join-${count}`, count, async index => {
        const socket = await connect(`bench-${count}-${index}`); clients[index] = socket;
        return emit(socket, 'joinRoom', room.roomId);
      }, Math.min(count, 25));
      await measure(`submit-${count}`, count, index => emit(clients[index], 'newDoubt', room.roomId,
        { text: `Question ${index}`, requestId: randomUUID() }));
      const q = (await db.query('SELECT id FROM undoubt.questions WHERE room_id=$1 ORDER BY sequence LIMIT 1', [room.roomId])).rows[0];
      await measure(`hot-vote-${count}`, count, index => emit(clients[index], 'upvoteDoubt', room.roomId, q.id));
      await measure(`retry-vote-${count}`, count, index => emit(clients[index], 'upvoteDoubt', room.roomId, q.id));
      if (clients.some(socket => socket.benchmarkVote?.upvotes !== count)) throw new Error(`A viewer missed the final vote state at ${count} clients`);
      const totals = (await db.query(`SELECT count(*)::int AS questions, max(upvotes) AS votes FROM undoubt.questions WHERE room_id=$1`, [room.roomId])).rows[0];
      if (totals.questions !== count || totals.votes !== count) throw new Error(`Integrity failure at ${count} clients`);
      for (const socket of clients) { socket.disconnect(); sockets.delete(socket); }
    }
    const room = await rooms.createRoom(identity('bench-retry-host'), 'Retry integrity');
    const author = await connect('bench-retry-author');
    await emit(author, 'joinRoom', room.roomId);
    const payload = { text: 'One logical question, retried twenty times', requestId: randomUUID() };
    await measure('retry-submission-20', 20, () => emit(author, 'newDoubt', room.roomId, payload));
    results.retriedSubmissionRows = (await db.query('SELECT count(*)::int AS total FROM undoubt.questions WHERE room_id=$1', [room.roomId])).rows[0].total;
    results.peakRssMiB = round(peakRss / 1024 / 1024);
    if (process.argv[2]) writeFileSync(resolve(process.argv[2]), `${JSON.stringify(results, null, 2)}\n`);
    console.log(JSON.stringify({ retriedSubmissionRows: results.retriedSubmissionRows, peakRssMiB: results.peakRssMiB }));
  } finally {
    clearInterval(sampler); lag.disable();
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolveClose => io.close(resolveClose));
    await engine.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
