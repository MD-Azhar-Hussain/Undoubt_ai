const express = require('express');
const { asyncRoute } = require('../lib/security');
const { queryFields, organisationId } = require('../lib/validation');
const { rateLimit } = require('express-rate-limit');
module.exports = (io, access) => {
  const router = express.Router();
  const invalidate = id => io.in(`org:${id}`).disconnectSockets(true);
  // Route-level gates precede input processing; services also authorize transactions.
  router.use('/admin', asyncRoute(async (req, res, next) => {
    await access.requirePlatform(req.user);
    next();
  }));
  router.use('/organisations/:id', asyncRoute(async (req, res, next) => {
    organisationId(req.params.id);
    await access.requireOrganisation(req.params.id, req.user, ['admin'], undefined, false, true);
    next();
  }));
  const mutationLimit = rateLimit({ windowMs: 60000, limit: 40, keyGenerator: req => req.user.uid,
    standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many management changes. Please wait a minute.' } });
  router.use((req, res, next) => {
    if (!/^\/(admin|organisations|me)(\/|$)/.test(req.path)) return next();
    res.set('Cache-Control', 'no-store');
    try { queryFields(req.query, req.method === 'GET' ? (req.path.endsWith('/audit') ? ['before'] : ['after']) : []); }
    catch (error) { return next(error); }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return mutationLimit(req, res, next);
    next();
  });
  router.get('/me', asyncRoute(async (req,res) => res.json(await access.me(req.user))));
  router.get('/admin/organisations', asyncRoute(async (req,res) => res.json(await access.listOrganisations(req.user, req.query.after))));
  router.post('/admin/organisations', asyncRoute(async (req,res) => res.status(201).json(await access.createOrganisation(req.user, req.body))));
  router.patch('/admin/organisations/:id', asyncRoute(async (req,res) => {
    const result = await access.updateOrganisation(req.params.id, req.user, req.body);
    invalidate(req.params.id);
    res.json(result);
  }));
  router.get('/admin/audit', asyncRoute(async (req,res) => res.json(await access.auditLog(req.user, null, req.query.before))));
  router.get('/admin/sessions', asyncRoute(async (req,res) => res.json(await access.allSessions(req.user, req.query.after))));
  router.get('/organisations/:id', asyncRoute(async (req,res) => res.json(await access.overview(req.params.id, req.user))));
  router.get('/organisations/:id/members', asyncRoute(async (req,res) => res.json(await access.members(req.params.id, req.user, req.query.after))));
  router.put('/organisations/:id/members', asyncRoute(async (req,res) => {
    const { userId, ...result } = await access.saveMember(req.params.id, req.user, req.body);
    // A membership edit must not interrupt everyone else's live session.
    if (userId) {
      const sockets = await io.in(`org:${req.params.id}`).fetchSockets();
      for (const socket of sockets) if (socket.data.user.uid === userId) socket.disconnect(true);
    }
    res.json(result);
  }));
  router.get('/organisations/:id/sessions', asyncRoute(async (req,res) => res.json(await access.sessions(req.params.id, req.user, req.query.after))));
  router.get('/organisations/:id/audit', asyncRoute(async (req,res) => res.json(await access.auditLog(req.user, req.params.id, req.query.before))));
  return router;
};
