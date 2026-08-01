const test = require('node:test');
const assert = require('node:assert/strict');
const { createTokenService } = require('./tokens');
const { createRefreshService } = require('./refreshTokens');
const { createRefreshTokenStore } = require('../test-support/memoryStores');

const DAY_MS = 24 * 60 * 60 * 1000;

function setup(startMs = Date.parse('2026-01-01T00:00:00Z')) {
  let clock = startMs;
  const now = () => clock;
  const store = createRefreshTokenStore();
  const tokens = createTokenService({
    jwtSecret: 'unit-test-secret',
    issuer: 'prepfusion-test',
    audience: 'prepfusion-web-test',
    accessTtlSeconds: 900,
    oauthStateTtlSeconds: 300,
    now
  });
  const refresh = createRefreshService({ store, tokens, refreshTtlDays: 30, now });
  return { refresh, store, tokens, advance: (ms) => { clock += ms; }, now };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error.code;
  }
  return null;
}

test('issuing a refresh token stores only its hash, never the token itself', async () => {
  const { refresh, store, tokens } = setup();
  const { token } = await refresh.issue('user-1');

  const stored = store._all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].hash, tokens.hashRefreshToken(token));
  assert.ok(!JSON.stringify(stored).includes(token), 'raw token must not be persisted');
});

test('a freshly issued token starts a new family', async () => {
  const { refresh, store } = setup();
  await refresh.issue('user-1');
  await refresh.issue('user-1');

  const families = new Set(store._all().map((r) => r.familyId));
  assert.equal(families.size, 2, 'each sign-in should start its own family');
});

test('rotating returns a new token and invalidates the old one', async () => {
  const { refresh } = setup();
  const first = await refresh.issue('user-1');
  const second = await refresh.rotate(first.token);

  assert.notEqual(second.token, first.token);
  assert.equal(second.record.userId, 'user-1');
  assert.equal(await codeOf(refresh.rotate(first.token)), 'token_reused');
});

test('rotation keeps the whole chain in one family', async () => {
  const { refresh, store } = setup();
  const first = await refresh.issue('user-1');
  const second = await refresh.rotate(first.token);
  const third = await refresh.rotate(second.token);

  assert.equal(second.record.familyId, first.record.familyId);
  assert.equal(third.record.familyId, first.record.familyId);
  assert.equal(store._family(first.record.familyId).length, 3);
});

// The reason rotation exists: if a stolen token is replayed after the real
// user has already rotated it, we cannot tell victim from thief — so the
// whole family dies and both are forced to sign in again.
test('replaying an already-rotated token revokes the entire family', async () => {
  const { refresh, store } = setup();
  const first = await refresh.issue('user-1');
  const second = await refresh.rotate(first.token);
  const third = await refresh.rotate(second.token);

  assert.equal(await codeOf(refresh.rotate(first.token)), 'token_reused');

  // The thief's replay must not leave the victim's current token usable.
  assert.equal(await codeOf(refresh.rotate(third.token)), 'token_revoked');
  assert.ok(store._family(first.record.familyId).every((r) => r.revokedAt));
});

test('a revoked token cannot be rotated', async () => {
  const { refresh } = setup();
  const { token } = await refresh.issue('user-1');
  await refresh.revoke(token);
  assert.equal(await codeOf(refresh.rotate(token)), 'token_revoked');
});

test('an expired refresh token is rejected', async () => {
  const { refresh, advance } = setup();
  const { token } = await refresh.issue('user-1');
  advance(31 * DAY_MS);
  assert.equal(await codeOf(refresh.rotate(token)), 'token_expired');
});

test('a refresh token is still valid the day before it expires', async () => {
  const { refresh, advance } = setup();
  const { token } = await refresh.issue('user-1');
  advance(29 * DAY_MS);
  const rotated = await refresh.rotate(token);
  assert.equal(rotated.record.userId, 'user-1');
});

test('an unknown token is rejected without touching the store', async () => {
  const { refresh } = setup();
  assert.equal(await codeOf(refresh.rotate('never-issued-token')), 'invalid_token');
});

test('revoking is idempotent and safe on an unknown token', async () => {
  const { refresh } = setup();
  await refresh.revoke('never-issued-token');
  const { token } = await refresh.issue('user-1');
  await refresh.revoke(token);
  await refresh.revoke(token);
  assert.equal(await codeOf(refresh.rotate(token)), 'token_revoked');
});

test('one user rotating does not disturb another user tokens', async () => {
  const { refresh } = setup();
  const a = await refresh.issue('user-a');
  const b = await refresh.issue('user-b');

  await refresh.rotate(a.token);
  assert.equal(await codeOf(refresh.rotate(a.token)), 'token_reused');

  const rotatedB = await refresh.rotate(b.token);
  assert.equal(rotatedB.record.userId, 'user-b');
});
