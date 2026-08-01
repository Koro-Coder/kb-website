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

// A question is identified by (bookId, fileId, year, questionNum) — the same
// triple the solution join and video overrides use. The printed question id is
// not safe (aptitude ids repeat across files) and the ordinal is worse still:
// it shifts whenever a question is inserted into the source .tex.
const QUESTION = {
  bookId: 'prepfusion_digital_electronics_ec_v1',
  fileId: 'ch1_logic_gates_and_boolean_algebra',
  year: 2022,
  questionNum: 1
};

test('listing bookmarks requires a signed-in user', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/bookmarks', { cookies: false });
    assert.equal(res.status, 401);
  });
});

test('creating a bookmark requires a signed-in user', async () => {
  await withHarness(async ({ request, stores }) => {
    const res = await request('/api/bookmarks', { method: 'POST', json: QUESTION, cookies: false });
    assert.equal(res.status, 401);
    assert.equal(stores.bookmarks._count(), 0);
  });
});

test('deleting a bookmark requires a signed-in user', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/bookmarks/anything', { method: 'DELETE', cookies: false });
    assert.equal(res.status, 401);
  });
});

test('a signed-in user can bookmark a question and read it back', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();

    const created = await request('/api/bookmarks', { method: 'POST', json: QUESTION, accessToken });
    assert.equal(created.status, 201);
    assert.equal(created.body.bookId, QUESTION.bookId);
    assert.equal(created.body.questionNum, QUESTION.questionNum);
    assert.ok(created.body.id);

    const list = await request('/api/bookmarks', { accessToken });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].fileId, QUESTION.fileId);
  });
});

test('bookmarking the same question twice does not duplicate it', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    await request('/api/bookmarks', { method: 'POST', json: QUESTION, accessToken });
    const second = await request('/api/bookmarks', { method: 'POST', json: QUESTION, accessToken });

    assert.ok(second.status === 200 || second.status === 201, `unexpected status ${second.status}`);
    assert.equal(stores.bookmarks._count(), 1);
  });
});

test('a bookmark can be removed', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const created = await request('/api/bookmarks', { method: 'POST', json: QUESTION, accessToken });

    const removed = await request(`/api/bookmarks/${encodeURIComponent(created.body.id)}`, {
      method: 'DELETE',
      accessToken
    });
    assert.equal(removed.status, 204);

    const list = await request('/api/bookmarks', { accessToken });
    assert.equal(list.body.length, 0);
  });
});

test('an incomplete question reference is rejected', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    for (const bad of [
      {},
      { bookId: QUESTION.bookId },
      { ...QUESTION, fileId: undefined },
      { ...QUESTION, year: 'not-a-year' },
      { ...QUESTION, questionNum: null }
    ]) {
      const res = await request('/api/bookmarks', { method: 'POST', json: bad, accessToken });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
    assert.equal(stores.bookmarks._count(), 0);
  });
});

test('one user cannot see another user bookmarks', async () => {
  await withHarness(async ({ request, signIn, jar }) => {
    const alice = await signIn({ code: 'code-alice', claims: { sub: 'g-alice', email: 'alice@example.com' } });
    await request('/api/bookmarks', { method: 'POST', json: QUESTION, accessToken: alice.accessToken });

    jar.clear();
    const bob = await signIn({ code: 'code-bob', claims: { sub: 'g-bob', email: 'bob@example.com' } });

    const bobsList = await request('/api/bookmarks', { accessToken: bob.accessToken });
    assert.equal(bobsList.status, 200);
    assert.equal(bobsList.body.length, 0, "Bob must not see Alice's bookmarks");
  });
});

test('one user cannot delete another user bookmark', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const alice = await signIn({ code: 'code-alice', claims: { sub: 'g-alice', email: 'alice@example.com' } });
    const created = await request('/api/bookmarks', {
      method: 'POST',
      json: QUESTION,
      accessToken: alice.accessToken
    });

    jar.clear();
    const bob = await signIn({ code: 'code-bob', claims: { sub: 'g-bob', email: 'bob@example.com' } });

    const attempt = await request(`/api/bookmarks/${encodeURIComponent(created.body.id)}`, {
      method: 'DELETE',
      accessToken: bob.accessToken
    });

    assert.equal(attempt.status, 404, "Bob's delete must not reach Alice's row");
    assert.equal(stores.bookmarks._count(), 1);
  });
});

test('display hints are stored alongside the bookmark', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const created = await request('/api/bookmarks', {
      method: 'POST',
      json: { ...QUESTION, subject: 'technical', ordinal: 7, questionId: '1.22.1', label: 'Logic Gates' },
      accessToken
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.subject, 'technical');
    assert.equal(created.body.ordinal, 7);
    assert.equal(created.body.questionId, '1.22.1');
    assert.equal(created.body.label, 'Logic Gates');
  });
});

// The ordinal moves when a question is inserted into the source .tex, so it
// must never decide which question a bookmark points at.
test('hints do not form part of the bookmark identity', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    await request('/api/bookmarks', { method: 'POST', json: { ...QUESTION, ordinal: 7 }, accessToken });
    const second = await request('/api/bookmarks', {
      method: 'POST',
      json: { ...QUESTION, ordinal: 99, label: 'renamed' },
      accessToken
    });

    assert.equal(second.status, 200, 'same question, so not a new bookmark');
    assert.equal(stores.bookmarks._count(), 1);
  });
});

test('a garbage hint is dropped rather than rejecting the bookmark', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const created = await request('/api/bookmarks', {
      method: 'POST',
      json: { ...QUESTION, ordinal: 'not-a-number', subject: '   ' },
      accessToken
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.ordinal, undefined);
    assert.equal(created.body.subject, undefined);
  });
});

test('an expired access token cannot create bookmarks', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const tampered = `${accessToken.slice(0, -3)}zzz`;
    const res = await request('/api/bookmarks', { method: 'POST', json: QUESTION, accessToken: tampered });
    assert.equal(res.status, 401);
  });
});
