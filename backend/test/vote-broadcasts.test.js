const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVoteBroadcasts } = require('../lib/voteBroadcasts');

test('vote bursts deliver the newest committed state per room and question, then settle every acknowledgement', async () => {
  const sent = [];
  const enqueue = createVoteBroadcasts(async (...args) => sent.push(args), { delayMs: 1 });
  await Promise.all([
    enqueue('123456', 'upvoteDoubt', { doubtId: 'q1', upvotes: 1, revision: 1 }),
    enqueue('123456', 'downvoteDoubt', { doubtId: 'q1', upvotes: 2, revision: 4 }),
    enqueue('123456', 'upvoteDoubt', { doubtId: 'q1', upvotes: 3, revision: 3 }),
    enqueue('654321', 'upvoteDoubt', { doubtId: 'q1', upvotes: 1, revision: 1 }),
    enqueue('123456', 'upvoteDoubt', { doubtId: 'q2', upvotes: 1, revision: 1 }),
  ]);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], ['123456', [
    { event: 'downvoteDoubt', args: [{ doubtId: 'q1', upvotes: 2, revision: 4 }] },
    { event: 'upvoteDoubt', args: [{ doubtId: 'q2', upvotes: 1, revision: 1 }] },
  ]]);
  await enqueue('123456', 'upvoteDoubt', { doubtId: 'q1', upvotes: 3, revision: 5 });
  assert.equal(sent.length, 3);
});

test('broadcast failures settle all waiting actions and a later batch can recover', async () => {
  let failing = true;
  const enqueue = createVoteBroadcasts(async () => { if (failing) throw new Error('unavailable'); }, { delayMs: 1 });
  const results = await Promise.allSettled([1, 2].map(revision => enqueue('123456', 'upvoteDoubt', { doubtId: 'q', revision })));
  assert.ok(results.every(result => result.status === 'rejected'));
  failing = false;
  await enqueue('123456', 'upvoteDoubt', { doubtId: 'q', revision: 3 });
});
