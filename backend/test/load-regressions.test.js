const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { createServer } = require('../app');
const { createActionBudget } = require('../lib/actionBudget');
const { AppError } = require('../lib/security');

test('personal room actions stay within the remote query budget and keep votes idempotent', async () => {
  const engine = new PGlite();
  try {
    await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
    let queries = 0;
    const wrap = client => ({ query: (sql, args) => { queries++; return client.query(sql, args); } });
    const db = { ...wrap(engine), transaction: fn => engine.transaction(client => fn(wrap(client))) };
    const service = require('../services/rooms')(db);
    const user = identity('test-query-budget');
    const room = await service.createRoom(user, 'Budget');
    queries = 0;
    let subscribed = false;
    const joined = await service.joinRoom(room.roomId, user, async () => { subscribed = true; assert.equal(queries, 1); });
    assert.equal(queries, 2, 'authorize once, then combine membership and initial snapshot');
    assert.equal(subscribed, true);
    assert.equal(joined.room.canManage, true);
    assert.deepEqual(joined.page.doubts, []);
    queries = 0;
    const question = await service.addDoubt(room.roomId, { text: 'Question' }, user);
    assert.equal(queries, 2, 'authorization and question/member writes use two statements, excluding BEGIN/COMMIT');
    queries = 0;
    const vote = await service.vote(room.roomId, question.id, user, true);
    assert.equal(queries, 3, 'room authorization, question lock, atomic vote/count update');
    assert.equal(vote.upvotes, 1);
    assert.equal((await service.vote(room.roomId, question.id, user, true)).changed, false);
    assert.equal((await service.vote(room.roomId, question.id, user, false)).upvotes, 0);
    assert.equal((await service.vote(room.roomId, question.id, user, false)).changed, false);
    queries = 0;
    await service.markAnswered(room.roomId, question.id, user, 'A quick reply');
    assert.equal(queries, 2, 'authorize once, then atomically save reply and audit');
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM undoubt.audit_events WHERE action='question.answered' AND target=$1", [question.id])).rows[0].count, 1);
    queries = 0;
    const access = await require('../services/access')(db).me(user);
    assert.equal(queries, 1);
    assert.deepEqual(access.organisations, []);
    assert.equal(access.isPlatformAdmin, false);
  } finally { await engine.close(); }
});

let engine, db, app, server, io, rooms;
const sockets = [];
const identity = uid => ({ uid, email: `${uid}@example.invalid`, email_verified: true });
const api = uid => request(app).get('/api/me').set('Authorization', `Bearer ${uid}`);
const emit = (socket, event, ...args) => new Promise((resolve, reject) => socket.timeout(5000).emit(event, ...args,
  (error, result) => error ? reject(error) : resolve(result)));
