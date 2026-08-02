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

const QUESTION = {
  bookId: 'prepfusion_analog_ee_v1',
  fileId: 'ch1_basics',
  year: 2022,
  questionNum: 3
};

test('rating requires a signed-in user', async () => {
  await withHarness(async ({ request, stores }) => {
    const res = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'easy' },
      cookies: false
    });
    assert.equal(res.status, 401);
    assert.equal(stores.ratings._count(), 0);
  });
});

test('listing your ratings requires a signed-in user', async () => {
  await withHarness(async ({ request }) => {
    assert.equal((await request('/api/ratings/mine', { cookies: false })).status, 401);
  });
});

test('a signed-in user can rate a question', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'hard' },
      accessToken
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.rating, 'hard');
    assert.equal(res.body.questionNum, 3);
    assert.ok(res.body.id);
  });
});

test('only the three difficulty levels are accepted', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();
    for (const rating of [undefined, '', 'Easy', 'EASY', 'impossible', 5, null]) {
      const res = await request('/api/ratings', {
        method: 'POST',
        json: { ...QUESTION, rating },
        accessToken
      });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(rating)}`);
    }
    assert.equal(stores.ratings._count(), 0);
  });
});

test('an incomplete question reference is rejected', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();
    for (const bad of [
      { rating: 'easy' },
      { ...QUESTION, rating: 'easy', fileId: undefined },
      { ...QUESTION, rating: 'easy', year: 'nope' },
      { ...QUESTION, rating: 'easy', questionNum: null }
    ]) {
      const res = await request('/api/ratings', { method: 'POST', json: bad, accessToken });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
    assert.equal(stores.ratings._count(), 0);
  });
});

// One person changing their mind must not read as two people disagreeing.
test('re-rating replaces rather than accumulating', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    const first = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'easy' },
      accessToken
    });
    const second = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'hard' },
      accessToken
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 200, 'a change of mind is an update, not a new rating');
    assert.equal(second.body.rating, 'hard');
    assert.equal(second.body.createdAt, first.body.createdAt, 'original timestamp is kept');
    assert.equal(stores.ratings._count(), 1);
  });
});

test('two users rating the same question are two ratings', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const alice = await signIn({ code: 'c-a', claims: { sub: 'g-a', email: 'a@example.com' } });
    await request('/api/ratings', { method: 'POST', json: { ...QUESTION, rating: 'easy' }, accessToken: alice.accessToken });

    jar.clear();
    const bob = await signIn({ code: 'c-b', claims: { sub: 'g-b', email: 'b@example.com' } });
    await request('/api/ratings', { method: 'POST', json: { ...QUESTION, rating: 'hard' }, accessToken: bob.accessToken });

    assert.equal(stores.ratings._count(), 2);
  });
});

test('a user can list and clear their own rating', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const created = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'medium' },
      accessToken
    });

    const list = await request('/api/ratings/mine', { accessToken });
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].rating, 'medium');

    const cleared = await request(`/api/ratings/${encodeURIComponent(created.body.id)}`, {
      method: 'DELETE',
      accessToken
    });
    assert.equal(cleared.status, 204);
    assert.equal((await request('/api/ratings/mine', { accessToken })).body.length, 0);
  });
});

test('one user cannot see or clear another user rating', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const alice = await signIn({ code: 'c-a', claims: { sub: 'g-a', email: 'a@example.com' } });
    const created = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'easy' },
      accessToken: alice.accessToken
    });

    jar.clear();
    const bob = await signIn({ code: 'c-b', claims: { sub: 'g-b', email: 'b@example.com' } });

    assert.equal((await request('/api/ratings/mine', { accessToken: bob.accessToken })).body.length, 0);
    const attempt = await request(`/api/ratings/${encodeURIComponent(created.body.id)}`, {
      method: 'DELETE',
      accessToken: bob.accessToken
    });
    assert.equal(attempt.status, 404);
    assert.equal(stores.ratings._count(), 1);
  });
});

test('display hints are stored so the admin view can label the row', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/ratings', {
      method: 'POST',
      json: { ...QUESTION, rating: 'easy', subject: 'nexus_x', questionId: '1.22.3', ordinal: 4 },
      accessToken
    });
    assert.equal(res.body.subject, 'nexus_x');
    assert.equal(res.body.questionId, '1.22.3');
    assert.equal(res.body.ordinal, 4);
  });
});
