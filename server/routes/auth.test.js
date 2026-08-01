const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness } = require('../test-support/harness');

// Every test drives the real Express app over HTTP, so redirects, cookie
// attributes and status codes are exercised exactly as a browser would see
// them.
async function withHarness(fn, overrides) {
  const harness = await startHarness(overrides);
  try {
    await fn(harness);
  } finally {
    await harness.close();
  }
}

// ---------------------------------------------------------------------------
// Starting the flow
// ---------------------------------------------------------------------------

test('start redirects to the provider with the parameters the auth-code + PKCE flow requires', async () => {
  await withHarness(async ({ request, config }) => {
    const res = await request('/api/auth/google/start');

    assert.equal(res.status, 302);
    const url = new URL(res.location);
    assert.equal(url.origin + url.pathname, config.providers.google.authorizeUrl);
    assert.equal(url.searchParams.get('client_id'), 'test-client-id');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.ok(url.searchParams.get('state'));
    assert.ok(url.searchParams.get('redirect_uri').endsWith('/api/auth/google/callback'));
  });
});

test('start binds the state to an httpOnly cookie the browser cannot read', async () => {
  await withHarness(async ({ request, jar }) => {
    await request('/api/auth/google/start');
    const cookie = jar.get('pf_oauth');
    assert.ok(cookie, 'expected an pf_oauth transaction cookie');
    assert.equal(cookie.attrs.httponly, true);
    assert.equal(String(cookie.attrs.samesite).toLowerCase(), 'lax');
  });
});

test('two sign-in attempts get different state values', async () => {
  await withHarness(async ({ request }) => {
    const a = new URL((await request('/api/auth/google/start')).location);
    const b = new URL((await request('/api/auth/google/start')).location);
    assert.notEqual(a.searchParams.get('state'), b.searchParams.get('state'));
  });
});

