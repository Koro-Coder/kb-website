// Username rules, kept free of any I/O so they can be tested directly and so
// the client can mirror them without importing server code.
//
// A username is permanent once set (see setUsername in the user stores), which
// is why the checks here are strict: there is no "fix it later".

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

// Alphanumeric only, as specified — no spaces, no punctuation, no underscores
// or hyphens. Anchored, so a space anywhere in the string fails rather than
// only a leading one.
const ALLOWED = /^[A-Za-z0-9]+$/;

// Reserved so a username can never be mistaken for one of our own paths or for
// an official account. Compared against the lowercase key, like uniqueness is.
const RESERVED = new Set([
  'admin',
  'administrator',
  'prepfusion',
  'support',
  'help',
  'root',
  'system',
  'moderator',
  'official',
  'api',
  'null',
  'undefined'
]);

function normaliseUsername(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

// Uniqueness is case-insensitive: "Abhishek" and "abhishek" are the same person
// to a reader, so they must not both exist. The chosen casing is still stored
// and displayed; this is only the key it is compared on.
function usernameKey(value) {
  return normaliseUsername(value).toLowerCase();
}

function validateUsername(value) {
  const username = normaliseUsername(value);

  if (!username) {
    return { ok: false, error: 'Choose a username.' };
  }
  // Checked before the length rules so "abc def" is told what is actually
  // wrong with it rather than being called too long.
  if (/\s/.test(username)) {
    return { ok: false, error: 'No spaces — letters and numbers only.' };
  }
  if (!ALLOWED.test(username)) {
    return { ok: false, error: 'Letters and numbers only — no spaces or symbols.' };
  }
  if (username.length < MIN_LENGTH) {
    return { ok: false, error: `At least ${MIN_LENGTH} characters.` };
  }
  if (username.length > MAX_LENGTH) {
    return { ok: false, error: `At most ${MAX_LENGTH} characters.` };
  }
  if (RESERVED.has(username.toLowerCase())) {
    return { ok: false, error: 'That username is reserved.' };
  }

  return { ok: true, username };
}

// The starting point offered to a new account: their own name with everything
// unusable stripped out. Falls back to the email's local part, then to a
// generic stem — a profile can legitimately have a name we cannot use at all
// (non-Latin script, or "李雷"), and that must still produce a suggestion
// rather than an empty box.
function baseFromProfile({ name, email } = {}) {
  const fromName = String(name || '').replace(/[^A-Za-z0-9]/g, '');
  if (fromName.length >= MIN_LENGTH) {
    return fromName.slice(0, MAX_LENGTH);
  }

  const localPart = String(email || '').split('@')[0];
  const fromEmail = localPart.replace(/[^A-Za-z0-9]/g, '');
  if (fromEmail.length >= MIN_LENGTH) {
    return fromEmail.slice(0, MAX_LENGTH);
  }

  return 'prepper';
}

// Walks numeric suffixes until one is free. The base is trimmed to leave room
// for the suffix, so a 20-character name does not produce a 21-character
// suggestion that its own validator would then reject.
async function suggestUsername(profile, isTaken) {
  const base = baseFromProfile(profile);

  if (!(await isTaken(usernameKey(base)))) {
    return base;
  }

  for (let n = 2; n <= 99; n += 1) {
    const suffix = String(n);
    const candidate = base.slice(0, MAX_LENGTH - suffix.length) + suffix;
    if (!(await isTaken(usernameKey(candidate)))) {
      return candidate;
    }
  }

  // Every short suffix is spoken for. Four random digits is not a guarantee,
  // but the caller treats a suggestion as a starting point, not a claim — the
  // uniqueness check at write time is what actually decides.
  const random = String(Math.floor(1000 + Math.random() * 9000));
  return base.slice(0, MAX_LENGTH - random.length) + random;
}

module.exports = {
  MIN_LENGTH,
  MAX_LENGTH,
  RESERVED,
  normaliseUsername,
  usernameKey,
  validateUsername,
  baseFromProfile,
  suggestUsername
};
