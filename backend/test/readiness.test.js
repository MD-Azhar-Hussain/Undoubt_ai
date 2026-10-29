const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createReadinessProbe } = require('../lib/readiness');
const { createServer } = require('../app');

test('concurrent probes share a query and recheck after bounded success/failure caches', async () => {
  let now = 100, calls = 0, fail = false;
  const probe = createReadinessProbe(async () => { calls++; if (fail) throw new Error('offline'); }, { now: () => now });
  assert.ok((await Promise.all(Array.from({ length: 100 }, probe))).every(Boolean));
  assert.equal(calls, 1);
  now += 4999;
  assert.equal(await probe(), true);
  assert.equal(calls, 1);
  now++;
  fail = true;
  assert.equal(await probe(), false);
  assert.equal(calls, 2);
  fail = false;
  now += 999;
  assert.equal(await probe(), false);
  now++;
  assert.equal(await probe(), true);
  assert.equal(calls, 3);
});

test('public health traffic is coalesced; liveness never queries the database', async () => {
  let calls = 0;
  const server = createServer({ db: { ready: async () => { calls++; } } });
  try {
    const responses = await Promise.all(Array.from({ length: 50 }, () => request(server.app).get('/health/ready')));
    assert.ok(responses.every(r => r.status === 200 && r.body.ready && r.headers['cache-control'] === 'no-store'));
    assert.equal(calls, 1);
    await request(server.app).get('/health/live').expect(200);
    assert.equal(calls, 1);
  } finally { await new Promise(resolve => server.io.close(resolve)); }
});
