const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createVerifier, challengeFor, createState } = require('./pkce');

// RFC 7636 §4.1: the verifier is 43-128 characters from an unreserved set.
// Getting this wrong is silent — Google accepts a short verifier and the
// downgrade only shows up as weakened protection, never as an error.
test('a PKCE verifier is within the length RFC 7636 requires', () => {
  const verifier = createVerifier();
  assert.ok(verifier.length >= 43, `expected >= 43 chars, got ${verifier.length}`);
  assert.ok(verifier.length <= 128, `expected <= 128 chars, got ${verifier.length}`);
});

test('a PKCE verifier uses only unreserved characters', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(createVerifier(), /^[A-Za-z0-9\-._~]+$/);
  }
});

test('every verifier is distinct', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    seen.add(createVerifier());
  }
  assert.equal(seen.size, 200);
});

test('the challenge is the base64url SHA-256 of the verifier (S256)', () => {
  const verifier = createVerifier();
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  assert.equal(challengeFor(verifier), expected);
});

test('the challenge carries no base64 padding', () => {
  assert.ok(!challengeFor(createVerifier()).includes('='));
});

test('state values are distinct and long enough to be unguessable', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const state = createState();
    assert.ok(state.length >= 22, `state too short: ${state.length}`);
    seen.add(state);
  }
  assert.equal(seen.size, 200);
});
