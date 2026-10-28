const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { io: client } = require('socket.io-client');
const { createServer } = require('../app');
const { AppError } = require('../lib/security');
let engine, db, app, server, io, base;
const sockets = [];
const verify = async token => {
  if (!['host', 'student', 'other'].includes(token)) throw new AppError(401, 'Unauthorized');
  return { uid: token, email: `${token}@example.com`, email_verified: true };
};
before(async () => {
  engine = new PGlite();
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  db = { query: (sql, args) => engine.query(sql, args), transaction: fn => engine.transaction(fn), ready: async () => true };
  ({ app, server, io } = createServer({ verify, db }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  sockets.forEach(socket => socket.disconnect());
  if (io) await new Promise(resolve => io.close(resolve));
  if (engine) await engine.close();
});
const api = (method, url, user = 'host') => request(app)[method](url).set('Authorization', `Bearer ${user}`);
const emit = (socket, event, ...args) => new Promise((resolve, reject) => socket.timeout(3000).emit(event, ...args, (error, result) => error ? reject(error) : resolve(result)));
async function connect(user) {
  const socket = client(base, { auth: { token: user }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
test('HTTP rejects missing credentials and derives room ownership from verified identity', async () => {
  await request(app).post('/api/rooms').send({ hostId: 'host' }).expect(401);
  const result = await api('post', '/api/rooms').send({ hostId: 'other', roomId: '12345', topic: 'Physics' }).expect(201);
  const id = result.body.room.roomId;
  assert.match(id, /^[1-9][0-9]{5}$/);
  assert.notEqual(id, '12345');
  assert.equal(result.body.room.hostEmail, undefined);
  await api('delete', `/api/rooms/${id}`, 'student').expect(403);
  const own = await api('get', `/api/rooms/${id}/host/other`).expect(200);
  assert.equal(own.body.isHost, true);
  await api('get', '/api/doubts').expect(404);
});
test('socket permissions, sanitized questions, atomic votes, privacy, closure and pagination', async () => {
  const a = (await api('post', '/api/rooms').send({ topic: 'A' }).expect(201)).body.room.roomId;
  const b = (await api('post', '/api/rooms', 'other').send({ topic: 'B' }).expect(201)).body.room.roomId;
  const host = await connect('host');
  const student = await connect('student');
  assert.equal((await emit(host, 'joinRoom', a, 'host', 'other')).ok, true);
  assert.equal((await emit(student, 'joinRoom', a, 'host', 'host')).ok, true);
  assert.equal((await emit(student, 'closeRoom', a)).ok, false);
  assert.equal((await emit(host, 'closeRoom', b)).ok, false);
  await emit(host, 'joinRoom', b);
  assert.equal((await emit(host, 'closeRoom', b)).ok, false);
  assert.equal((await emit(host, 'newDoubt', a, { text: 'Wrong room' })).ok, false);
  await emit(host, 'joinRoom', a);
  assert.equal((await emit(student, 'newDoubt', a, { text: '  What is force?  ', user: 'spoof@example.com', upvotes: 999, answered: true })).ok, true);
  const question = (await db.query('SELECT * FROM undoubt.questions WHERE room_id=$1', [a])).rows[0];
  assert.equal(question.user_email, 'student@example.com');
  assert.equal(question.upvotes, 0);
  assert.equal(question.answered, false);
  assert.equal((await emit(student, 'newDoubt', a, { text: { $ne: null } })).ok, false);
  await Promise.all(Array.from({ length: 20 }, () => emit(student, 'upvoteDoubt', a, question.id, 'forged-user')));
  assert.equal(((await db.query('SELECT * FROM undoubt.questions WHERE id=$1', [question.id])).rows[0]).upvotes, 1);
  await Promise.all(Array.from({ length: 20 }, () => emit(student, 'downvoteDoubt', a, question.id)));
  assert.equal(((await db.query('SELECT * FROM undoubt.questions WHERE id=$1', [question.id])).rows[0]).upvotes, 0);
  assert.equal((await emit(student, 'markAsAnswered', a, question.id)).ok, false);
  await emit(host, 'markAsAnswered', a, question.id);
  await emit(host, 'markAsAnswered', a, question.id);
  assert.equal(((await db.query('SELECT * FROM undoubt.questions WHERE id=$1', [question.id])).rows[0]).answered, true);
  const page = await api('get', `/api/rooms/${a}/doubts`, 'student').expect(200);
  assert.equal(page.body.doubts[0].user, 'Participant');
  assert.equal(page.body.doubts[0].userId, undefined);
  for (let i=0; i<105; i++) await db.query('INSERT INTO undoubt.questions(id,room_id,text,user_id,user_email) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), a, `Q${i}`, 'student', 'student@example.com']);
  const first = (await api('get', `/api/rooms/${a}/doubts`).expect(200)).body;
  assert.equal(first.doubts.length, 100);
  const second = (await api('get', `/api/rooms/${a}/doubts?before=${first.nextCursor}`).expect(200)).body;
  assert.equal(second.doubts.length, 6);
  assert.equal(new Set([...first.doubts, ...second.doubts].map(d => d.id)).size, 106);
  const closed = new Promise(resolve => student.once('roomClosed', resolve));
  await api('delete', `/api/rooms/${a}`).expect(200);
  await closed;
  assert.equal((await db.query('SELECT count(*)::int AS count FROM undoubt.questions WHERE room_id=$1', [a])).rows[0].count, 106);
  await api('get', `/api/rooms/${a}/report`, 'student').expect(403);
  const report = (await api('get', `/api/rooms/${a}/report`).expect(200)).body;
  assert.equal(report.summary.total, 106);
  assert.equal(report.summary.answered, 1);
  assert.equal(report.summary.votes, 0);
  assert.equal(report.doubts.length, 100);
  await api('get', `/api/rooms/${a}`).expect(200);
  assert.equal((await emit(student, 'joinRoom', a)).ok, true);
  assert.equal((await emit(student, 'newDoubt', a, { text: 'After closure' })).ok, false);
});
test('socket handshake refuses unauthenticated clients', async () => {
  const socket = client(base, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const error = await new Promise(resolve => socket.once('connect_error', resolve));
  assert.equal(error.message, 'Unauthorized');
});

test('PostgreSQL constraints, transaction rollback and private schema protection', async () => {
  const service = require('../services/rooms')(db);
  const host = await verify('host');
  const room = await service.createRoom(host, 'Database checks');
  const question = await service.addDoubt(room.roomId, { text: 'Transaction test' }, host);
  await Promise.all([
    service.vote(room.roomId, question.id, host, true),
    service.vote(room.roomId, question.id, await verify('student'), true),
  ]);
  assert.equal((await db.query('SELECT upvotes FROM undoubt.questions WHERE id=$1', [question.id])).rows[0].upvotes, 2);
  await assert.rejects(db.transaction(async client => {
    await client.query('UPDATE undoubt.questions SET upvotes=99 WHERE id=$1', [question.id]);
    throw new Error('rollback');
  }));
  assert.equal((await db.query('SELECT upvotes FROM undoubt.questions WHERE id=$1', [question.id])).rows[0].upvotes, 2);
  await assert.rejects(db.query('INSERT INTO undoubt.votes(question_id,user_id) VALUES ($1,$2)', [question.id, 'host']), { code: '23505' });
  await assert.rejects(db.query('UPDATE undoubt.questions SET upvotes=-1 WHERE id=$1', [question.id]), { code: '23514' });
  await engine.exec('CREATE ROLE test_browser');
  await assert.rejects(db.transaction(async client => {
    await client.query('SET LOCAL ROLE test_browser');
    await client.query('SELECT * FROM undoubt.questions');
  }), { code: '42501' });
  await service.closeRoom(room.roomId, host, io);
  await assert.rejects(service.addDoubt(room.roomId, { text: 'Too late' }, host), { status: 410 });
  await assert.rejects(service.vote(room.roomId, question.id, host, false), { status: 410 });
  await assert.rejects(service.listDoubts(room.roomId, host, '9223372036854775808', true), { status: 400 });
});

test('room code collisions are retried without overwriting existing rooms', async () => {
  const createService = require('../services/rooms');
  const host = await verify('host');
  const original = await createService(db).createRoom(host, 'Keep this room');
  const free = (await db.query("SELECT n::text AS code FROM generate_series(100000,999999) n WHERE NOT EXISTS (SELECT 1 FROM undoubt.rooms WHERE room_id=n::text) LIMIT 1")).rows[0].code;
  const codes = [original.roomId, free];
  const room = await createService(db, { generateCode: () => codes.shift() }).createRoom(host, 'New room');
  assert.equal(room.roomId, free);
  assert.match(room.roomId, /^[1-9][0-9]{5}$/);
  assert.equal((await createService(db).getRoom(original.roomId, host)).topic, 'Keep this room');
  await assert.rejects(createService(db, { generateCode: () => original.roomId }).createRoom(host, 'Never overwrite'), { status: 503 });
});

test('joined history, private closed archives and host replies survive closure', async () => {
  const id = (await api('post', '/api/rooms').send({ topic: 'Follow-up session' }).expect(201)).body.room.roomId;
  const host = await connect('host');
  const student = await connect('student');
  const outsider = await connect('other');
  await emit(host, 'joinRoom', id);
  await emit(student, 'joinRoom', id);
  await emit(student, 'joinRoom', id);
  const history = (await api('get', '/api/rooms', 'student').expect(200)).body.rooms;
  assert.equal(history.filter(r => r.roomId === id).length, 1);
  assert.equal(history.find(r => r.roomId === id).role, 'participant');
  assert.equal((await api('get', '/api/rooms').expect(200)).body.rooms.find(r => r.roomId === id).role, 'host');
  assert.equal((await api('get', '/api/rooms', 'other').expect(200)).body.rooms.some(r => r.roomId === id), false);
  await emit(student, 'newDoubt', id, { text: 'Explain this after class?' });
  const q = (await api('get', `/api/rooms/${id}/doubts`, 'student').expect(200)).body.doubts[0];
  await api('delete', `/api/rooms/${id}`).expect(200);
  assert.equal((await emit(student, 'upvoteDoubt', id, q.id)).status, 410);
  assert.equal((await emit(student, 'newDoubt', id, { text: 'Late question' })).status, 410);
  assert.equal((await emit(student, 'markAsAnswered', id, q.id, 'Forged reply')).status, 403);
  assert.equal((await emit(outsider, 'joinRoom', id)).status, 403);
  await api('get', `/api/rooms/${id}/doubts`, 'other').expect(403);
  await api('get', `/api/rooms/${id}`, 'other').expect(403);
  await api('get', `/api/rooms/${id}/host/host`).expect(200);
  assert.equal((await emit(host, 'markAsAnswered', id, q.id, '   ')).status, 400);
  assert.equal((await emit(host, 'markAsAnswered', id, q.id, 'a'.repeat(5001))).status, 400);
  const delivered = new Promise(resolve => student.once('markAsAnswered', (...args) => resolve(args)));
  assert.equal((await emit(host, 'markAsAnswered', id, q.id, 'Here is the explanation.')).ok, true);
  const event = await delivered;
  assert.equal(event[2].answer, 'Here is the explanation.');
  assert.equal(event[2].user_email, undefined);
  await emit(host, 'markAsAnswered', id, q.id, 'Improved explanation.');
  await emit(student, 'joinRoom', id);
  const saved = (await api('get', `/api/rooms/${id}/doubts`, 'student').expect(200)).body.doubts[0];
  assert.equal(saved.answer, 'Improved explanation.');
  assert.equal(saved.answered, true);
  assert.ok(saved.answeredAt);
  assert.equal(saved.user, 'Participant');
  assert.equal((await api('get', '/api/rooms', 'student').expect(200)).body.rooms.find(r => r.roomId === id).unanswered, 0);
});

test('schema upgrade is repeatable, preserves replies and recovers historical authors', async () => {
  const service = require('../services/rooms')(db);
  const room = await service.createRoom(await verify('host'), 'Migration preservation');
  const id = randomUUID();
  await db.query('INSERT INTO undoubt.questions(id,room_id,text,user_id,user_email) VALUES ($1,$2,$3,$4,$5)', [id, room.roomId, 'Historical question', 'student', 'student@example.com']);
  await service.markAnswered(room.roomId, id, await verify('host'), 'Preserve this reply');
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  assert.equal((await service.listRooms(await verify('student'))).filter(r => r.roomId === room.roomId).length, 1);
  assert.equal((await service.listDoubts(room.roomId, await verify('student'))).doubts[0].answer, 'Preserve this reply');
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='undoubt.room_members'::regclass")).rows[0].relrowsecurity, true);
  await assert.rejects(db.transaction(async client => {
    await client.query('SET LOCAL ROLE test_browser');
    await client.query('SELECT * FROM undoubt.room_members');
  }), { code: '42501' });
});
