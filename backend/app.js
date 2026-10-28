require('dotenv').config();
const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { createDatabase } = require('./db/postgres');
const { verifyToken, originAllowed, asyncRoute, publicError, AppError } = require('./lib/security');
const { createActionBudget } = require('./lib/actionBudget');
const { createVoteBroadcasts } = require('./lib/voteBroadcasts');
const { validateDeployment } = require('./lib/deployment');
const { railwayRateKey } = require('./lib/networkRateKey');
const { measure, httpPerformance, socketPerformance } = require('./lib/performance');
function createServer({ verify = verifyToken, db = createDatabase() } = {}) {
  const access = require('./services/access')(db);
  const service = require('./services/rooms')(db);
  const consumeSocketAction = createActionBudget();
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  const server = http.createServer(app);
  const corsOptions = { maxAge: 600, origin: (origin, cb) => cb(originAllowed(origin) ? null : new AppError(403, 'Origin not allowed'), true) };
  const io = new Server(server, { cors: corsOptions, maxHttpBufferSize: 16384,
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin)) });
  const broadcastVote = createVoteBroadcasts((id, events) => service.broadcastEvents(io, id, events));
  app.use(httpPerformance, helmet(), cors(corsOptions), express.json({ limit: '16kb' }));
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    try { await db.ready(); res.json({ ready: true }); }
    catch { res.status(503).json({ ready: false }); }
  });
  // Broad network guard plus a separate verified-user budget: campus Wi-Fi users
  // must not consume one another's normal allowance.
  const rateOptions = { windowMs: 60000, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { message: 'Too many requests. Please wait a moment.' } };
  const networkKey = railwayRateKey();
  app.use('/api', rateLimit({ ...rateOptions, limit: 3000, ...(networkKey ? { keyGenerator: networkKey } : {}) }));
  app.use('/api', asyncRoute(async (req, res, next) => {
    const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!bearer) throw new AppError(401, 'Sign in to continue');
    req.user = await measure('authMs', () => verify(bearer[1]));
    res.set('Cache-Control', 'no-store');
    next();
  }), rateLimit({ ...rateOptions, limit: 120, keyGenerator: req => req.user.uid }), asyncRoute(async (req, res, next) => {
    await access.claimMemberships(req.user);
    next();
  }), require('./routes/management')(io, access), require('./routes/routes')(io, service));
  app.use((req, res) => res.status(404).json({ message: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === '23505') error = new AppError(409, 'That record already exists. Please try again.');
    if (error.type === 'entity.parse.failed') error = new AppError(400, 'Request body must be valid JSON');
    if (error.type === 'entity.too.large') error = new AppError(413, 'Request body is too large');
    res.status(error.status || 500).json(publicError(error));
  });
  io.use(async (socket, next) => {
    try {
      await socketPerformance('authenticate', async () => {
        socket.data.user = await measure('authMs', () => verify(socket.handshake.auth?.token));
        await access.claimMemberships(socket.data.user);
      });
      next();
    }
    catch (error) { next(new Error(publicError(error).message)); }
  });
  io.on('connection', socket => require('./controllers/socketController')(io, socket, service, consumeSocketAction, broadcastVote));
  return { app, server, io };
}
async function start() {
  validateDeployment();
  const configured = process.env.SUPABASE_DB_URL && process.env.FIREBASE_PROJECT_ID;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('SUPABASE_DB_URL and FIREBASE_PROJECT_ID are required');
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) throw new Error('ALLOWED_ORIGINS is required in production');
  const unavailable = async () => { throw new AppError(503, 'Complete the Supabase and Firebase setup first'); };
  const db = configured ? createDatabase() : { ready: unavailable, query: unavailable, transaction: unavailable, close: async () => {} };
  if (configured) {
    try { await db.ready(); } catch { await db.close(); throw new Error('Supabase connection/schema check failed. Check settings and run npm run db:migrate.'); }
  } else console.log('Development setup mode: waiting for SUPABASE_DB_URL and FIREBASE_PROJECT_ID. Data routes return 503.');
  const { server, io } = createServer({ db });
  //It was 6108 port number for Local testing 
  server.listen(process.env.PORT || 8080, process.env.HOST || '0.0.0.0', () => console.log(`Undoubt API listening on ${process.env.PORT || 8080}${configured ? '' : ' (setup incomplete)'}`));
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    io.close(async () => { await db.close(); clearTimeout(deadline); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createServer };
