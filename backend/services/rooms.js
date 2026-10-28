const { randomInt, randomUUID, createHash } = require('node:crypto');
const { AppError, roomCode, text } = require('../lib/security');
module.exports = function createRoomService(db, { generateCode = () => String(randomInt(100000, 1000000)) } = {}) {
  const access = require('./access')(db);
  const roomView = row => ({ roomId: row.room_id, hostId: row.host_id, topic: row.topic, status: row.status, createdAt: row.created_at, organisationId: row.organisation_id });
  const serializeRoom = room => ({ roomId: room.roomId, topic: room.topic, status: room.status, createdAt: room.createdAt, organisationId: room.organisationId, canManage: !!room.canManage });
  const serializeDoubt = (d, user, isHost) => ({ id: d.id, text: d.text, user: isHost ? d.user_email : 'Participant',
    isOwn: d.user_id === user.uid, answer: d.answer, answeredAt: d.answered_at, upvotes: d.upvotes, answered: d.answered, createdAt: d.created_at, revision: d.revision, upvotedBy: d.voted ? [user.uid] : [] });
  async function getRoom(id, user, hostOnly = false, allowClosed = false, client = db, lock = false) {
    const { rows } = await client.query(`SELECT r.*, EXISTS(SELECT 1 FROM undoubt.platform_admins WHERE user_id=$2) AS platform
      FROM undoubt.rooms r WHERE room_id = $1${lock === 'share' ? ' FOR SHARE OF r' : lock ? ' FOR UPDATE OF r' : ''}`, [roomCode(id), user.uid]);
    if (!rows[0]) throw new AppError(404, 'Room not found');
    const room = roomView(rows[0]);
    const permissions = room.organisationId
      ? await access.requireOrganisation(room.organisationId, user, [], client, lock ? 'share' : false)
      : { platform: rows[0].platform, role: 'host' };
    room.canManage = permissions.platform || permissions.role === 'admin' || (room.hostId === user.uid && permissions.role === 'host');
    if (hostOnly && !room.canManage) throw new AppError(403, 'Only this room’s host can do that');
    if (!allowClosed && room.status === 'closed') throw new AppError(410, 'This room is closed');
    return room;
  }
  async function mutate(id, user, hostOnly, work, allowClosed = false, roomLock = 'share') {
    return db.transaction(async client => {
      // Questions lock their own row. Shared room locks allow independent actions
      // concurrently, while closure/topic changes still acquire an exclusive lock.
      const room = await getRoom(id, user, hostOnly, allowClosed, client, roomLock);
      return work(client, room);
    });
  }
  async function createRoom(user, topic, organisationId) {
    const value = topic ? text(topic, 'Topic', 200) : '';
    if (!organisationId && process.env.ALLOW_PERSONAL_ROOMS === 'false') throw new AppError(403, 'Choose an organisation to create a room');
    return db.transaction(async client => {
    if (organisationId) await access.requireOrganisation(organisationId, user, ['admin','host'], client, 'share');
    for (let attempt = 0; attempt < 12; attempt++) {
      const { rows } = await client.query('INSERT INTO undoubt.rooms(room_id, host_id, host_email, topic,organisation_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (room_id) DO NOTHING RETURNING *',
        [generateCode(), user.uid, user.email, value, organisationId || null]);
      if (rows[0]) {
        await access.audit(client, user, organisationId || null, 'session.created', rows[0].room_id);
        return { ...roomView(rows[0]), canManage: true };
      }
    }
    throw new AppError(503, 'Could not allocate a room code. Please try again.');
    });
  }
  async function listRooms(user) {
    const { rows } = await db.query(`SELECT r.*, COALESCE(m.last_visited_at,r.created_at) AS visited_at,
      (SELECT count(*)::int FROM undoubt.questions q WHERE q.room_id=r.room_id AND NOT q.answered) AS unanswered
      FROM undoubt.rooms r LEFT JOIN undoubt.room_members m ON m.room_id=r.room_id AND m.user_id=$1
      WHERE (r.host_id=$1 OR m.user_id=$1) AND (r.organisation_id IS NULL OR EXISTS (SELECT 1 FROM undoubt.organisations o WHERE o.id=r.organisation_id AND o.status='active' AND (EXISTS(SELECT 1 FROM undoubt.organisation_members om WHERE om.organisation_id=o.id AND om.user_id=$1 AND om.status='active' AND (om.expires_at IS NULL OR om.expires_at>now())) OR EXISTS(SELECT 1 FROM undoubt.platform_admins pa WHERE pa.user_id=$1)))) ORDER BY visited_at DESC, r.room_id DESC LIMIT 50`, [user.uid]);
    return rows.map(row => ({ ...serializeRoom(roomView(row)), role: row.host_id === user.uid ? 'host' : 'participant', lastVisitedAt: row.visited_at, unanswered: row.unanswered }));
  }
  async function accessibleRoom(id, user, client = db, lock = false) {
    const room = await getRoom(id, user, false, true, client, lock);
    if (room.status === 'closed' && !room.canManage) {
      const { rows } = await client.query('SELECT 1 FROM undoubt.room_members WHERE room_id=$1 AND user_id=$2', [id, user.uid]);
      if (!rows.length) throw new AppError(403, 'Only participants of this session can view its archive');
    }
    return room;
  }
  async function joinRoom(id, user) {
    return db.transaction(async client => {
      const room = await accessibleRoom(id, user, client, true);
      await client.query(`INSERT INTO undoubt.room_members(room_id,user_id) VALUES ($1,$2)
        ON CONFLICT (room_id,user_id) DO UPDATE SET last_visited_at=now()`, [id, user.uid]);
      return room;
    });
  }
  async function listDoubts(id, user, before, archive = false) {
    const room = archive ? await getRoom(id, user, true, true) : await accessibleRoom(id, user);
    if (before !== undefined && (typeof before !== 'string' || !/^[1-9][0-9]{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) throw new AppError(400, 'Invalid cursor');
    const { rows } = await db.query(`SELECT q.*, EXISTS(SELECT 1 FROM undoubt.votes v WHERE v.question_id=q.id AND v.user_id=$2) AS voted
      FROM undoubt.questions q WHERE room_id=$1 AND ($3::bigint IS NULL OR sequence < $3) ORDER BY sequence DESC LIMIT 101`, [id, user.uid, before || null]);
    const page = rows.slice(0, 100);
    return { doubts: page.map(d => serializeDoubt(d, user, room.canManage)), nextCursor: rows.length > 100 ? String(page.at(-1).sequence) : null };
  }
  async function addDoubt(id, input, user) {
    const value = text(input?.text, 'Question');
    // A retry has the same key; namespace it by verified author and room to stop
    // another user from reserving that key. The existing primary key enforces
    // uniqueness atomically without a second deduplication table or migration.
    let qid = randomUUID();
    if (input.requestId !== undefined) {
      questionId(input.requestId);
      const bytes = createHash('sha256').update(JSON.stringify([id, user.uid, input.requestId.toLowerCase()])).digest();
      bytes[6] = (bytes[6] & 0x0f) | 0x80;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = bytes.subarray(0, 16).toString('hex');
      qid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return mutate(id, user, false, async client => {
      const { rows } = await client.query(`WITH membership AS (
        INSERT INTO undoubt.room_members(room_id,user_id) VALUES ($2,$4) ON CONFLICT DO NOTHING)
        INSERT INTO undoubt.questions(id, room_id, text, user_id, user_email) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO NOTHING RETURNING *`, [qid, id, value, user.uid, user.email]);
      if (rows[0]) return { ...rows[0], created: true };
      const existing = (await client.query('SELECT * FROM undoubt.questions WHERE id=$1 AND room_id=$2 AND user_id=$3', [qid, id, user.uid])).rows[0];
      if (!existing || existing.text !== value) throw new AppError(409, 'This submission was already used for a different question.');
      return { ...existing, created: false };
    });
  }
  function questionId(value) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError(400, 'Invalid question ID');
    return value;
  }
  async function vote(id, qid, user, add) {
    questionId(qid);
    return mutate(id, user, false, async client => {
      const { rows } = await client.query('SELECT * FROM undoubt.questions WHERE room_id=$1 AND id=$2 FOR UPDATE', [id, qid]);
      if (!rows[0]) throw new AppError(404, 'Question not found');
      const mutation = add
        ? 'INSERT INTO undoubt.votes(question_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING question_id'
        : 'DELETE FROM undoubt.votes WHERE question_id=$1 AND user_id=$2 RETURNING question_id';
      const changed = await client.query(`WITH changed AS (${mutation})
        UPDATE undoubt.questions SET upvotes=upvotes+$3, revision=revision+1
        WHERE id=$1 AND EXISTS(SELECT 1 FROM changed) RETURNING upvotes,revision`, [qid, user.uid, add ? 1 : -1]);
      const current = changed.rows[0] || rows[0];
      return { voted: add, upvotes: current.upvotes, revision: current.revision, changed: !!changed.rows.length };
    });
  }
  async function markAnswered(id, qid, user, answer) {
    questionId(qid);
    const value = answer === undefined ? null : text(answer, 'Reply', 5000);
    return mutate(id, user, true, async (client, room) => {
      const { rows } = await client.query(`UPDATE undoubt.questions SET answered=true, answer=COALESCE($3,answer),
        answered_at=now(), revision=revision+1 WHERE room_id=$1 AND id=$2 RETURNING *`, [id, qid, value]);
      if (!rows[0]) throw new AppError(404, 'Question not found');
      const d = rows[0];
      await access.audit(client, user, room.organisationId, 'question.answered', qid, { roomId: id, revision: d.revision });
      return { id: d.id, answer: d.answer, answeredAt: d.answered_at, answered: d.answered, revision: d.revision, upvotes: d.upvotes };
    }, true);
  }
  async function updateTopic(id, topic, user) {
    const value = topic === '' ? '' : text(topic, 'Topic', 200);
    await mutate(id, user, true, async (client, room) => {
      await client.query('UPDATE undoubt.rooms SET topic=$2 WHERE room_id=$1', [id, value]);
      await access.audit(client, user, room.organisationId, 'session.topic_updated', id);
    }, false, true);
    return value;
  }
  async function closeRoom(id, user, io) {
    await mutate(id, user, true, async (client, room) => {
      await client.query("UPDATE undoubt.rooms SET status='closed', closed_at=COALESCE(closed_at,now()) WHERE room_id=$1", [id]);
      await access.audit(client, user, room.organisationId, 'session.closed', id);
    }, true, true);
    await broadcastEvent(io, id, 'roomClosed');
  }
  async function report(id, user, before) {
    const room = await getRoom(id, user, true, true);
    const { rows } = await db.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE answered)::int AS answered, COALESCE(sum(upvotes),0)::int AS votes FROM undoubt.questions WHERE room_id=$1', [id]);
    return { room: serializeRoom(room), summary: rows[0], ...await listDoubts(id, user, before, true) };
  }
  async function audience(io, id) {
    const sockets = await io.in(id).fetchSockets();
    if (!sockets.length) return [];
    const ids = [...new Set(sockets.map(socket => socket.data.user.uid))];
    if (!ids.length) return [];
    const { rows } = await db.query(`SELECT u.user_id,
      (p.user_id IS NOT NULL OR m.role='admin' OR (r.host_id=u.user_id AND (r.organisation_id IS NULL OR m.role='host'))) AS manager
      FROM undoubt.rooms r CROSS JOIN unnest($2::text[]) AS u(user_id)
      LEFT JOIN undoubt.organisations o ON o.id=r.organisation_id
      LEFT JOIN undoubt.platform_admins p ON p.user_id=u.user_id
      LEFT JOIN undoubt.organisation_members m ON m.organisation_id=o.id AND m.user_id=u.user_id
        AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now())
      WHERE r.room_id=$1 AND (r.organisation_id IS NULL OR (o.status='active' AND (p.user_id IS NOT NULL OR m.user_id IS NOT NULL)))`, [id, ids]);
    const managers = new Map(rows.map(row => [row.user_id, !!row.manager]));
    return sockets.filter(socket => managers.has(socket.data.user.uid)).map(socket => ({ socket, manager: managers.get(socket.data.user.uid) }));
  }
  async function broadcastEvent(io, id, event, ...args) {
    return broadcastEvents(io, id, [{ event, args }]);
  }
  async function broadcastEvents(io, id, events) {
    if (!events.length) return;
    const recipients = await audience(io, id);
    if (recipients.length) {
      const target = io.to(recipients.map(({ socket }) => socket.id));
      for (const { event, args } of events) target.emit(event, ...args);
    }
  }
  async function broadcastDoubt(io, id, doubt) {
    // Encode once per privacy group, rather than once per recipient. Always
    // resolve current permissions before broadcasting; do not cache tenant roles.
    const groups = new Map();
    for (const viewer of await audience(io, id)) {
      const key = `${viewer.manager}:${viewer.socket.data.user.uid === doubt.user_id}`;
      if (!groups.has(key)) groups.set(key, { sample: viewer, ids: [] });
      groups.get(key).ids.push(viewer.socket.id);
    }
    for (const { sample, ids } of groups.values()) io.to(ids).emit('newDoubt', serializeDoubt(doubt, sample.socket.data.user, sample.manager));
  }
  return { createRoom, listRooms, getRoom, accessibleRoom, joinRoom, serializeRoom, serializeDoubt, listDoubts, addDoubt, vote, markAnswered, updateTopic, closeRoom, report, broadcastDoubt, broadcastEvent, broadcastEvents };
};
