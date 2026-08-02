const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness } = require('../test-support/harness');

async function withHarness(fn) {
  const harness = await startHarness();
  try {
    await fn(harness);
  } finally {
    await harness.close();
  }
}

// kb-ingest is what really writes these; the harness seeds them directly.
function seed(stores, userId, overrides = {}) {
  const notification = {
    id: overrides.id || `n-${Math.random()}`,
    userId,
    type: 'question_updated',
    title: 'Question updated',
    body: 'The question you reported has been updated.',
    bookId: 'analog_ee',
    fileId: 'ch1_basics',
    year: 2022,
    questionNum: 3,
    subject: 'nexus_x',
    ordinal: 7,
    questionId: '1.22.3',
    createdAt: '2026-08-02T10:00:00.000Z',
    readAt: null,
    ...overrides
  };
  stores.notifications._seed(notification);
  return notification;
}

test('notifications require a signed-in user', async () => {
  await withHarness(async ({ request }) => {
    assert.equal((await request('/api/notifications', { cookies: false })).status, 401);
    assert.equal(
      (await request('/api/notifications/read', { method: 'POST', cookies: false })).status,
      401
    );
  });
});

test('a signed-in user sees their notifications and unread count', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken, user } = await signIn();
    seed(stores, user.id, { id: 'n1' });
    seed(stores, user.id, { id: 'n2', readAt: '2026-08-02T11:00:00.000Z' });

    const res = await request('/api/notifications', { accessToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.notifications.length, 2);
    assert.equal(res.body.unread, 1, 'only the unread one counts');
  });
});

test('newest first', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken, user } = await signIn();
    seed(stores, user.id, { id: 'old', createdAt: '2026-07-01T00:00:00.000Z' });
    seed(stores, user.id, { id: 'new', createdAt: '2026-08-02T00:00:00.000Z' });

    const res = await request('/api/notifications', { accessToken });
    assert.deepEqual(res.body.notifications.map((n) => n.id), ['new', 'old']);
  });
});

// The whole point is that it links straight to the question that changed.
test('a notification carries what the link needs', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken, user } = await signIn();
    seed(stores, user.id, { id: 'n1' });

    const [n] = (await request('/api/notifications', { accessToken })).body.notifications;
    assert.equal(n.subject, 'nexus_x');
    assert.equal(n.bookId, 'analog_ee');
    assert.equal(n.fileId, 'ch1_basics');
    assert.equal(n.ordinal, 7);
    assert.equal(n.questionId, '1.22.3');
  });
});

test('opening the bell marks everything read', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken, user } = await signIn();
    seed(stores, user.id, { id: 'n1' });
    seed(stores, user.id, { id: 'n2' });

    const marked = await request('/api/notifications/read', { method: 'POST', accessToken });
    assert.equal(marked.body.marked, 2);
    assert.equal((await request('/api/notifications', { accessToken })).body.unread, 0);
  });
});

test('marking one read leaves the others alone', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken, user } = await signIn();
    seed(stores, user.id, { id: 'n1' });
    seed(stores, user.id, { id: 'n2' });

    assert.equal((await request('/api/notifications/n1/read', { method: 'POST', accessToken })).status, 204);
    assert.equal((await request('/api/notifications', { accessToken })).body.unread, 1);
  });
});

test('a notification can be dismissed', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken, user } = await signIn();
    seed(stores, user.id, { id: 'n1' });

    assert.equal((await request('/api/notifications/n1', { method: 'DELETE', accessToken })).status, 204);
    assert.equal((await request('/api/notifications', { accessToken })).body.notifications.length, 0);
  });
});

test('one user cannot see, read or delete another user notifications', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const alice = await signIn({ code: 'c-a', claims: { sub: 'g-a', email: 'a@example.com' } });
    seed(stores, alice.user.id, { id: 'alice-1' });

    jar.clear();
    const bob = await signIn({ code: 'c-b', claims: { sub: 'g-b', email: 'b@example.com' } });

    const list = await request('/api/notifications', { accessToken: bob.accessToken });
    assert.equal(list.body.notifications.length, 0);
    assert.equal(list.body.unread, 0);

    assert.equal(
      (await request('/api/notifications/alice-1/read', { method: 'POST', accessToken: bob.accessToken })).status,
      404
    );
    assert.equal(
      (await request('/api/notifications/alice-1', { method: 'DELETE', accessToken: bob.accessToken })).status,
      404
    );
    assert.equal(stores.notifications._count(), 1, "Alice's notification must survive");
  });
});

test('an unknown notification is a 404', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    assert.equal((await request('/api/notifications/ghost/read', { method: 'POST', accessToken })).status, 404);
    assert.equal((await request('/api/notifications/ghost', { method: 'DELETE', accessToken })).status, 404);
  });
});

test('a user with nothing sees an empty list rather than an error', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/notifications', { accessToken });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.notifications, []);
    assert.equal(res.body.unread, 0);
  });
});
