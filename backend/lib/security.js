const { getApps, initializeApp } = require('firebase-admin/app');
const { firebaseCredential } = require('./credentials');
const { getAuth } = require('firebase-admin/auth');
class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function text(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(400, `${label} must contain 1–${max} characters`);
  return value.trim();
}
function roomCode(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{5,64}$/.test(value)) throw new AppError(400, 'Invalid room code');
  return value;
}
function originAllowed(origin, env = process.env) {
  if (!origin) return true;
  if ((env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes(origin)) return true;
  try {
    const url = new URL(origin);
    return env.NODE_ENV !== 'production' && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch { return false; }
}
async function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new AppError(401, 'Sign in to continue');
  if (!process.env.FIREBASE_PROJECT_ID) throw new AppError(503, 'Firebase project is not configured');
  if (!getApps().length) initializeApp({ credential: firebaseCredential(), projectId: process.env.FIREBASE_PROJECT_ID });
  let user;
  try { user = await getAuth().verifyIdToken(token, true); }
  catch { throw new AppError(401, 'Your session expired. Please sign in again.'); }
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !user.email_verified || (domains.length && !domains.includes(user.email.split('@')[1].toLowerCase()))) throw new AppError(403, 'This account is not allowed to access this workspace');
  return user;
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicError = error => ({ message: error instanceof AppError ? error.message : 'Something went wrong. Please try again.' });
module.exports = { AppError, text, roomCode, originAllowed, verifyToken, asyncRoute, publicError };
