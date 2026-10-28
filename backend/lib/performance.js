const { AsyncLocalStorage } = require('node:async_hooks');
const contexts = new AsyncLocalStorage();
const enabled = () => process.env.PERFORMANCE_LOGS === 'true';
const start = () => ({ started: performance.now(), dbMs: 0, dbQueries: 0, authMs: 0, poolMs: 0 });
async function measure(field, work) {
  const context = contexts.getStore();
  if (!context) return work();
  const began = performance.now();
  if (field === 'dbMs') context.dbQueries++;
  try { return await work(); }
  finally { context[field] += performance.now() - began; }
}
function report(context, operation, status) {
  const round = value => Math.round(value * 10) / 10;
  // Only route templates/event names and durations: never IDs, SQL, payloads or tokens.
  console.log(JSON.stringify({ type: 'performance', operation, status,
    totalMs: round(performance.now() - context.started), dbMs: round(context.dbMs),
    dbQueries: context.dbQueries, authMs: round(context.authMs), poolMs: round(context.poolMs) }));
}
function httpPerformance(req, res, next) {
  if (!enabled()) return next();
  const context = start();
  res.once('finish', () => report(context, `${req.method} ${req.route?.path || 'middleware'}`, res.statusCode));
  contexts.run(context, next);
}
async function socketPerformance(event, work) {
  if (!enabled()) return work();
  const context = start();
  return contexts.run(context, async () => {
    let status = 'ok';
    try { return await work(); }
    catch (error) { status = 'error'; throw error; }
    finally { report(context, `socket:${event}`, status); }
  });
}
module.exports = { measure, httpPerformance, socketPerformance };
