const { AppError, publicError } = require('../lib/security');
const { socketPerformance } = require('../lib/performance');
module.exports = (io, socket, service, consumeAction, broadcastVote) => {
  const user = socket.data.user;
  // Stop delivering room data after the authentication token expires.
  const expiryTimer = user.exp ? setTimeout(() => {
    socket.emit('sessionExpired');
    socket.disconnect(true);
  }, Math.max(0, user.exp * 1000 - Date.now())) : null;
  socket.on('disconnect', () => clearTimeout(expiryTimer));
  const register = (event, fn) => socket.on(event, async (...args) => {
    const ack = typeof args.at(-1) === 'function' ? args.pop() : () => {};
    try {
      consumeAction(user.uid);
      if (user.exp && Date.now() >= user.exp * 1000) throw new AppError(401, 'Session expired. Reconnect to continue.');
      const result = await socketPerformance(event, () => fn(...args));
      ack({ ok: true, ...result });
    } catch (error) {
      const payload = { ok: false, status: error.status || 500, ...publicError(error) };
      ack(payload);
      socket.emit('operationError', payload);
    }
  });
  const requireJoined = id => {
    if (!socket.rooms.has(id)) throw new AppError(403, 'Join this room first');
    // Every mutation checks fresh permissions inside its database transaction.
  };
  register('joinRoom', async id => {
    const room = await service.joinRoom(id, user);
    for (const joined of socket.rooms) if (joined !== socket.id) await socket.leave(joined);
    await socket.join(id);
    if (room.organisationId) await socket.join(`org:${room.organisationId}`);
    const page = await service.listDoubts(id, user);
    socket.emit('roomInfo', service.serializeRoom(room));
    socket.emit('existingDoubts', page.doubts, page.nextCursor);
  });
  register('leaveRoom', async id => { if (typeof id === 'string' && id !== socket.id) await socket.leave(id); });
  register('updateRoomTopic', async (id, topic) => {
    requireJoined(id);
    const value = await service.updateTopic(id, topic, user);
    await service.broadcastEvent(io, id, 'roomTopicUpdated', { roomId: id, topic: value });
  });
  register('newDoubt', async (id, input) => {
    requireJoined(id);
    const doubt = await service.addDoubt(id, input, user);
    if (doubt.created) await service.broadcastDoubt(io, id, doubt);
    return { doubt: service.serializeDoubt(doubt, user, false) };
  });
  for (const event of ['upvoteDoubt', 'downvoteDoubt']) register(event, async (id, doubtId) => {
    requireJoined(id);
    const result = await service.vote(id, doubtId, user, event === 'upvoteDoubt');
    if (result.changed) await broadcastVote(id, event, { doubtId, upvotes: result.upvotes, revision: result.revision });
    return result;
  });
  register('markAsAnswered', async (id, doubtId, answer) => {
    requireJoined(id);
    const update = await service.markAnswered(id, doubtId, user, answer);
    await service.broadcastEvent(io, id, 'markAsAnswered', doubtId, true, update);
    return { update };
  });
  register('closeRoom', async id => { requireJoined(id); await service.closeRoom(id, user, io); });
};