test('an unknown provider is a 404, not a redirect to nowhere', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/auth/facebook/start');
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
// Signup — the first time a Google account is seen
// ---------------------------------------------------------------------------

test('signup: a first-time callback creates the user and marks them new', async () => {
  await withHarness(async ({ request, provider, stores }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-1', { sub: 'google-42', email: 'newbie@example.com', name: 'New Bie' });

    const res = await request(`/api/auth/google/callback?code=code-1&state=${state}`);

    assert.equal(res.status, 302);
    const redirect = new URL(res.location);
    assert.equal(redirect.searchParams.get('signed_in'), '1');
    assert.equal(redirect.searchParams.get('new_user'), '1');

    assert.equal(stores.users._count(), 1);
    const [user] = stores.users._all();
    assert.equal(user.provider, 'google');
    assert.equal(user.providerUserId, 'google-42');
    assert.equal(user.email, 'newbie@example.com');
    assert.deepEqual(user.roles, ['user']);
  });
});

test('signup sends the PKCE verifier and client secret to the token endpoint', async () => {
  await withHarness(async ({ signIn, provider }) => {
    await signIn({ code: 'code-pkce' });
    const sent = provider.lastTokenRequest;
    assert.equal(sent.grant_type, 'authorization_code');
    assert.equal(sent.client_id, 'test-client-id');
    assert.equal(sent.client_secret, 'test-client-secret');
    assert.ok(sent.code_verifier, 'the PKCE verifier must be sent on exchange');
  });
});

test('signup sets a refresh cookie that JavaScript cannot read', async () => {
  await withHarness(async ({ signIn, jar }) => {
    await signIn();
    const cookie = jar.get('pf_refresh');
    assert.ok(cookie, 'expected a pf_refresh cookie');
    assert.equal(cookie.attrs.httponly, true);
    assert.equal(String(cookie.attrs.samesite).toLowerCase(), 'lax');
  });
});

test('signup clears the one-shot oauth transaction cookie', async () => {
  await withHarness(async ({ signIn, jar }) => {
    await signIn();
    assert.equal(jar.get('pf_oauth'), null, 'the state cookie must not outlive the exchange');
  });
});

// ---------------------------------------------------------------------------
// Login — the same Google account returning
// ---------------------------------------------------------------------------

test('login: a returning user is not duplicated', async () => {
  await withHarness(async ({ request, provider, stores, jar }) => {
    const claims = { sub: 'google-99', email: 'repeat@example.com' };

    for (const code of ['code-a', 'code-b', 'code-c']) {
      jar.clear();
      const start = await request('/api/auth/google/start');
      const state = new URL(start.location).searchParams.get('state');
      provider.grant(code, claims);
      await request(`/api/auth/google/callback?code=${code}&state=${state}`);
    }

    assert.equal(stores.users._count(), 1);
  });
});

test('login: a returning user is not flagged as new', async () => {
  await withHarness(async ({ request, provider, jar }) => {
    const claims = { sub: 'google-99', email: 'repeat@example.com' };

    const first = await request('/api/auth/google/start');
    provider.grant('code-a', claims);
    await request(`/api/auth/google/callback?code=code-a&state=${new URL(first.location).searchParams.get('state')}`);

    jar.clear();
    const second = await request('/api/auth/google/start');
    provider.grant('code-b', claims);
    const res = await request(
      `/api/auth/google/callback?code=code-b&state=${new URL(second.location).searchParams.get('state')}`
    );

    assert.equal(new URL(res.location).searchParams.get('new_user'), null);
    assert.equal(new URL(res.location).searchParams.get('signed_in'), '1');
  });
});

test('login records the sign-in time', async () => {
  await withHarness(async ({ signIn, stores }) => {
    await signIn();
    const [user] = stores.users._all();
    assert.ok(user.lastLoginAt, 'expected lastLoginAt to be recorded');
  });
});

test('two different Google accounts are two different users', async () => {
  await withHarness(async ({ request, provider, stores, jar }) => {
    for (const [code, sub] of [['c1', 'google-1'], ['c2', 'google-2']]) {
      jar.clear();
      const start = await request('/api/auth/google/start');
      const state = new URL(start.location).searchParams.get('state');
      provider.grant(code, { sub, email: `${sub}@example.com` });
      await request(`/api/auth/google/callback?code=${code}&state=${state}`);
    }
    assert.equal(stores.users._count(), 2);
  });
});

// ---------------------------------------------------------------------------
// Callback error cases
// ---------------------------------------------------------------------------

test('a callback whose state does not match the cookie is rejected as CSRF', async () => {
  await withHarness(async ({ request, provider }) => {
    await request('/api/auth/google/start');
    provider.grant('code-x');

    const res = await request('/api/auth/google/callback?code=code-x&state=attacker-supplied-state');

    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /state/i);
  });
});

