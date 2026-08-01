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
  bookId: 'prepfusion_maths_numerical_questions_v1',
  fileId: 'ch7_numerical_methods/pi',
  year: 2015,
  questionNum: 1
};

const QUESTION_ISSUE = { ...QUESTION, type: 'question_issue', comment: 'Option (C) is misprinted.' };

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

test('reporting requires a signed-in user', async () => {
  await withHarness(async ({ request, stores }) => {
    const res = await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, cookies: false });
    assert.equal(res.status, 401);
    assert.equal(stores.reports._count(), 0);
  });
});

test('listing your reports requires a signed-in user', async () => {
  await withHarness(async ({ request }) => {
    assert.equal((await request('/api/reports/mine', { cookies: false })).status, 401);
  });
});

test('withdrawing a report requires a signed-in user', async () => {
  await withHarness(async ({ request }) => {
    assert.equal((await request('/api/reports/anything', { method: 'DELETE', cookies: false })).status, 401);
  });
});

// ---------------------------------------------------------------------------
// Reporting a problem with a question
// ---------------------------------------------------------------------------

test('a signed-in user can report a problem with a question', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken });

    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'question_issue');
    assert.equal(res.body.comment, 'Option (C) is misprinted.');
    assert.equal(res.body.status, 'open');
    assert.equal(res.body.questionNum, 1);
    assert.ok(res.body.id);
    assert.ok(res.body.createdAt);
  });
});

test('a question report must actually say what is wrong', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    for (const comment of [undefined, '', '   ', null, 42]) {
      const res = await request('/api/reports', {
        method: 'POST',
        json: { ...QUESTION, type: 'question_issue', comment },
        accessToken
      });
      assert.equal(res.status, 400, `expected 400 for comment: ${JSON.stringify(comment)}`);
    }
    assert.equal(stores.reports._count(), 0);
  });
});

test('an over-long comment is rejected rather than silently truncated', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION, type: 'question_issue', comment: 'x'.repeat(4001) },
      accessToken
    });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// Reporting a problem with a solution
// ---------------------------------------------------------------------------

test('a signed-in user can report a problem with a solution', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION, type: 'solution_issue', comment: 'Step 3 divides by zero.' },
      accessToken
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'solution_issue');
  });
});

test('a solution report also requires a comment', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION, type: 'solution_issue' },
      accessToken
    });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// Requesting a video solution
// ---------------------------------------------------------------------------

// Unlike the two issue types, this one carries no information beyond "me too",
// so demanding a comment would just be friction.
test('a video request needs no comment', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION, type: 'video_request' },
      accessToken
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'video_request');
    assert.equal(res.body.comment, null);
  });
});

test('a video request may still carry an optional comment', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION, type: 'video_request', comment: 'The algebra here is hard to follow.' },
      accessToken
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.comment, 'The algebra here is hard to follow.');
  });
});

// ---------------------------------------------------------------------------
// Validation shared with bookmarks
// ---------------------------------------------------------------------------

test('an unknown report type is rejected', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    for (const type of [undefined, '', 'spam', 'QUESTION_ISSUE', 'delete_everything']) {
      const res = await request('/api/reports', {
        method: 'POST',
        json: { ...QUESTION, type, comment: 'something' },
        accessToken
      });
      assert.equal(res.status, 400, `expected 400 for type: ${JSON.stringify(type)}`);
    }
    assert.equal(stores.reports._count(), 0);
  });
});

test('an incomplete question reference is rejected', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    for (const bad of [
      { type: 'video_request' },
      { type: 'video_request', bookId: QUESTION.bookId },
      { ...QUESTION, type: 'video_request', fileId: undefined },
      { ...QUESTION, type: 'video_request', year: 'not-a-year' },
      { ...QUESTION, type: 'video_request', questionNum: null }
    ]) {
      const res = await request('/api/reports', { method: 'POST', json: bad, accessToken });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
    assert.equal(stores.reports._count(), 0);
  });
});

test('display hints are stored so an admin queue can label the row', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION_ISSUE, subject: 'maths', ordinal: 3, questionId: '7.15.1' },
      accessToken
    });

    assert.equal(res.body.subject, 'maths');
    assert.equal(res.body.ordinal, 3);
    assert.equal(res.body.questionId, '7.15.1');
  });
});

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

