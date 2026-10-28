const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { createServer } = require('../app');
const { AppError } = require('../lib/security');
let engine, db, app, server, io, access, rooms, orgA, orgB;
const sockets = [];
const identity = uid => ({ uid, email: `${uid}@example.com`, email_verified: true });
const api = (method, path, uid = 'root') => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${uid}`);
const emit = (socket, event, ...args) => new Promise((resolve, reject) => socket.timeout(3000).emit(event, ...args, (error, result) => error ? reject(error) : resolve(result)));
async function connect(uid) {
  const socket = connectClient(`http://127.0.0.1:${server.address().port}`, { auth: { token: uid }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
before(async () => {
  engine = new PGlite();
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  db = { query: (sql, args) => engine.query(sql, args), transaction: fn => engine.transaction(fn), ready: async () => true };
  access = require('../services/access')(db); rooms = require('../services/rooms')(db);
  const verify = async token => {
    if (!['root','adminA','adminB','teacher','member','outside','pending','unverified','replacement'].includes(token)) throw new AppError(401, 'Unauthorized');
    if (token === 'unverified') return { uid: token, email: 'pending@example.com', email_verified: false };
    if (token === 'replacement') return { uid: token, email: 'pending@example.com', email_verified: true };
    return identity(token);
  };
  await db.query("INSERT INTO undoubt.platform_admins(user_id,email) VALUES ('root','root@example.com')");
  ({ app, server, io } = createServer({ verify, db }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  orgA = (await api('post', '/admin/organisations').send({ name: 'Campus A', slug: 'campus-a', adminEmail: 'adminA@example.com' }).expect(201)).body;
  orgB = (await api('post', '/admin/organisations').send({ name: 'Campus B', slug: 'campus-b', adminEmail: 'adminB@example.com' }).expect(201)).body;
});
after(async () => {
  sockets.forEach(socket => socket.disconnect());
  if (io) await new Promise(resolve => io.close(resolve));
  if (engine) await engine.close();
});

test('platform and organisation permissions cannot be self-assigned or used across tenants', async () => {
  await api('post', '/admin/organisations', 'outside').send({ name: 'Forged', slug: 'forged', adminEmail: 'outside@example.com', role: 'platform_admin' }).expect(403);
  await api('get', '/admin/organisations', 'adminA').expect(403);
  await api('get', '/admin/audit', 'adminA').expect(403);
  const self = (await api('get', '/me', 'adminA').expect(200)).body;
  assert.equal(self.isPlatformAdmin, false);
  assert.equal(self.organisations[0].id, orgA.id);
  await api('get', `/organisations/${orgA.id}`, 'adminA').expect(200);
  for (const suffix of ['', '/members', '/sessions', '/audit']) await api('get', `/organisations/${orgB.id}${suffix}`, 'adminA').expect(404);
  await api('put', `/organisations/${orgB.id}/members`, 'adminA').send({ email: 'outside@example.com', role: 'admin', status: 'active' }).expect(404);
  await api('patch', `/admin/organisations/${orgA.id}`, 'adminA').send({ name: 'Changed', status: 'suspended' }).expect(403);
  await api('post', '/rooms', 'outside').send({ organisationId: orgA.id, role: 'admin' }).expect(404);
});

test('pending access binds only to a verified email and cannot be stolen by reusing that email', async () => {
  await api('put', `/organisations/${orgA.id}/members`, 'adminA').send({ email: 'PENDING@example.com', role: 'member', status: 'active' }).expect(200);
  assert.equal((await api('get', '/me', 'unverified')).body.organisations.length, 0);
  assert.equal((await api('get', '/me', 'pending')).body.organisations[0].id, orgA.id);
  assert.equal((await api('get', '/me', 'replacement')).body.organisations.length, 0);
  const record = (await db.query('SELECT user_id FROM undoubt.organisation_members WHERE organisation_id=$1 AND email=$2', [orgA.id, 'pending@example.com'])).rows[0];
  assert.equal(record.user_id, 'pending');
});

test('room permissions cover host creation, tenant isolation, archive replies and owner demotion', async () => {
  for (const [email, role] of [['teacher@example.com','host'],['member@example.com','member']]) {
    await api('put', `/organisations/${orgA.id}/members`, 'adminA').send({ email, role, status: 'active' }).expect(200);
  }
  await api('post', '/rooms', 'member').send({ organisationId: orgA.id }).expect(403);
  const room = (await api('post', '/rooms', 'teacher').send({ organisationId: orgA.id, topic: 'Tenant questions' }).expect(201)).body.room;
  assert.equal(room.canManage, true);
  for (const endpoint of ['', '/doubts', '/report', '/host/outside']) await api('get', `/rooms/${room.roomId}${endpoint}`, 'outside').expect(404);
  const stranger = await connect('outside');
  assert.equal((await emit(stranger, 'joinRoom', room.roomId)).ok, false);
  await rooms.joinRoom(room.roomId, identity('member'));
  const question = await rooms.addDoubt(room.roomId, { text: 'Explain this' }, identity('member'));
  await api('delete', `/rooms/${room.roomId}`, 'adminA').expect(200);
  await rooms.markAnswered(room.roomId, question.id, identity('adminA'), 'After-class explanation');
  const result = await api('get', `/rooms/${room.roomId}/doubts`, 'member').expect(200);
  assert.equal(result.body.doubts[0].answer, 'After-class explanation');
  assert.equal(result.body.doubts[0].user, 'Participant');
  await api('get', `/rooms/${room.roomId}/report`, 'adminA').expect(200);
  await api('get', `/rooms/${room.roomId}/report`, 'root').expect(200);
  await api('get', `/rooms/${room.roomId}/report`, 'member').expect(403);
  await api('put', `/organisations/${orgA.id}/members`, 'adminA').send({ email: 'teacher@example.com', role: 'member', status: 'active' }).expect(200);
  await assert.rejects(rooms.markAnswered(room.roomId, question.id, identity('teacher'), 'Forbidden edit'), { status: 403 });
  const otherRoom = (await api('post', '/rooms', 'adminB').send({ organisationId: orgB.id }).expect(201)).body.room;
  await api('get', `/rooms/${otherRoom.roomId}/report`, 'adminA').expect(404);
});

test('revocation ejects live sockets, removes history access and denies future room events', async () => {
  const room = (await api('post', '/rooms', 'adminA').send({ organisationId: orgA.id }).expect(201)).body.room;
  const member = await connect('member');
  const unaffected = await connect('adminA');
  assert.equal((await emit(unaffected, 'joinRoom', room.roomId)).ok, true);
  assert.equal((await emit(member, 'joinRoom', room.roomId)).ok, true);
  assert.ok((await api('get', '/rooms', 'member').expect(200)).body.rooms.some(r => r.roomId === room.roomId));
  const disconnected = new Promise(resolve => member.once('disconnect', resolve));
  await api('put', `/organisations/${orgA.id}/members`, 'adminA').send({ email: 'member@example.com', role: 'member', status: 'removed' }).expect(200);
  await disconnected;
  assert.equal(member.connected, false);
  assert.equal(unaffected.connected, true);
  assert.equal((await emit(unaffected, 'newDoubt', room.roomId, { text: 'The session continues' })).ok, true);
  await api('get', `/rooms/${room.roomId}`, 'member').expect(404);
  assert.equal((await api('get', '/rooms', 'member').expect(200)).body.rooms.some(r => r.roomId === room.roomId), false);
  const reconnected = await connect('member');
  assert.equal((await emit(reconnected, 'joinRoom', room.roomId)).ok, false);
  await assert.rejects(rooms.addDoubt(room.roomId, { text: 'Revoked' }, identity('member')), { status: 404 });
});

test('last-admin protection, suspension and recovery preserve data', async () => {
  await api('put', `/organisations/${orgA.id}/members`, 'adminA').send({ email: 'adminA@example.com', role: 'member', status: 'active' }).expect(409);
  const room = (await api('post', '/rooms', 'adminA').send({ organisationId: orgA.id }).expect(201)).body.room;
  const admin = await connect('adminA');
  await emit(admin, 'joinRoom', room.roomId);
  const disconnected = new Promise(resolve => admin.once('disconnect', resolve));
  await api('patch', `/admin/organisations/${orgA.id}`).send({ name: 'Campus A renamed', status: 'suspended' }).expect(200);
  await disconnected;
  await api('get', `/rooms/${room.roomId}`, 'adminA').expect(403);
  await api('get', `/rooms/${room.roomId}`, 'root').expect(403);
  await api('post', '/rooms', 'adminA').send({ organisationId: orgA.id }).expect(403);
  await api('get', `/organisations/${orgA.id}/sessions`, 'adminA').expect(200);
  await api('patch', `/admin/organisations/${orgA.id}`).send({ name: 'Campus A renamed', status: 'active' }).expect(200);
  await api('get', `/rooms/${room.roomId}`, 'adminA').expect(200);
});

test('management pagination is bounded and audit records retain tenant scope', async () => {
  for (let i = 0; i < 53; i++) await db.query('INSERT INTO undoubt.organisations(id,name,slug) VALUES ($1,$2,$3)', [randomUUID(), `Campus ${i}`, `test-${i}`]);
  const page1 = (await api('get', '/admin/organisations')).body;
  const page2 = (await api('get', `/admin/organisations?after=${page1.nextCursor}`)).body;
  assert.equal(page1.items.length, 50);
  assert.equal(page2.items.length, 5);
  assert.equal(new Set([...page1.items, ...page2.items].map(o => o.id)).size, 55);
  const log = (await api('get', `/organisations/${orgA.id}/audit`, 'adminA')).body.items;
  assert.ok(log.some(event => event.action === 'membership.updated'));
  assert.ok(log.some(event => event.action === 'membership.updated' && event.details.previousRole));
  assert.ok(log.some(event => event.action === 'question.answered'));
  assert.ok(log.some(event => event.action === 'session.closed'));
  assert.ok(log.every(event => event.organisation_id === orgA.id));
  await api('get', `/organisations/${orgA.id}/audit?before=9223372036854775808`, 'adminA').expect(400);
  await engine.exec(readFileSync(join(__dirname, '../db/schema.sql'), 'utf8'));
  assert.ok((await api('get', `/organisations/${orgA.id}/audit`, 'adminA')).body.items.length >= log.length);
});

test('organisation-only deployments reject personal room creation but preserve existing personal rooms', async () => {
  const room = await rooms.createRoom(identity('outside'), 'Personal');
  const previous = process.env.ALLOW_PERSONAL_ROOMS;
  try {
    process.env.ALLOW_PERSONAL_ROOMS = 'false';
    await assert.rejects(rooms.createRoom(identity('outside'), 'Blocked'), { status: 403 });
    assert.equal((await access.me(identity('outside'))).personalRoomsAllowed, false);
    assert.equal((await rooms.getRoom(room.roomId, identity('outside'))).roomId, room.roomId);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_PERSONAL_ROOMS; else process.env.ALLOW_PERSONAL_ROOMS = previous;
  }
});

test('temporary membership expires across reads, writes and broadcasts; deletion is platform-only and recoverable', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  await access.saveMember(orgA.id, identity('root'), { email: 'pending@example.com', role: 'member', status: 'active', expiresAt: future });
  const room = await rooms.createRoom(identity('root'), 'Event', orgA.id);
  await rooms.joinRoom(room.roomId, identity('pending'));
  await db.query("UPDATE undoubt.organisation_members SET expires_at=now()-interval '1 second' WHERE organisation_id=$1 AND user_id='pending'", [orgA.id]);
  await assert.rejects(rooms.getRoom(room.roomId, identity('pending')), { status: 404 });
  await assert.rejects(rooms.addDoubt(room.roomId, { text: 'Expired' }, identity('pending')), { status: 404 });
  const messages = [];
  await rooms.broadcastEvent({ in: () => ({ fetchSockets: async () => [{ data: { user: identity('pending') }, emit: (...args) => messages.push(args) }] }) }, room.roomId, 'event');
  assert.equal(messages.length, 0);
  await assert.rejects(access.saveMember(orgA.id, identity('root'), { email: 'pending@example.com', role: 'admin', status: 'active', expiresAt: future }), { status: 400 });
  await assert.rejects(access.updateOrganisation(orgA.id, identity('adminA'), { name: 'Campus', status: 'deleted' }), { status: 403 });
  await access.updateOrganisation(orgA.id, identity('root'), { name: 'Campus', status: 'deleted' });
  await assert.rejects(access.overview(orgA.id, identity('adminA')), { status: 404 });
  await assert.rejects(rooms.getRoom(room.roomId, identity('root')), { status: 403 });
  await access.updateOrganisation(orgA.id, identity('root'), { name: 'Campus', status: 'active' });
  assert.equal((await rooms.getRoom(room.roomId, identity('root'))).roomId, room.roomId);
});

test('management routes reject malformed fields, coerced dates and polluted queries', async () => {
  await api('post', '/admin/organisations').send({ name: 'Invalid', slug: 'invalid', adminEmail: 'root@example.com', user_id: 'forged' }).expect(400);
  await api('post', '/admin/organisations').send([]).expect(400);
  await api('get', '/admin/organisations?after=a&after=b').expect(400);
  await api('get', '/admin/organisations?role=admin').expect(400);
  await api('get', '/organisations/not-an-id/members').expect(400);
  for (const expiresAt of [true, 123, {}, [], '2030-02-30T00:00:00.000Z', '2030-12-01']) {
    await api('put', `/organisations/${orgA.id}/members`).send({ email: 'pending@example.com', role: 'member', status: 'active', expiresAt }).expect(400);
  }
  await request(app).get('/api/admin/organisations').set('Authorization', 'root').expect(401);
  await api('post', '/admin/organisations').set('Content-Type', 'application/json').send('{').expect(400);
  const result = await api('get', '/admin/organisations').expect(200);
  assert.equal(result.headers['cache-control'], 'no-store');
});

test('an expired member can be explicitly removed without extending access', async () => {
  await api('put', `/organisations/${orgA.id}/members`).send({ email: 'pending@example.com', role: 'member', status: 'removed', expiresAt: '2020-01-01T00:00:00.000Z' }).expect(200);
  const member = (await db.query('SELECT status,expires_at FROM undoubt.organisation_members WHERE organisation_id=$1 AND email=$2', [orgA.id, 'pending@example.com'])).rows[0];
  assert.equal(member.status, 'removed');
  assert.ok(new Date(member.expires_at) < new Date());
});