test('a callback with no transaction cookie at all is rejected', async () => {
  await withHarness(async ({ request, provider }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x');

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`, { cookies: false });

    assert.equal(res.status, 400);
  });
});

test('a callback with no code is rejected', async () => {
  await withHarness(async ({ request }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    const res = await request(`/api/auth/google/callback?state=${state}`);
    assert.equal(res.status, 400);
  });
});

test('a user who declines consent is sent back to the app with an error, not a stack trace', async () => {
  await withHarness(async ({ request, config }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');

    const res = await request(`/api/auth/google/callback?error=access_denied&state=${state}`);

    assert.equal(res.status, 302);
    const redirect = new URL(res.location);
    assert.equal(redirect.origin, new URL(config.appUrl).origin);
    assert.equal(redirect.searchParams.get('auth_error'), 'access_denied');
  });
});

test('an unusable authorization code does not create a user', async () => {
  await withHarness(async ({ request, stores }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');

    // Never granted by the fake provider, so the exchange returns invalid_grant.
    const res = await request(`/api/auth/google/callback?code=bogus&state=${state}`);

    assert.equal(res.status, 401);
    assert.equal(stores.users._count(), 0);
  });
});

test('a provider outage during token exchange is a 502, not a 500', async () => {
  await withHarness(async ({ request, provider }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x');
    provider.failTokenExchange(503);

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);

    assert.equal(res.status, 502);
  });
});

test('an id_token minted for a different client is rejected', async () => {
  await withHarness(async ({ request, provider, stores }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { aud: 'some-other-clients-id' });

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);

    assert.equal(res.status, 401);
    assert.equal(stores.users._count(), 0);
  });
});

test('an id_token from the wrong issuer is rejected', async () => {
  await withHarness(async ({ request, provider }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { iss: 'https://accounts.evil.example' });

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);
    assert.equal(res.status, 401);
  });
});

test('an expired id_token is rejected', async () => {
  await withHarness(async ({ request, provider }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { exp: Math.floor(Date.now() / 1000) - 3600 });

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);
    assert.equal(res.status, 401);
  });
});

// Anyone can create a Google account claiming an unverified address, so
// trusting it would let one user impersonate another's email.
test('an unverified email is refused', async () => {
  await withHarness(async ({ request, provider, stores }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-x', { email_verified: false });

    const res = await request(`/api/auth/google/callback?code=code-x&state=${state}`);

    assert.equal(res.status, 403);
    assert.equal(stores.users._count(), 0);
  });
});

test('a state cookie cannot be replayed for a second callback', async () => {
  await withHarness(async ({ request, provider, jar }) => {
    const start = await request('/api/auth/google/start');
    const state = new URL(start.location).searchParams.get('state');
    provider.grant('code-1');
    provider.grant('code-2');

    const first = await request(`/api/auth/google/callback?code=code-1&state=${state}`);
    assert.equal(first.status, 302);

    // The transaction cookie was cleared, so the same state is now useless.
    const replay = await request(`/api/auth/google/callback?code=code-2&state=${state}`);
    assert.equal(replay.status, 400);
    assert.equal(jar.get('pf_oauth'), null);
  });
});

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

test('refresh exchanges the cookie for a short-lived access token', async () => {
  await withHarness(async ({ request, signIn, config }) => {
    await signIn();
    const res = await request('/api/auth/refresh', { method: 'POST' });

    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.expiresIn, config.accessTtlSeconds);
    assert.equal(res.body.user.email, 'student@example.com');
  });
});

test('refresh never returns the refresh token in the response body', async () => {
  await withHarness(async ({ request, signIn }) => {
    await signIn();
    const res = await request('/api/auth/refresh', { method: 'POST' });
    assert.equal(res.body.refreshToken, undefined);
    assert.ok(!JSON.stringify(res.body).includes('pf_refresh'));
  });
});

test('refresh rotates the cookie', async () => {
  await withHarness(async ({ request, signIn, jar }) => {
    await signIn();
    const before = jar.get('pf_refresh').value;
    await request('/api/auth/refresh', { method: 'POST' });
    assert.notEqual(jar.get('pf_refresh').value, before);
  });
});

test('refresh without a cookie is a 401', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/auth/refresh', { method: 'POST', cookies: false });
    assert.equal(res.status, 401);
  });
});

test('refresh with a token that was never issued is a 401', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/auth/refresh', {
      method: 'POST',
      cookies: false,
      headers: { Cookie: 'pf_refresh=totally-made-up-token' }
    });
    assert.equal(res.status, 401);
  });
});

test('a stolen refresh token replayed after rotation kills the session', async () => {
  await withHarness(async ({ request, signIn, jar }) => {
    await signIn();
    const stolen = jar.get('pf_refresh').value;

    // The real user refreshes, rotating the token the thief holds.
    const legit = await request('/api/auth/refresh', { method: 'POST' });
    assert.equal(legit.status, 200);

    // The thief replays the old one.
    const replay = await request('/api/auth/refresh', {
      method: 'POST',
      cookies: false,
      headers: { Cookie: `pf_refresh=${stolen}` }
    });
    assert.equal(replay.status, 401);

    // And the real user's current token is revoked too — we cannot tell which
    // party is which, so the whole family goes.
    const afterBreach = await request('/api/auth/refresh', { method: 'POST' });
    assert.equal(afterBreach.status, 401);
  });
});

// ---------------------------------------------------------------------------
// /me and the auth middleware
// ---------------------------------------------------------------------------

test('me returns the signed-in profile', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/auth/me', { accessToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'student@example.com');
    assert.equal(res.body.name, 'Test Student');
    assert.ok(res.body.id);
  });
});

test('me never leaks provider identifiers or internal token state', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const res = await request('/api/auth/me', { accessToken });
    assert.equal(res.body.providerUserId, undefined);
  });
});

test('me without a token is a 401', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/auth/me', { cookies: false });
    assert.equal(res.status, 401);
  });
});

test('me with a malformed Authorization header is a 401', async () => {
  await withHarness(async ({ request }) => {
    for (const header of ['Bearer', 'Bearer ', 'Basic abc', 'nonsense']) {
      const res = await request('/api/auth/me', { cookies: false, headers: { Authorization: header } });
      assert.equal(res.status, 401, `for header: ${header}`);
    }
  });
});

test('me with a tampered token is a 401', async () => {
  await withHarness(async ({ request, signIn }) => {
    const { accessToken } = await signIn();
    const tampered = `${accessToken.slice(0, -3)}aaa`;
    const res = await request('/api/auth/me', { accessToken: tampered });
    assert.equal(res.status, 401);
  });
});

test('an expired access token is a 401, distinguishable so the client knows to refresh', async () => {
  // A clock the test controls: sign in, then step past the access TTL.
  let clock = Date.parse('2026-01-01T00:00:00Z');
  await withHarness(
    async ({ request, signIn, config }) => {
      const { accessToken } = await signIn();
      clock += (config.accessTtlSeconds + 60) * 1000;

      const res = await request('/api/auth/me', { accessToken });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'token_expired');
    },
    { now: () => clock }
  );
});

test('an access token still works shortly before it expires', async () => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  await withHarness(
    async ({ request, signIn, config }) => {
      const { accessToken } = await signIn();
      clock += (config.accessTtlSeconds - 60) * 1000;
      assert.equal((await request('/api/auth/me', { accessToken })).status, 200);
    },
    { now: () => clock }
  );
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

test('logout clears the cookie and revokes the refresh token', async () => {
  await withHarness(async ({ request, signIn, jar }) => {
    await signIn();

    const res = await request('/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 204);
    assert.equal(jar.get('pf_refresh'), null, 'the refresh cookie should be cleared');

    const after = await request('/api/auth/refresh', { method: 'POST' });
    assert.equal(after.status, 401);
  });
});

test('logout without a session is still a success, so the client can always call it', async () => {
  await withHarness(async ({ request }) => {
    const res = await request('/api/auth/logout', { method: 'POST', cookies: false });
    assert.equal(res.status, 204);
  });
});

test('logging out of one session leaves another session working', async () => {
  await withHarness(async ({ request, provider, jar }) => {
    const claims = { sub: 'google-99', email: 'two@example.com' };

    const startA = await request('/api/auth/google/start');
    provider.grant('code-a', claims);
    await request(`/api/auth/google/callback?code=code-a&state=${new URL(startA.location).searchParams.get('state')}`);
    const deviceA = jar.get('pf_refresh').value;

    jar.clear();
    const startB = await request('/api/auth/google/start');
    provider.grant('code-b', claims);
    await request(`/api/auth/google/callback?code=code-b&state=${new URL(startB.location).searchParams.get('state')}`);

    await request('/api/auth/logout', { method: 'POST' });

    const stillWorks = await request('/api/auth/refresh', {
      method: 'POST',
      cookies: false,
      headers: { Cookie: `pf_refresh=${deviceA}` }
    });
    assert.equal(stillWorks.status, 200, 'signing out on one device must not sign out the other');
  });
});
