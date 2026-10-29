const { test } = require('node:test');
const assert = require('node:assert/strict');
const register = require('../controllers/socketController');

function setup(service, broadcastVote) {
  const handlers = {}, messages = [];
  const socket = { id: 'socket', data: { user: { uid: 'student' } }, rooms: new Set(['socket', '123456']),
    on: (name, handler) => { handlers[name] = handler; }, emit: (...args) => messages.push(args),
    join: async id => socket.rooms.add(id), leave: async id => socket.rooms.delete(id) };
  const io = { to: id => ({ emit: (...args) => messages.push([id, ...args]) }) };
  register(io, socket, service, () => {}, broadcastVote);
  return { handlers, socket, messages };
}

test('questions, votes and replies confirm committed writes before slow fan-out finishes', async () => {
  for (const event of ['newDoubt', 'upvoteDoubt', 'markAsAnswered']) {
    let release, publishing = false, delivered = false;
    const broadcast = async () => { publishing = true; await new Promise(resolve => { release = resolve; }); delivered = true; };
    const service = { addDoubt: async () => ({ id: 'q', created: true }), serializeDoubt: d => d,
      vote: async () => ({ changed: true, upvotes: 1, revision: 1 }), markAnswered: async () => ({ answered: true }),
      broadcastDoubt: broadcast, broadcastEvent: broadcast };
    const { handlers } = setup(service, broadcast);
    let confirmed;
    const ack = new Promise(resolve => { confirmed = resolve; });
    const operation = handlers[event]('123456', 'q', confirmed);
    assert.equal((await ack).ok, true);
    assert.equal(publishing, true);
    assert.equal(delivered, false);
    release(); await operation;
    assert.equal(delivered, true);
  }
});

test('a delivery failure preserves success and requests a fresh authorized snapshot', async () => {
  const { handlers, messages } = setup({ vote: async () => ({ changed: true }) }, async () => { throw new Error('unavailable'); });
  const log = console.error;
  console.error = () => {};
  try {
    const confirmations = [];
    await handlers.upvoteDoubt('123456', 'q', value => confirmations.push(value));
    assert.equal(confirmations.length, 1);
    assert.equal(confirmations[0].ok, true);
    assert.deepEqual(messages, [['123456', 'syncRequired']]);
  } finally { console.error = log; }
});

test('failed writes never confirm success or publish; failed joins remove subscriptions', async () => {
  const failed = async () => { throw Object.assign(new Error('Denied'), { status: 403 }); };
  const { handlers, socket } = setup({ addDoubt: failed, joinRoom: async (_id, _user, subscribe) => { await subscribe({}); await failed(); } });
  let result;
  await handlers.newDoubt('123456', {}, value => { result = value; });
  assert.equal(result.ok, false);
  await handlers.joinRoom('654321', value => { result = value; });
  assert.equal(result.ok, false);
  assert.deepEqual([...socket.rooms], ['socket']);
});
