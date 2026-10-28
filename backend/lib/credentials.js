const { cert, applicationDefault } = require('firebase-admin/app');
const { readFileSync } = require('node:fs');

function firebaseCredential(env = process.env, factories = { cert, applicationDefault }) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return factories.applicationDefault();
  if (env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Choose FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS, not both.');
  let account;
  try { account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.'); }
  if (account?.type !== 'service_account' || account.project_id !== env.FIREBASE_PROJECT_ID ||
      typeof account.client_email !== 'string' || !account.client_email ||
      typeof account.private_key !== 'string' || !account.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Firebase service account is incomplete or does not match FIREBASE_PROJECT_ID.');
  }
  try { return factories.cert(account); }
  catch { throw new Error('Firebase service-account key could not be loaded.'); }
}

function databaseCA(env = process.env) {
  if (env.SUPABASE_DB_CA_CERT && env.SUPABASE_DB_CA_FILE) throw new Error('Choose SUPABASE_DB_CA_CERT or SUPABASE_DB_CA_FILE, not both.');
  if (env.SUPABASE_DB_CA_CERT) {
    const certificate = env.SUPABASE_DB_CA_CERT.replace(/\\n/g, '\n');
    if (!certificate.includes('-----BEGIN CERTIFICATE-----') || !certificate.includes('-----END CERTIFICATE-----')) {
      throw new Error('SUPABASE_DB_CA_CERT must contain a PEM certificate.');
    }
    return certificate;
  }
  if (env.SUPABASE_DB_CA_FILE) {
    try { return readFileSync(env.SUPABASE_DB_CA_FILE, 'utf8'); }
    catch { throw new Error('SUPABASE_DB_CA_FILE could not be read. Use an absolute path available on the deployment host.'); }
  }
}
module.exports = { firebaseCredential, databaseCA };
