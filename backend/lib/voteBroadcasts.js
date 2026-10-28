// Collapse a burst of committed counter revisions into its newest state.
// Callers still wait for the broadcast before receiving their acknowledgement.
function createVoteBroadcasts(broadcast, { delayMs = 25 } = {}) {
  const pending = new Map();
  let timer;
  const flush = () => {
    timer = undefined;
    const batch = [...pending.values()];
    pending.clear();
    const rooms = new Map();
    for (const entry of batch) {
      if (!rooms.has(entry.roomId)) rooms.set(entry.roomId, []);
      rooms.get(entry.roomId).push(entry);
    }
    for (const [roomId, entries] of rooms) {
      // One fresh audience lookup per room/flush, even when many different
      // questions receive votes. Never retain permissions between batches.
      Promise.resolve().then(() => broadcast(roomId, entries.map(({ event, payload }) => ({ event, args: [payload] }))))
        .then(() => entries.forEach(entry => entry.waiters.forEach(waiter => waiter.resolve())),
          error => entries.forEach(entry => entry.waiters.forEach(waiter => waiter.reject(error))));
    }
  };
  return (roomId, event, payload) => new Promise((resolve, reject) => {
    const key = `${roomId}:${payload.doubtId}`;
    let entry = pending.get(key);
    if (!entry) {
      entry = { roomId, event, payload, waiters: [] };
      pending.set(key, entry);
    } else if (payload.revision > entry.payload.revision) {
      entry.event = event; entry.payload = payload;
    }
    entry.waiters.push({ resolve, reject });
    if (!timer) timer = setTimeout(flush, delayMs);
  });
}
module.exports = { createVoteBroadcasts };
