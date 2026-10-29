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
      const { publish, ...result } = await socketPerformance(event, () => fn(...args)) || {};
      ack({ ok: true, ...result });
      if (publish) await publish();
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
  // Acknowledgements confirm a committed write. Fan-out must not delay that
  // confirmation or misreport a saved action as failed if delivery breaks.
  const afterCommit = (id, publish) => async () => {
    try { await publish(); }
    catch {
      console.error('Room update delivery failed; requesting fresh snapshots');
      io.to(id).emit('syncRequired');
    }
  };
  register('joinRoom', async id => {
    for (const joined of socket.rooms) if (joined !== socket.id) await socket.leave(joined);
    try {
      const { room, page } = await service.joinRoom(id, user, async room => {
        await socket.join(id);
        if (room.organisationId) await socket.join(`org:${room.organisationId}`);
      });
      socket.emit('roomInfo', service.serializeRoom(room));
      socket.emit('existingDoubts', page.doubts, page.nextCursor);
    } catch (error) {
      for (const joined of socket.rooms) if (joined !== socket.id) await socket.leave(joined);
      throw error;
    }
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
    return { doubt: service.serializeDoubt(doubt, user, false),
      publish: doubt.created ? afterCommit(id, () => service.broadcastDoubt(io, id, doubt)) : undefined };
  });
  for (const event of ['upvoteDoubt', 'downvoteDoubt']) register(event, async (id, doubtId) => {
    requireJoined(id);
    const result = await service.vote(id, doubtId, user, event === 'upvoteDoubt');
    return { ...result, publish: result.changed ? afterCommit(id, () => broadcastVote(id, event, { doubtId, upvotes: result.upvotes, revision: result.revision })) : undefined };
  });
  register('markAsAnswered', async (id, doubtId, answer) => {
    requireJoined(id);
    const update = await service.markAnswered(id, doubtId, user, answer);
    return { update, publish: afterCommit(id, () => service.broadcastEvent(io, id, 'markAsAnswered', doubtId, true, update)) };
  });
  register('closeRoom', async id => { requireJoined(id); await service.closeRoom(id, user, io); });
};
