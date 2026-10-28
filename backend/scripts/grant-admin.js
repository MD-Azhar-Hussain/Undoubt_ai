require('dotenv').config();
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createDatabase } = require('../db/postgres');
const { databaseErrorMessage } = require('../db/errors');

// This operator-only entry point requires server credentials. It is never exposed over HTTP.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || process.argv.length !== 3) throw new Error('Usage: npm run admin:grant -- verified-email@example.com');
  if (!process.env.FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID is required');
  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  const user = await getAuth().getUserByEmail(email);
  if (user.disabled || !user.emailVerified) throw new Error('The Firebase account must be enabled and its email verified. Sign in to the app first.');
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (domains.length && !domains.includes(email.split('@')[1])) throw new Error('This email domain is excluded by ALLOWED_EMAIL_DOMAINS');
  const db = createDatabase();
  try {
    await db.transaction(async client => {
      const result = await client.query('INSERT INTO undoubt.platform_admins(user_id,email) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING RETURNING user_id', [user.uid, email]);
      if (result.rows.length) await require('../services/access')(db).audit(client, { uid: 'server-operator' }, null, 'platform.access_granted', user.uid, { email });
    });
    console.log('Platform administrator access granted. Refresh the app and open /admin.');
  } finally { await db.close(); }
}
main().catch(error => {
  const safe = error.code === 'auth/user-not-found' ? 'This email has not signed in to this Firebase project yet. Sign in to the app with it, then run this command again.'
    : error.code?.startsWith('auth/') ? `Firebase could not verify this account (${error.code}). Check the email and server credentials.` : error.code ? databaseErrorMessage(error) : error.message;
  console.error(safe);
  process.exitCode = 1;
});
