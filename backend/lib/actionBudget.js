// Process-local abuse control shared across connections for a verified identity.
// A distributed deployment must replace this with a shared atomic store.
const { AppError } = require('./security');
function createActionBudget({ limit = 120, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const entries = new Map();
  let nextSweep = 0;
  return uid => {
    const time = now();
    if (time >= nextSweep) {
      for (const [key, entry] of entries) if (entry.until <= time) entries.delete(key);
      nextSweep = time + windowMs;
    }
    let entry = entries.get(uid);
    if (!entry || entry.until <= time) {
      if (!entry && entries.size >= maxKeys) throw new AppError(503, 'The service is busy. Please try again shortly.');
      entry = { count: 0, until: time + windowMs };
      entries.set(uid, entry);
    }
    if (++entry.count > limit) throw new AppError(429, 'Too many actions. Please wait a moment.');
  };
}
module.exports = { createActionBudget };
