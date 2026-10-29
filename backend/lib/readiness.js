// Health probes never authorize users. Bound their database traffic independently
// of callers; concurrent requests share a check and failures recover quickly.
function createReadinessProbe(check, { now = Date.now, successMs = 5000, failureMs = 1000 } = {}) {
  let pending, expires = 0, ready = false;
  return () => {
    if (pending) return pending;
    if (now() < expires) return Promise.resolve(ready);
    pending = Promise.resolve().then(check).then(() => true, () => false).then(result => {
      ready = result;
      expires = now() + (ready ? successMs : failureMs);
      return ready;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
module.exports = { createReadinessProbe };
