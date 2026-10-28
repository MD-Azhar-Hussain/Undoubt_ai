const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../db/postgres');
const { databaseErrorMessage } = require('../db/errors');
test('HTTPS project URLs produce actionable errors without exposing credentials', () => {
  assert.throws(() => createDatabase({ SUPABASE_DB_URL: 'https://private-user:secret@example.supabase.co' }), error => {
    const message = databaseErrorMessage(error);
    assert.match(message, /Session pooler/);
    assert.ok(!message.includes('secret'));
    assert.ok(!message.includes('private-user'));
    return true;
  });
});
test('unrecognized database errors never expose raw messages', () => {
  assert.ok(!databaseErrorMessage(new Error('password=secret')).includes('secret'));
  assert.match(databaseErrorMessage({ code: '28P01' }), /password was rejected/);
});
