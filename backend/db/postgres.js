const { Pool } = require('pg');
const { databaseCA } = require('../lib/credentials');
const { measure } = require('../lib/performance');

function createDatabase(env = process.env) {
  const invalid = message => Object.assign(new Error(message), { code: 'DB_CONFIG' });
  if (!env.SUPABASE_DB_URL) throw invalid('SUPABASE_DB_URL is missing. Copy the PostgreSQL URI from Supabase Connect, not the HTTPS project URL.');
  let url;
  try { url = new URL(env.SUPABASE_DB_URL); }
  catch { throw invalid('SUPABASE_DB_URL is not a valid PostgreSQL URI. Copy the full connection string from Supabase Connect.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw invalid('SUPABASE_DB_URL must start with postgresql:// or postgres://, not https://. In Supabase, open Connect and copy the Session pooler connection URI.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // SSL options in the URL must not override certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  let ca;
  try { ca = databaseCA(env); }
  catch (error) { throw invalid(error.message); }
  const pool = new Pool({ connectionString: url.toString(), max: 10,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 15000,
    ssl: local && env.NODE_ENV !== 'production' ? false : {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    },
  });
  pool.on('error', () => console.error('Database pool connection failed'));
  return {
    query: (sql, params) => measure('dbMs', () => pool.query(sql, params)),
    async transaction(work) {
      const client = await measure('poolMs', () => pool.connect());
      const query = (sql, params) => measure('dbMs', () => client.query(sql, params));
      try {
        await query('BEGIN');
        const result = await work({ query });
        await query('COMMIT');
        return result;
      } catch (error) { await query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async ready() {
      await measure('dbMs', () => pool.query('SELECT r.organisation_id, o.id, m.user_id, m.expires_at, p.user_id, a.id FROM undoubt.rooms r, undoubt.organisations o, undoubt.organisation_members m, undoubt.platform_admins p, undoubt.audit_events a LIMIT 0'));
      return true;
    },
    close: () => pool.end(),
  };
}
module.exports = { createDatabase };
