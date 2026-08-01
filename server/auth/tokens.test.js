const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createTokenService } = require('./tokens');

const CONFIG = {
  jwtSecret: 'unit-test-secret',
  issuer: 'prepfusion-test',
  audience: 'prepfusion-web-test',
  accessTtlSeconds: 900,
  oauthStateTtlSeconds: 300
};

const USER = {
  id: 'user-1',
  email: 'student@example.com',
  name: 'Test Student',
  roles: ['user']
};

function serviceAt(nowMs) {
  return createTokenService({ ...CONFIG, now: () => nowMs });
}

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

test('an access token round-trips, carrying the user identity', () => {
  const tokens = serviceAt(Date.now());
  const claims = tokens.verifyAccessToken(tokens.signAccessToken(USER));
  assert.equal(claims.sub, 'user-1');
  assert.equal(claims.email, 'student@example.com');
  assert.deepEqual(claims.roles, ['user']);
});

test('an access token is scoped by issuer and audience', () => {
  const tokens = serviceAt(Date.now());
  const claims = tokens.verifyAccessToken(tokens.signAccessToken(USER));
  assert.equal(claims.iss, CONFIG.issuer);
  assert.equal(claims.aud, CONFIG.audience);
});

test('an access token is marked as an access token, so a state token cannot stand in for one', () => {
  const tokens = serviceAt(Date.now());
  const stateToken = tokens.signStateToken({ state: 's', verifier: 'v', provider: 'google' });
  assert.equal(codeOf(() => tokens.verifyAccessToken(stateToken)), 'invalid_token');
});

test('an access token expires', () => {
  const issuedAt = Date.now();
  const token = serviceAt(issuedAt).signAccessToken(USER);
  const later = serviceAt(issuedAt + (CONFIG.accessTtlSeconds + 60) * 1000);
  assert.equal(codeOf(() => later.verifyAccessToken(token)), 'token_expired');
});

test('an access token is still valid just before it expires', () => {
  const issuedAt = Date.now();
  const token = serviceAt(issuedAt).signAccessToken(USER);
  const justBefore = serviceAt(issuedAt + (CONFIG.accessTtlSeconds - 30) * 1000);
  assert.equal(justBefore.verifyAccessToken(token).sub, 'user-1');
});

test('a tampered payload is rejected', () => {
  const tokens = serviceAt(Date.now());
  const [header, payload, signature] = tokens.signAccessToken(USER).split('.');
  const forged = JSON.parse(Buffer.from(payload, 'base64url').toString());
  forged.sub = 'someone-else';
  const tampered = [header, Buffer.from(JSON.stringify(forged)).toString('base64url'), signature].join('.');
  assert.equal(codeOf(() => tokens.verifyAccessToken(tampered)), 'invalid_token');
});

test('a token signed with a different secret is rejected', () => {
  const tokens = serviceAt(Date.now());
  const foreign = jwt.sign({ sub: 'user-1', typ: 'access' }, 'attacker-secret', {
    issuer: CONFIG.issuer,
    audience: CONFIG.audience
  });
  assert.equal(codeOf(() => tokens.verifyAccessToken(foreign)), 'invalid_token');
});

// The classic JWT footgun: if the verifier honours the header's alg, an
// attacker signs with "none" (or swaps HS/RS) and forges any identity.
test('an alg:none token is rejected', () => {
  const tokens = serviceAt(Date.now());
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'admin', typ: 'access', iss: CONFIG.issuer, aud: CONFIG.audience })
  ).toString('base64url');
  assert.equal(codeOf(() => tokens.verifyAccessToken(`${header}.${payload}.`)), 'invalid_token');
});

test('a token issued for a different audience is rejected', () => {
  const tokens = serviceAt(Date.now());
  const foreign = jwt.sign({ sub: 'user-1', typ: 'access' }, CONFIG.jwtSecret, {
    issuer: CONFIG.issuer,
    audience: 'some-other-app'
  });
  assert.equal(codeOf(() => tokens.verifyAccessToken(foreign)), 'invalid_token');
});

test('a token from a different issuer is rejected', () => {
  const tokens = serviceAt(Date.now());
  const foreign = jwt.sign({ sub: 'user-1', typ: 'access' }, CONFIG.jwtSecret, {
    issuer: 'evil-issuer',
    audience: CONFIG.audience
  });
  assert.equal(codeOf(() => tokens.verifyAccessToken(foreign)), 'invalid_token');
});

test('garbage is rejected rather than throwing something unhandled', () => {
  const tokens = serviceAt(Date.now());
  for (const junk of ['', 'not-a-token', 'a.b.c', 'null', '...']) {
    assert.equal(codeOf(() => tokens.verifyAccessToken(junk)), 'invalid_token', `for input: ${junk}`);
  }
});

test('a state token round-trips the PKCE verifier it is bound to', () => {
  const tokens = serviceAt(Date.now());
  const payload = tokens.verifyStateToken(
    tokens.signStateToken({ state: 'abc', verifier: 'xyz', provider: 'google' })
  );
  assert.equal(payload.state, 'abc');
  assert.equal(payload.verifier, 'xyz');
  assert.equal(payload.provider, 'google');
});

test('a state token expires, so an abandoned login cannot be resumed later', () => {
  const issuedAt = Date.now();
  const token = serviceAt(issuedAt).signStateToken({ state: 'abc', verifier: 'xyz', provider: 'google' });
  const later = serviceAt(issuedAt + (CONFIG.oauthStateTtlSeconds + 60) * 1000);
  assert.equal(codeOf(() => later.verifyStateToken(token)), 'token_expired');
});

test('an access token cannot be replayed as a state token', () => {
  const tokens = serviceAt(Date.now());
  const accessToken = tokens.signAccessToken(USER);
  assert.equal(codeOf(() => tokens.verifyStateToken(accessToken)), 'invalid_token');
});

test('a refresh token is high-entropy and its hash is what gets stored', () => {
  const tokens = serviceAt(Date.now());
  const { token, hash } = tokens.generateRefreshToken();

  assert.ok(token.length >= 32, `refresh token too short: ${token.length}`);
  assert.notEqual(token, hash);
  // A leaked database must not yield usable tokens.
  assert.ok(!hash.includes(token));
  assert.equal(tokens.hashRefreshToken(token), hash);
});

test('refresh token hashing is deterministic and collision-free across tokens', () => {
  const tokens = serviceAt(Date.now());
  const hashes = new Set();
  for (let i = 0; i < 200; i += 1) {
    hashes.add(tokens.generateRefreshToken().hash);
  }
  assert.equal(hashes.size, 200);
});