async function connect(uid) {
  const socket = connectClient(`http://127.0.0.1:${server.address().port}`, { auth: { token: uid }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
before(async () => {
  engine = new PGlite();
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  db = { query: (sql, params) => engine.query(sql, params), transaction: fn => engine.transaction(fn), ready: async () => true };
  rooms = require('../services/rooms')(db);
  ({ app, server, io } = createServer({ db, verify: async token => {
    if (!/^test-[a-z0-9-]+$/.test(token || '')) throw new AppError(401, 'Unauthorized');
    return identity(token);
  } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise(resolve => io.close(resolve));
  if (engine) await engine.close();
});

test('160 verified users sharing one IP retain separate HTTP budgets; one abusive UID is still limited', async () => {
  const responses = await Promise.all(Array.from({ length: 160 }, (_, i) => api(`test-campus-${i}`)));
  assert.equal(responses.filter(response => response.status === 200).length, 160);
  for (let i = 0; i < 120; i++) await api('test-noisy').expect(200);
  await api('test-noisy').expect(429);
  await api('test-new-user').expect(200);
});

test('unauthenticated API calls do not query the database or leak readiness information', async () => {
  const unavailable = async () => { throw new Error('Database must not be touched'); };
  const isolated = createServer({ db: { query: unavailable, transaction: unavailable, ready: unavailable }, verify: unavailable });
  try { await request(isolated.app).get('/api/me').expect(401); }
  finally { await new Promise(resolve => isolated.io.close(resolve)); }
});

test('parallel retries save and broadcast one question; keys are scoped by room and verified author', async () => {
  const room = await rooms.createRoom(identity('test-host'), 'Retry test');
  const author = await connect('test-author');
  const peer = await connect('test-peer');
  await emit(author, 'joinRoom', room.roomId); await emit(peer, 'joinRoom', room.roomId);
  let deliveries = 0;
  peer.on('newDoubt', () => deliveries++);
  const delivered = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Question broadcast was not delivered')), 3000);
    peer.once('newDoubt', () => { clearTimeout(timer); resolve(); });
  });
  const payload = { text: 'Save once', requestId: randomUUID() };
  const replies = await Promise.all(Array.from({ length: 20 }, () => emit(author, 'newDoubt', room.roomId, payload)));
  assert.ok(replies.every(reply => reply.ok));
  assert.equal(new Set(replies.map(reply => reply.doubt.id)).size, 1);
  await delivered;
  assert.equal(deliveries, 1);
  assert.equal((await rooms.listDoubts(room.roomId, identity('test-author'))).doubts.length, 1);
  const conflict = await emit(author, 'newDoubt', room.roomId, { ...payload, text: 'Different contents' });
  assert.equal(conflict.status, 409);
  assert.equal((await emit(author, 'newDoubt', room.roomId, { ...payload, requestId: {} })).status, 400);
  assert.equal((await emit(author, 'newDoubt', room.roomId, { ...payload, requestId: 'invalid' })).status, 400);
  const otherAuthor = await emit(peer, 'newDoubt', room.roomId, payload);
  assert.notEqual(otherAuthor.doubt.id, replies[0].doubt.id);
  const otherRoom = await rooms.createRoom(identity('test-host'), 'Different room');
  assert.notEqual((await rooms.addDoubt(otherRoom.roomId, payload, identity('test-author'))).id, replies[0].doubt.id);
});

test('broadcast privacy groups keep authors and managers distinct and suppress duplicate votes', async () => {
  const room = await rooms.createRoom(identity('test-privacy-host'), 'Privacy test');
  const [host, author, peer] = await Promise.all(['test-privacy-host', 'test-privacy-author', 'test-privacy-peer'].map(connect));
  for (const socket of [host, author, peer]) await emit(socket, 'joinRoom', room.roomId);
  const received = [host, author, peer].map(socket => new Promise(resolve => socket.once('newDoubt', resolve)));
  const saved = await emit(author, 'newDoubt', room.roomId, { text: 'Private attribution', requestId: randomUUID() });
  const [hostView, authorView, peerView] = await Promise.all(received);
  assert.equal(hostView.user, 'test-privacy-author@example.invalid');
  assert.equal(authorView.isOwn, true); assert.equal(authorView.user, 'Participant');
  assert.equal(peerView.isOwn, false); assert.equal(peerView.user, 'Participant');
  let deliveries = 0;
  peer.on('upvoteDoubt', () => deliveries++);
  const delivered = new Promise(resolve => peer.once('upvoteDoubt', resolve));
  await emit(author, 'upvoteDoubt', room.roomId, saved.doubt.id);
  const retry = await emit(author, 'upvoteDoubt', room.roomId, saved.doubt.id);
  assert.equal(retry.changed, false); assert.equal(retry.upvotes, 1);
  await delivered;
  assert.equal(deliveries, 1);
});

test('socket event allowance survives reconnects and cannot be multiplied across tabs', async () => {
  const first = await connect('test-reconnect');
  for (let i = 0; i < 120; i++) assert.equal((await emit(first, 'leaveRoom', '123456')).ok, true);
  first.disconnect();
  const second = await connect('test-reconnect');
  assert.equal((await emit(second, 'leaveRoom', '123456')).status, 429);
  const independent = await connect('test-independent');
  assert.equal((await emit(independent, 'leaveRoom', '123456')).ok, true);
});

test('socket limiter expires inactive keys and bounds memory without evicting active budgets', () => {
  let time = 0;
  const consume = createActionBudget({ limit: 2, windowMs: 10, maxKeys: 2, now: () => time });
  consume('a'); consume('a'); assert.throws(() => consume('a'), { status: 429 });
  consume('b'); assert.throws(() => consume('c'), { status: 503 });
  time = 10; consume('c'); consume('a');
});

test('closing under concurrent submissions preserves every acknowledged commit and rejects later writes', async () => {
  const host = identity('test-closure-host');
  const room = await rooms.createRoom(host, 'Concurrent close');
  const submissions = Array.from({ length: 30 }, (_, i) => rooms.addDoubt(room.roomId,
    { text: `Question ${i}`, requestId: randomUUID() }, identity(`test-closure-${i}`)));
  const closing = rooms.closeRoom(room.roomId, host, io);
  const results = await Promise.allSettled(submissions);
  await closing;
  const committed = results.filter(result => result.status === 'fulfilled').length;
  assert.equal((await db.query('SELECT count(*)::int AS total FROM undoubt.questions WHERE room_id=$1', [room.roomId])).rows[0].total, committed);
  await assert.rejects(rooms.addDoubt(room.roomId, { text: 'Too late', requestId: randomUUID() }, host), { status: 410 });
  if (committed) await rooms.markAnswered(room.roomId, results.find(result => result.status === 'fulfilled').value.id, host, 'Follow-up reply');
});

test('large histories remain bounded and cursor pages do not duplicate rows when new questions arrive', async () => {
  const host = identity('test-history-host');
  const room = await rooms.createRoom(host, 'Large history');
  await db.query(`INSERT INTO undoubt.questions(id,room_id,text,user_id,user_email)
    SELECT md5($1 || n::text)::uuid,$1,'History question ' || n::text,$2,$3 FROM generate_series(1,10000) n`, [room.roomId, host.uid, host.email]);
  const first = await rooms.listDoubts(room.roomId, host);
  assert.equal(first.doubts.length, 100);
  assert.ok(first.nextCursor);
  const live = await rooms.addDoubt(room.roomId, { text: 'Arrived during pagination', requestId: randomUUID() }, host);
  const second = await rooms.listDoubts(room.roomId, host, first.nextCursor);
  assert.equal(second.doubts.length, 100);
  assert.equal(new Set([...first.doubts, ...second.doubts].map(doubt => doubt.id)).size, 200);
  assert.ok(second.doubts.every(doubt => doubt.id !== live.id));
});
