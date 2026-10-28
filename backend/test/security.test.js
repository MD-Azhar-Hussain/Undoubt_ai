const { test } = require('node:test');
const assert = require('node:assert/strict');
const { originAllowed, text, roomCode, verifyToken } = require('../lib/security');
test('production origin allowlist rejects substring spoofing and other previews', () => {
  const env = { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://undoubt.example' };
  assert.equal(originAllowed('https://undoubt.example', env), true);
  for (const origin of ['https://localhost.attacker.com', 'https://attacker.vercel.app', 'http://localhost:3108']) assert.equal(originAllowed(origin, env), false);
  assert.equal(originAllowed('http://localhost:3108', {}), true);
});
test('validation rejects objects, empty input, oversized input and invalid room codes', () => {
  for (const input of [{ $ne: null }, '', ' '.repeat(4), 'x'.repeat(2001)]) assert.throws(() => text(input, 'Question'));
  assert.equal(text(' hello ', 'Question'), 'hello');
  assert.throws(() => roomCode({ $ne: null }));
  assert.throws(() => roomCode('../rooms'));
  assert.equal(roomCode('12345'), '12345');
});
test('missing credentials fail closed', async () => { await assert.rejects(verifyToken(), { status: 401 }); });