test('reporting the same question twice updates rather than duplicating', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken });
    const second = await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION_ISSUE, comment: 'Actually it is option (D).' },
      accessToken
    });

    assert.equal(second.status, 200);
    assert.equal(second.body.comment, 'Actually it is option (D).');
    assert.equal(stores.reports._count(), 1);
  });
});

// Requesting a video twice is the same "me too", but a question problem and a
// solution problem are genuinely different reports about the same question.
test('the three types are tracked independently for one question', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();

    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken });
    await request('/api/reports', {
      method: 'POST',
      json: { ...QUESTION, type: 'solution_issue', comment: 'wrong' },
      accessToken
    });
    await request('/api/reports', { method: 'POST', json: { ...QUESTION, type: 'video_request' }, accessToken });

    assert.equal(stores.reports._count(), 3);
  });
});

test('two users reporting the same question are two separate reports', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const alice = await signIn({ code: 'c-alice', claims: { sub: 'g-alice', email: 'alice@example.com' } });
    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken: alice.accessToken });

    jar.clear();
    const bob = await signIn({ code: 'c-bob', claims: { sub: 'g-bob', email: 'bob@example.com' } });
    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken: bob.accessToken });

    assert.equal(stores.reports._count(), 2, 'both users’ voices should count');
  });
});

// ---------------------------------------------------------------------------
// Listing and withdrawing
// ---------------------------------------------------------------------------

test('a user can list what they have reported', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken });
    await request('/api/reports', { method: 'POST', json: { ...QUESTION, type: 'video_request' }, accessToken });

    const list = await request('/api/reports/mine', { accessToken });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);
    assert.deepEqual(new Set(list.body.map((r) => r.type)), new Set(['question_issue', 'video_request']));
  });
});

test('one user cannot see another user reports', async () => {
  await withHarness(async ({ request, signIn, jar }) => {
    const alice = await signIn({ code: 'c-alice', claims: { sub: 'g-alice', email: 'alice@example.com' } });
    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken: alice.accessToken });

    jar.clear();
    const bob = await signIn({ code: 'c-bob', claims: { sub: 'g-bob', email: 'bob@example.com' } });

    const list = await request('/api/reports/mine', { accessToken: bob.accessToken });
    assert.equal(list.body.length, 0, "Bob must not see Alice's reports");
  });
});

test('a user can withdraw their own report', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const created = await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken });

    const removed = await request(`/api/reports/${encodeURIComponent(created.body.id)}`, {
      method: 'DELETE',
      accessToken
    });
    assert.equal(removed.status, 204);
    assert.equal((await request('/api/reports/mine', { accessToken })).body.length, 0);
  });
});

test('one user cannot withdraw another user report', async () => {
  await withHarness(async ({ request, signIn, jar, stores }) => {
    const alice = await signIn({ code: 'c-alice', claims: { sub: 'g-alice', email: 'alice@example.com' } });
    const created = await request('/api/reports', {
      method: 'POST',
      json: QUESTION_ISSUE,
      accessToken: alice.accessToken
    });

    jar.clear();
    const bob = await signIn({ code: 'c-bob', claims: { sub: 'g-bob', email: 'bob@example.com' } });

    const attempt = await request(`/api/reports/${encodeURIComponent(created.body.id)}`, {
      method: 'DELETE',
      accessToken: bob.accessToken
    });
    assert.equal(attempt.status, 404, "Bob's delete must not reach Alice's row");
    assert.equal(stores.reports._count(), 1);
  });
});

test('a tampered access token cannot file reports', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/reports', {
      method: 'POST',
      json: QUESTION_ISSUE,
      accessToken: `${accessToken.slice(0, -3)}zzz`
    });
    assert.equal(res.status, 401);
  });
});

// A report is a user's own words; the reviewer needs to know who filed it, but
// the API must not become a way to enumerate other people.
test('a report carries the reporting user, and only that user', async () => {
  await withHarness(async ({ request, signIn, stores }) => {
    const { accessToken } = await signIn();
    await request('/api/reports', { method: 'POST', json: QUESTION_ISSUE, accessToken });

    const [report] = stores.reports._all();
    const [user] = stores.users._all();
    assert.equal(report.userId, user.id);
    assert.equal(report.userEmail, undefined, 'store the id, not a denormalised email copy');
  });
});
