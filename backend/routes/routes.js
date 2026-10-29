const express = require('express');
const { asyncRoute } = require('../lib/security');
module.exports = function routes(io, service) {
  const router = express.Router();
  router.post('/rooms', asyncRoute(async (req, res) => {
    const room = await service.createRoom(req.user, req.body?.topic, req.body?.organisationId);
    res.status(201).json({ room: service.serializeRoom(room) });
  }));
  router.get('/rooms', asyncRoute(async (req, res) => {
    res.json({ rooms: await service.listRooms(req.user) });
  }));
  router.get('/rooms/:roomId/doubts', asyncRoute(async (req, res) => res.json(await service.listDoubts(req.params.roomId, req.user, req.query.before))));
  router.get('/rooms/:roomId/report', asyncRoute(async (req, res) => {
    res.json(await service.report(req.params.roomId, req.user, req.query.before));
  }));
  router.get('/rooms/:roomId/host/:userId', asyncRoute(async (req, res) => {
    const room = await service.accessibleRoom(req.params.roomId, req.user);
    res.json({ isHost: room.canManage, room: service.serializeRoom(room) });
  }));
  router.get('/rooms/:roomId', asyncRoute(async (req, res) => {
    const room = await service.accessibleRoom(req.params.roomId, req.user);
    res.json({ exists: true, room: service.serializeRoom(room) });
  }));
  router.delete('/rooms/:roomId', asyncRoute(async (req, res) => {
    await service.closeRoom(req.params.roomId, req.user, io);
    res.json({ message: 'Room closed; questions retained' });
  }));
  return router;
};
