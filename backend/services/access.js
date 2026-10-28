const { randomUUID } = require('node:crypto');
const { AppError, text } = require('../lib/security');
const { organisationId: uuid, objectFields, expiry } = require('../lib/validation');
const PAGE_SIZE = 50;
const email = value => {
  const result = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new AppError(400, 'Enter a valid email address');
  return result;
};
const cursorText = value => value === undefined ? '' : text(value, 'Cursor', 254);
const page = (rows, key) => ({ items: rows.slice(0, PAGE_SIZE), nextCursor: rows.length > PAGE_SIZE ? String(rows[PAGE_SIZE - 1][key]) : null });
module.exports = function createAccessService(db) {
  async function isPlatformAdmin(user, client = db) {
    return !!(await client.query('SELECT 1 FROM undoubt.platform_admins WHERE user_id=$1', [user.uid])).rows.length;
  }
  async function requirePlatform(user, client = db) {
    if (!await isPlatformAdmin(user, client)) throw new AppError(403, 'Platform administrator access required');
  }
  async function audit(client, user, organisationId, action, target, details = {}) {
    await client.query('INSERT INTO undoubt.audit_events(organisation_id,actor_id,action,target,details) VALUES ($1,$2,$3,$4,$5)', [organisationId, user.uid, action, target, JSON.stringify(details)]);
  }
  async function claimMemberships(user) {
    // Firebase has verified this email. Bind pending grants once to its immutable UID.
    if (!user.email_verified || !user.email) return;
    await db.query(`UPDATE undoubt.organisation_members m SET user_id=$1 WHERE email=$2 AND user_id IS NULL AND status='active' AND (expires_at IS NULL OR expires_at>now())
      AND NOT EXISTS (SELECT 1 FROM undoubt.organisation_members bound WHERE bound.organisation_id=m.organisation_id AND bound.user_id=$1)`, [user.uid, user.email.toLowerCase()]);
  }
  async function requireOrganisation(id, user, roles = [], client = db, lock = false, allowSuspended = false) {
    uuid(id);
    // Concurrent room actions share this lock; membership changes take an exclusive lock.
    const { rows } = await client.query(`SELECT * FROM undoubt.organisations WHERE id=$1${lock === 'share' ? ' FOR SHARE' : lock ? ' FOR UPDATE' : ''}`, [id]);
    const organisation = rows[0];
    if (!organisation) throw new AppError(404, 'Organisation not found');
    const platform = await isPlatformAdmin(user, client);
    const member = (await client.query("SELECT role FROM undoubt.organisation_members WHERE organisation_id=$1 AND user_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>now())", [id, user.uid])).rows[0];
    if (!platform && organisation.status === 'deleted') throw new AppError(404, 'Organisation not found');
    if (!platform && !member) throw new AppError(404, 'Organisation not found');
    if (!platform && roles.length && !roles.includes(member.role)) throw new AppError(403, 'Organisation administrator access required');
    if (!allowSuspended && organisation.status !== 'active') throw new AppError(403, 'This organisation is suspended');
    return { organisation, role: platform ? 'platform_admin' : member.role, platform };
  }
  async function me(user) {
    const { rows } = await db.query(`SELECT o.id,o.name,o.slug,o.status,m.role FROM undoubt.organisation_members m
      JOIN undoubt.organisations o ON o.id=m.organisation_id WHERE o.status<>'deleted' AND m.user_id=$1 AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now()) ORDER BY o.name LIMIT 100`, [user.uid]);
    return { isPlatformAdmin: await isPlatformAdmin(user), organisations: rows, personalRoomsAllowed: process.env.ALLOW_PERSONAL_ROOMS !== 'false' };
  }
  async function listOrganisations(user, after) {
    await requirePlatform(user);
    const { rows } = await db.query(`SELECT o.*,
      (SELECT count(*)::int FROM undoubt.organisation_members m WHERE m.organisation_id=o.id AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now())) AS members,
      (SELECT count(*)::int FROM undoubt.rooms r WHERE r.organisation_id=o.id) AS sessions
      FROM undoubt.organisations o WHERE ($1::uuid IS NULL OR o.id>$1) ORDER BY o.id LIMIT 51`, [after ? uuid(after) : null]);
    return page(rows, 'id');
  }
  async function createOrganisation(user, input) {
    objectFields(input, ['name', 'slug', 'adminEmail']);
    const name = text(input?.name, 'Organisation name', 120);
    const slug = text(input?.slug, 'Slug', 60).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) throw new AppError(400, 'Use 3–60 lowercase letters, digits or hyphens for the slug');
    const adminEmail = email(input?.adminEmail);
    return db.transaction(async client => {
      await requirePlatform(user, client);
      const id = randomUUID();
      const { rows } = await client.query('INSERT INTO undoubt.organisations(id,name,slug) VALUES ($1,$2,$3) RETURNING *', [id, name, slug]);
      await client.query("INSERT INTO undoubt.organisation_members(organisation_id,email,role) VALUES ($1,$2,'admin')", [id, adminEmail]);
      await audit(client, user, id, 'organisation.created', id, { name, slug, adminEmail });
      return rows[0];
    });
  }
  async function updateOrganisation(id, user, input) {
    objectFields(input, ['name', 'status']);
    uuid(id);
    const name = text(input?.name, 'Organisation name', 120);
    if (!['active','suspended','deleted'].includes(input?.status)) throw new AppError(400, 'Invalid organisation status');
    return db.transaction(async client => {
      await requirePlatform(user, client);
      const previous = (await client.query('SELECT name,status FROM undoubt.organisations WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!previous) throw new AppError(404, 'Organisation not found');
      const { rows } = await client.query('UPDATE undoubt.organisations SET name=$2,status=$3 WHERE id=$1 RETURNING *', [id, name, input.status]);
      if (!rows.length) throw new AppError(404, 'Organisation not found');
      await audit(client, user, id, 'organisation.updated', id, { name, status: input.status, previousName: previous.name, previousStatus: previous.status });
      return rows[0];
    });
  }
  async function overview(id, user) {
    const { organisation, role } = await requireOrganisation(id, user, ['admin'], db, false, true);
    const { rows } = await db.query(`SELECT
      (SELECT count(*)::int FROM undoubt.organisation_members WHERE organisation_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now())) AS members,
      (SELECT count(*)::int FROM undoubt.rooms WHERE organisation_id=$1) AS sessions,
      (SELECT count(*)::int FROM undoubt.rooms WHERE organisation_id=$1 AND status='active') AS live_sessions`, [id]);
    return { organisation, role, summary: rows[0] };
  }
  async function members(id, user, after) {
    await requireOrganisation(id, user, ['admin'], db, false, true);
    const { rows } = await db.query('SELECT email,role,status,expires_at,user_id IS NOT NULL AS registered,created_at FROM undoubt.organisation_members WHERE organisation_id=$1 AND email>$2 ORDER BY email LIMIT 51', [id, cursorText(after)]);
    return page(rows, 'email');
  }
  async function saveMember(id, user, input) {
    objectFields(input, ['email', 'role', 'status', 'expiresAt']);
    const address = email(input?.email);
    const expiresAt = expiry(input?.expiresAt, input?.status);
    if (expiresAt && input.role === 'admin') throw new AppError(400, 'Administrators must have permanent access');
    if (!['admin','host','member'].includes(input?.role) || !['active','removed'].includes(input?.status)) throw new AppError(400, 'Invalid membership role or status');
    return db.transaction(async client => {
      await requireOrganisation(id, user, ['admin'], client, true);
      const previous = (await client.query('SELECT * FROM undoubt.organisation_members WHERE organisation_id=$1 AND email=$2', [id, address])).rows[0];
      if (previous?.role === 'admin' && previous.status === 'active' && (input.role !== 'admin' || input.status !== 'active')) {
        const { rows } = await client.query("SELECT count(*)::int AS count FROM undoubt.organisation_members WHERE organisation_id=$1 AND role='admin' AND status='active' AND (expires_at IS NULL OR expires_at>now())", [id]);
        if (rows[0].count <= 1) throw new AppError(409, 'Add another administrator before removing the last administrator');
      }
      const saved = await client.query(`INSERT INTO undoubt.organisation_members(organisation_id,email,role,status,expires_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (organisation_id,email) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,expires_at=EXCLUDED.expires_at RETURNING user_id`, [id, address, input.role, input.status, expiresAt]);
      await audit(client, user, id, 'membership.updated', address, { role: input.role, status: input.status, expiresAt, previousRole: previous?.role || null, previousStatus: previous?.status || null, previousExpiry: previous?.expires_at || null });
      return { email: address, role: input.role, status: input.status, userId: saved.rows[0].user_id };
    });
  }
  async function sessions(id, user, after) {
    await requireOrganisation(id, user, ['admin'], db, false, true);
    const { rows } = await db.query('SELECT room_id AS "roomId",topic,status,host_email AS "hostEmail",created_at AS "createdAt" FROM undoubt.rooms WHERE organisation_id=$1 AND room_id>$2 ORDER BY room_id LIMIT 51', [id, cursorText(after)]);
    return page(rows, 'roomId');
  }
  async function allSessions(user, after) {
    await requirePlatform(user);
    const { rows } = await db.query(`SELECT r.room_id AS "roomId",r.topic,r.status,r.host_email AS "hostEmail",r.created_at AS "createdAt",
      o.name AS "organisationName",o.status AS "organisationStatus" FROM undoubt.rooms r
      LEFT JOIN undoubt.organisations o ON o.id=r.organisation_id WHERE r.room_id>$1 ORDER BY r.room_id LIMIT 51`, [cursorText(after)]);
    return page(rows, 'roomId');
  }
  async function auditLog(user, id, before) {
    if (id) await requireOrganisation(id, user, ['admin'], db, false, true); else await requirePlatform(user);
    if (before !== undefined && (typeof before !== 'string' || !/^[1-9][0-9]{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) throw new AppError(400, 'Invalid cursor');
    const { rows } = await db.query(`SELECT id::text,organisation_id,actor_id,action,target,details,created_at FROM undoubt.audit_events
      WHERE ($1::uuid IS NULL OR organisation_id=$1) AND ($2::bigint IS NULL OR id<$2) ORDER BY id DESC LIMIT 51`, [id || null, before || null]);
    return page(rows, 'id');
  }
  return { isPlatformAdmin, requirePlatform, requireOrganisation, claimMemberships, me, listOrganisations, createOrganisation, updateOrganisation, overview, members, saveMember, sessions, allSessions, auditLog, audit };
};
