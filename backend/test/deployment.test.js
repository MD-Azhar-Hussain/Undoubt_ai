const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDeployment } = require('../lib/deployment');

test('known unsupported cluster configurations fail before starting the backend', () => {
  assert.doesNotThrow(() => validateDeployment({}, false));
  assert.doesNotThrow(() => validateDeployment({ WEB_CONCURRENCY: '1', NODE_APP_INSTANCE: '0', TRUST_PROXY_HOPS: '1' }, false));
  for (const env of [{ WEB_CONCURRENCY: '2' }, { WEB_CONCURRENCY: 'auto' }, { NODE_APP_INSTANCE: '1' }]) {
    assert.throws(() => validateDeployment(env, false), /one backend process/);
  }
  assert.throws(() => validateDeployment({}, true), /one backend process/);
  for (const TRUST_PROXY_HOPS of ['true', '-1', '1.5', 'Infinity', '11']) {
    assert.throws(() => validateDeployment({ TRUST_PROXY_HOPS }, false), /TRUST_PROXY_HOPS/);
  }
});

test('a room vote batch checks its audience once and never queries empty rooms', async () => {
  let queries = 0;
  const sent = [];
  const db = { query: async sql => {
    queries++;
    return { rows: sql.includes('undoubt.rooms') ? [{ user_id: 'member', manager: false }] : [] };
  } };
  const service = require('../services/rooms')(db);
  let recipients = [{ id: 'socket-1', data: { user: { uid: 'member' } } }];
  const io = { in: () => ({ fetchSockets: async () => recipients }), to: ids => ({ emit: (...args) => sent.push({ ids, args }) }) };
  const events = Array.from({ length: 50 }, (_, i) => ({ event: 'upvoteDoubt', args: [{ doubtId: `q-${i}`, upvotes: 1, revision: 1 }] }));
  await service.broadcastEvents(io, '123456', events);
  assert.equal(queries, 1);
  assert.equal(sent.length, 50);
  assert.deepEqual(sent[0].ids, ['socket-1']);
  recipients = [];
  await service.broadcastEvents(io, '123456', events);
  assert.equal(queries, 1);
});
