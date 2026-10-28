const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createServer } = require('../app');
const { railwayRateKey } = require('../lib/networkRateKey');
const { singleFlight } = require('../lib/singleFlight');
const { measure, socketPerformance } = require('../lib/performance');
const { io: connect } = require('socket.io-client');

test('WebSocket-first clients fall back to polling when upgrades are unavailable', async () => {
  const server = createServer({ db: {}, verify: async () => ({ uid: 'transport-test' }) });
  server.io.engine.opts.transports = ['polling'];
  let socket;
  try {
    await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
    socket = connect(`http://127.0.0.1:${server.server.address().port}`, {
      transports: ['websocket', 'polling'], tryAllTransports: true, reconnection: false, timeout: 2000,
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Polling fallback timed out')), 4000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket.once('connect_error', error => { clearTimeout(timeout); reject(error); });
    });
    assert.equal(socket.io.engine.transport.name, 'polling');
  } finally { socket?.disconnect(); await new Promise(resolve => server.io.close(resolve)); }
});

test('Railway client-IP keys ignore spoofed forwarded chains and group IPv6 safely', () => {
  assert.equal(railwayRateKey({}), undefined);
  const key = railwayRateKey({ RAILWAY_PROJECT_ID: 'project', RAILWAY_ENVIRONMENT_ID: 'production' });
  const req = (ip, forwarded = '1.2.3.4') => ({ headers: { 'x-real-ip': ip, 'x-forwarded-for': forwarded }, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(key(req('203.0.113.1')), key(req('203.0.113.1', '9.9.9.9')));
  assert.notEqual(key(req('203.0.113.1')), key(req('203.0.113.2')));
  assert.equal(key(req('bad,header')), '127.0.0.1');
  assert.equal(key(req(undefined)), '127.0.0.1');
  assert.equal(key(req('2001:db8::1')), key(req('2001:db8::2')));
});

test('preflight is cached but actual requests still enforce authentication and origin', async () => {
  const server = createServer({ db: {}, verify: async () => { throw new Error('Not used'); } });
  try {
    const result = await request(server.app).options('/api/me').set('Origin', 'http://localhost:3108')
      .set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'authorization').expect(204);
    assert.equal(result.headers['access-control-max-age'], '600');
    await request(server.app).get('/api/me').set('Origin', 'http://localhost:3108').expect(401);
    await request(server.app).get('/api/me').set('Origin', 'https://spoof.invalid').expect(403);
  } finally { await new Promise(resolve => server.io.close(resolve)); }
});

test('concurrent token checks share work without caching success, failure or a different identity', async () => {
  let calls = 0;
  const verify = singleFlight(async token => { calls++; if (token === 'revoked') throw new Error('revoked'); return token; });
  assert.deepEqual(await Promise.all([verify('a'), verify('a'), verify('b')]), ['a', 'a', 'b']);
  assert.equal(calls, 2);
  await verify('a');
  assert.equal(calls, 3);
  const failed = await Promise.allSettled([verify('revoked'), verify('revoked')]);
  assert.ok(failed.every(result => result.status === 'rejected'));
  assert.equal(calls, 4);
  await assert.rejects(verify('revoked'));
  assert.equal(calls, 5);
});

test('performance contexts isolate overlapping operations and contain no query or payload', async () => {
  const previous = process.env.PERFORMANCE_LOGS;
  process.env.PERFORMANCE_LOGS = 'true';
  const log = console.log, records = [];
  console.log = value => records.push(JSON.parse(value));
  try {
    await Promise.all([
      socketPerformance('newDoubt', () => measure('dbMs', async () => 'secret question')),
      socketPerformance('joinRoom', async () => { await measure('dbMs', async () => {}); await measure('authMs', async () => {}); }),
    ]);
    assert.equal(records.length, 2);
    assert.ok(records.every(row => row.dbQueries === 1 && row.status === 'ok' && row.totalMs >= 0));
    assert.ok(!JSON.stringify(records).includes('secret'));
    await assert.rejects(socketPerformance('upvoteDoubt', () => measure('dbMs', async () => { throw new Error('private SQL'); })));
    assert.equal(records.at(-1).status, 'error');
    assert.ok(!JSON.stringify(records).includes('private SQL'));
  } finally {
    console.log = log;
    if (previous === undefined) delete process.env.PERFORMANCE_LOGS; else process.env.PERFORMANCE_LOGS = previous;
  }
});
