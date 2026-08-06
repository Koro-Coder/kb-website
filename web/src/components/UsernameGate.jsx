import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { getUsernameSuggestion, checkUsername, chooseUsername } from '../api.js';
import Brand from './Brand.jsx';

// Shown once, over everything, the first time someone signs in without a
// username. There is no dismiss: a username is required, so an escape hatch
// would only produce accounts that never got one.
//
// Rules mirror server/auth/usernames.js. Duplicated deliberately rather than
// shared: this copy exists to answer instantly as you type, and the server's
// copy is the one that decides. Change one, change the other.
const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
const ALLOWED = /^[A-Za-z0-9]+$/;

function localCheck(value) {
  const username = value.trim();
  if (!username) return 'Choose a username.';
  if (/\s/.test(username)) return 'No spaces — letters and numbers only.';
  if (!ALLOWED.test(username)) return 'Letters and numbers only — no spaces or symbols.';
  if (username.length < MIN_LENGTH) return `At least ${MIN_LENGTH} characters.`;
  if (username.length > MAX_LENGTH) return `At most ${MAX_LENGTH} characters.`;
  return null;
}

export default function UsernameGate() {
  const { needsUsername, user, authFetch, applyUser, signOut } = useAuth();
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [availability, setAvailability] = useState(null); // null | 'free' | 'taken'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Pre-fill with the server's suggestion, which is derived from the profile
  // name and already avoids anything taken. It is a starting point, not a
  // claim — nothing is reserved until Save.
  useEffect(() => {
    if (!needsUsername || loaded) {
      return undefined;
    }
    let cancelled = false;
    getUsernameSuggestion(authFetch)
      .then((data) => {
        if (cancelled) return;
        setValue(data.suggestion || '');
        setLoaded(true);
      })
      .catch(() => {
        // A failed suggestion must not trap anyone behind an empty, disabled
        // form — fall back to typing their own.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsUsername, loaded, authFetch]);

  useEffect(() => {
    if (loaded && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [loaded]);

  // Availability, debounced. Only asked once the value is locally valid, so a
  // half-typed name does not generate a request per keystroke.
  useEffect(() => {
    if (!needsUsername || localCheck(value)) {
      setAvailability(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      checkUsername(authFetch, value.trim())
        .then((data) => {
          if (!cancelled) setAvailability(data.available ? 'free' : 'taken');
        })
        .catch(() => {
          if (!cancelled) setAvailability(null);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, needsUsername, authFetch]);

  if (!needsUsername) {
    return null;
  }

  const problem = localCheck(value);
  const submit = async (event) => {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The response is the updated user, so the session picks up the username
      // without a round trip through refresh.
      applyUser(await chooseUsername(authFetch, value.trim()));
    } catch (e) {
      setError(e.message);
      setAvailability('taken');
      setBusy(false);
    }
  };

  return (
    <div className="username-gate" role="dialog" aria-modal="true" aria-labelledby="username-gate-title">
      <div className="username-card">
        <Brand large />
        <h2 id="username-gate-title">Choose your username</h2>
        <p className="muted">
          This is how you'll be known on PrepFusion. Letters and numbers only, and{' '}
          <strong>it can't be changed later</strong> — so pick one you'll be happy with.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="username-input">Username</label>
          <input
            id="username-input"
            ref={inputRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
            maxLength={MAX_LENGTH}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
            disabled={busy}
            aria-describedby="username-hint"
          />

          {/* "taken" counts as bad too: it blocks the button just as a bad
              character does, so it must not read as neutral advice. */}
          <p
            id="username-hint"
            className={`username-hint${
              error || (value && problem) || availability === 'taken' ? ' is-bad' : ''
            }`}
          >
            {error ||
              (value && problem) ||
              (availability === 'taken' && 'That username is taken.') ||
              (availability === 'free' && `${value.trim()} is available.`) ||
              `${MIN_LENGTH}–${MAX_LENGTH} characters, letters and numbers only.`}
          </p>

          <button type="submit" className="btn-primary" disabled={busy || Boolean(problem) || availability === 'taken'}>
            {busy ? 'Saving…' : 'Save username'}
          </button>
        </form>

        {/* The only way out other than choosing: someone who signed in with the
            wrong Google account must not be stuck here. */}
        <p className="username-escape muted small">
          Signed in as {user.email}.{' '}
          <button className="link" onClick={signOut} disabled={busy}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
