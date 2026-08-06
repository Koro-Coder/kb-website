const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_LENGTH,
  usernameKey,
  validateUsername,
  baseFromProfile,
  suggestUsername
} = require('./usernames');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('alphanumeric names of a sane length are accepted, and the chosen casing is kept', () => {
  for (const name of ['abhishek', 'Abhishek', 'user42', 'A1b2C3', 'abc']) {
    const result = validateUsername(name);
    assert.equal(result.ok, true, `${name} should be valid`);
    assert.equal(result.username, name, 'the casing the user typed must survive');
  }
});

test('a space anywhere is rejected, not just a leading one', () => {
  for (const name of [' abhishek', 'abhishek ', 'abhi shek', 'abhi\tshek']) {
    const result = validateUsername(name);
    if (name.trim().includes(' ') || name.trim().includes('\t')) {
      assert.equal(result.ok, false, `${JSON.stringify(name)} should be rejected`);
      assert.match(result.error, /space/i);
    } else {
      // Surrounding whitespace is trimmed rather than refused — it is almost
      // always a paste artefact, not an intent.
      assert.equal(result.ok, true, `${JSON.stringify(name)} should be trimmed and accepted`);
      assert.equal(result.username, 'abhishek');
    }
  }
});

test('anything that is not a letter or a digit is rejected', () => {
  for (const name of ['abhi_shek', 'abhi-shek', 'abhi.shek', 'abhi@shek', 'абхишек', 'emoji🙂name']) {
    const result = validateUsername(name);
    assert.equal(result.ok, false, `${name} should be rejected`);
  }
});

test('length bounds are enforced at both ends', () => {
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('abc').ok, true);
  assert.equal(validateUsername('a'.repeat(MAX_LENGTH)).ok, true);
  assert.equal(validateUsername('a'.repeat(MAX_LENGTH + 1)).ok, false);
});

test('empty input asks for a username rather than complaining about characters', () => {
  for (const value of ['', '   ', null, undefined]) {
    const result = validateUsername(value);
    assert.equal(result.ok, false);
    assert.match(result.error, /choose a username/i);
  }
});

test('reserved names are refused regardless of casing', () => {
  for (const name of ['admin', 'ADMIN', 'PrepFusion', 'support']) {
    const result = validateUsername(name);
    assert.equal(result.ok, false, `${name} should be reserved`);
    assert.match(result.error, /reserved/i);
  }
});

// ---------------------------------------------------------------------------
// Uniqueness key
// ---------------------------------------------------------------------------

test('uniqueness is case-insensitive, so two spellings of one name collide', () => {
  assert.equal(usernameKey('Abhishek'), usernameKey('abhishek'));
  assert.equal(usernameKey('  ABHISHEK  '), 'abhishek');
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

test('a suggestion is built from the name, with everything unusable stripped', () => {
  assert.equal(baseFromProfile({ name: 'Abhishek Aggarwal' }), 'AbhishekAggarwal');
  assert.equal(baseFromProfile({ name: "O'Brien-Smith" }), 'OBrienSmith');
});

test('a name we cannot use falls back to the email, then to a generic stem', () => {
  assert.equal(baseFromProfile({ name: '李雷', email: 'li.lei@example.com' }), 'lilei');
  assert.equal(baseFromProfile({ name: '', email: 'a@example.com' }), 'prepper');
  assert.equal(baseFromProfile({}), 'prepper');
});

test('a suggestion never exceeds the length its own validator allows', () => {
  const base = baseFromProfile({ name: 'Bartholomew Fitzwilliam Montgomery' });
  assert.ok(base.length <= MAX_LENGTH);
  assert.equal(validateUsername(base).ok, true);
});

test('a taken suggestion is suffixed until it is free', async () => {
  const taken = new Set(['abhishek', 'abhishek2']);
  const suggestion = await suggestUsername({ name: 'Abhishek' }, async (key) => taken.has(key));
  assert.equal(suggestion, 'Abhishek3');
});

test('suffixing a maximum-length name stays within the limit', async () => {
  const longName = 'a'.repeat(MAX_LENGTH);
  const suggestion = await suggestUsername({ name: longName }, async (key) => key === longName);
  assert.ok(suggestion.length <= MAX_LENGTH, `${suggestion} is ${suggestion.length} characters`);
  assert.equal(validateUsername(suggestion).ok, true);
});

test('a free suggestion is offered unchanged', async () => {
  const suggestion = await suggestUsername({ name: 'Abhishek Aggarwal' }, async () => false);
  assert.equal(suggestion, 'AbhishekAggarwal');
});
