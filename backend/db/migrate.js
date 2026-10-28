require('dotenv').config();
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createDatabase } = require('./postgres');
const { databaseErrorMessage } = require('./errors');
async function migrate() {
  const db = createDatabase();
  try {
    await db.transaction(client => client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8')));
    console.log('Undoubt schema installed');
  } finally { await db.close(); }
}
migrate().catch(error => { console.error(`Schema installation failed: ${databaseErrorMessage(error)}`); process.exitCode = 1; });
