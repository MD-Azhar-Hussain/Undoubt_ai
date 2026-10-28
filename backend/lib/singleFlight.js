const { createHash } = require('node:crypto');

// Share only concurrent verification of the exact same token. Completed results
// are never cached: the next request still checks Firebase revocation afresh.
function singleFlight(work, maxPending = 1000) {
  const pending = new Map();
  return input => {
    if (typeof input !== 'string') return work(input);
    const key = createHash('sha256').update(input).digest('hex');
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) return work(input);
    const result = Promise.resolve().then(() => work(input)).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
}
module.exports = { singleFlight };
