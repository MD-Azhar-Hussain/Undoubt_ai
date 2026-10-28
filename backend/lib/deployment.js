const cluster = require('node:cluster');

function validateDeployment(env = process.env, isWorker = cluster.isWorker) {
  // The current adapter and action budgets are process-local. Do not silently
  // start known cluster workers whose audiences would be split across processes.
  if (isWorker || (env.WEB_CONCURRENCY !== undefined && env.WEB_CONCURRENCY !== '1') ||
      (env.NODE_APP_INSTANCE !== undefined && env.NODE_APP_INSTANCE !== '0')) {
    throw new Error('UnDoubt currently requires one backend process. Use one fork/replica, not cluster mode. Multiple instances require a shared Socket.IO adapter, session affinity and shared rate limits.');
  }
  const hops = env.TRUST_PROXY_HOPS;
  if (hops !== undefined && (!/^\d+$/.test(hops) || Number(hops) > 10)) {
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10 matching the actual proxy chain.');
  }
}
module.exports = { validateDeployment };
