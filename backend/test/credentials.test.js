const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firebaseCredential, databaseCA } = require('../lib/credentials');
const factories = { applicationDefault: () => 'adc', cert: account => account.project_id };
const account = { type: 'service_account', project_id: 'test-project', client_email: 'test@example.invalid', private_key: '-----BEGIN PRIVATE KEY-----\nsynthetic-test-only' };
test('deployment credentials support ADC and matching service-account JSON', () => {
  assert.equal(firebaseCredential({}, factories), 'adc');
  assert.equal(firebaseCredential({ FIREBASE_PROJECT_ID: 'test-project', FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }, factories), 'test-project');
});
test('invalid or conflicting credential configuration fails without exposing input', () => {
  for (const env of [
    { FIREBASE_SERVICE_ACCOUNT_JSON: 'private-secret' },
    { FIREBASE_SERVICE_ACCOUNT_JSON: '{}', GOOGLE_APPLICATION_CREDENTIALS: 'file' },
    { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(account), FIREBASE_PROJECT_ID: 'wrong-project' },
  ]) assert.throws(() => firebaseCredential(env, factories), error => !error.message.includes('private-secret'));
});
test('database CA configuration supports multiline PEM and rejects conflicts', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----';
  assert.equal(databaseCA({ SUPABASE_DB_CA_CERT: pem }), pem);
  assert.equal(databaseCA({ SUPABASE_DB_CA_CERT: pem.replace(/\n/g, '\\n') }), pem);
  assert.equal(databaseCA({}), undefined);
  assert.throws(() => databaseCA({ SUPABASE_DB_CA_CERT: 'bad' }), /PEM/);
  assert.throws(() => databaseCA({ SUPABASE_DB_CA_CERT: pem, SUPABASE_DB_CA_FILE: 'file' }), /not both/);
});
