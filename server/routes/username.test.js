const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness } = require('../test-support/harness');

// Drives the real Express app over HTTP, like auth.test.js, so status codes
// and the claim-once rule are exercised the way the browser meets them.
async function withHarness(fn, overrides) {
  const harness = await startHarness(overrides);
  try {
    await fn(harness);
  } finally {
    await harness.close();
  }
}

test('a fresh account has no username, which is how the app knows to ask', async () => {
  await withHarness(async ({ signIn }) => {
    const { user } = await signIn();
    assert.equal(user.username, null);
  });
});

test('the suggestion is derived from the profile name and is valid to submit as-is', async () => {
  await withHarness(async ({ signIn, request }) => {
    const { accessToken } = await signIn({ claims: { name: 'Abhishek Aggarwal' } });
    const res = await request('/api/auth/username/suggestion', { accessToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.suggestion, 'AbhishekAggarwal');
    assert.equal(res.body.alreadySet, false);

    const saved = await request('/api/auth/username', {
      method: 'POST',
      accessToken,
      json: { username: res.body.suggestion }
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.username, 'AbhishekAggarwal');
  });
});

test('choosing a username puts it on every later session response', async () => {
  await withHarness(async ({ signIn, request }) => {
    const { accessToken } = await signIn();
    await request('/api/auth/username', { method: 'POST', accessToken, json: { username: 'abhishek' } });

    const me = await request('/api/auth/me', { accessToken });
    assert.equal(me.body.username, 'abhishek');

    const refreshed = await request('/api/auth/refresh', { method: 'POST' });
    assert.equal(refreshed.body.user.username, 'abhishek');
  });
});

test('names with spaces or symbols are refused with a reason, and nothing is stored', async () => {
  await withHarness(async ({ signIn, request }) => {
    const { accessToken } = await signIn();

    for (const username of ['abhi shek', 'abhi_shek', 'ab', 'a'.repeat(21), '']) {
      const res = await request('/api/auth/username', { method: 'POST', accessToken, json: { username } });
      assert.equal(res.status, 400, `${JSON.stringify(username)} should be refused`);
      assert.equal(res.body.code, 'invalid_username');
      assert.ok(res.body.error);
    }

    const me = await request('/api/auth/me', { accessToken });
    assert.equal(me.body.username, null, 'a refused attempt must not set anything');
  });
});

test('a username someone else holds is refused, case-insensitively', async () => {
  await withHarness(async ({ signIn, request, jar }) => {
    const first = await signIn({ code: 'code-a', claims: { sub: 'user-a', email: 'a@example.com' } });
    await request('/api/auth/username', {
      method: 'POST',
      accessToken: first.accessToken,
      json: { username: 'abhishek' }
    });

    jar.clear();
    const second = await signIn({ code: 'code-b', claims: { sub: 'user-b', email: 'b@example.com' } });
    const res = await request('/api/auth/username', {
      method: 'POST',
      accessToken: second.accessToken,
      json: { username: 'ABHISHEK' }
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'username_taken');
  });
});

test('the suggestion offered to a second person avoids the name already taken', async () => {
  await withHarness(async ({ signIn, request, jar }) => {
    const first = await signIn({
      code: 'code-a',
      claims: { sub: 'user-a', email: 'a@example.com', name: 'Abhishek' }
    });
    await request('/api/auth/username', {
      method: 'POST',
      accessToken: first.accessToken,
      json: { username: 'Abhishek' }
    });

    jar.clear();
    const second = await signIn({
      code: 'code-b',
      claims: { sub: 'user-b', email: 'b@example.com', name: 'Abhishek' }
    });
    const res = await request('/api/auth/username/suggestion', { accessToken: second.accessToken });
    assert.equal(res.body.suggestion, 'Abhishek2');
  });
});

test('a username is permanent — a second attempt is refused and the first stands', async () => {
  await withHarness(async ({ signIn, request }) => {
    const { accessToken } = await signIn();
    await request('/api/auth/username', { method: 'POST', accessToken, json: { username: 'abhishek' } });

    const res = await request('/api/auth/username', {
      method: 'POST',
      accessToken,
      json: { username: 'somethingelse' }
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'username_already_set');
    assert.equal(res.body.username, 'abhishek');

    const me = await request('/api/auth/me', { accessToken });
    assert.equal(me.body.username, 'abhishek');
  });
});

test('the availability check reports taken and invalid names without reserving anything', async () => {
  await withHarness(async ({ signIn, request, jar }) => {
    const first = await signIn({ code: 'code-a', claims: { sub: 'user-a', email: 'a@example.com' } });
    await request('/api/auth/username', {
      method: 'POST',
      accessToken: first.accessToken,
      json: { username: 'abhishek' }
    });

    jar.clear();
    const second = await signIn({ code: 'code-b', claims: { sub: 'user-b', email: 'b@example.com' } });
    const token = second.accessToken;

    const taken = await request('/api/auth/username/available?username=abhishek', { accessToken: token });
    assert.equal(taken.body.available, false);

    const invalid = await request('/api/auth/username/available?username=abhi%20shek', { accessToken: token });
    assert.equal(invalid.body.available, false);
    assert.match(invalid.body.error, /space/i);

    const free = await request('/api/auth/username/available?username=someoneelse', { accessToken: token });
    assert.equal(free.body.available, true);

    // Asking about a name must not claim it: the same person can still take it.
    const saved = await request('/api/auth/username', {
      method: 'POST',
      accessToken: token,
      json: { username: 'someoneelse' }
    });
    assert.equal(saved.status, 201);
  });
});

test('choosing a username requires a session', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/auth/username', { method: 'POST', json: { username: 'abhishek' } });
    assert.equal(res.status, 401);
  });
});
