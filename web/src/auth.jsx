import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';

// Session state for the whole app.
//
// The access token is held in memory only — never localStorage, which any XSS
// on the page could read. It is short-lived; the durable credential is the
// httpOnly pf_refresh cookie the browser holds and JavaScript cannot touch.
// So "am I signed in?" is answered by asking the server to mint a fresh access
// token from that cookie.

const AuthContext = createContext(null);

// Refresh this many seconds before the token actually expires, so an in-flight
// request never races the expiry.
const REFRESH_MARGIN_SECONDS = 60;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | signed-in | signed-out
  const accessTokenRef = useRef(null);
  const timerRef = useRef(null);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus('signed-out');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    accessTokenRef.current = data.accessToken;
    setUser(data.user);
    setStatus('signed-in');

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const delay = Math.max(30, (data.expiresIn || 900) - REFRESH_MARGIN_SECONDS) * 1000;
    timerRef.current = setTimeout(() => {
      refresh().catch(() => clearSession());
    }, delay);

    return data.accessToken;
  }, [clearSession]);

  // On load we don't know whether the cookie exists, so we simply try.
  useEffect(() => {
    refresh().catch(() => clearSession());
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [refresh, clearSession]);

  const signIn = useCallback(() => {
    // A full navigation, not fetch: the provider needs to own the browser to
    // show its consent screen.
    window.location.href = '/api/auth/google/start';
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  // Wraps fetch with the bearer token, retrying once if the token expired
  // while sitting in a tab — the server reports that case distinctly so we can
  // tell it apart from "you are not signed in".
  const authFetch = useCallback(
    async (path, options = {}) => {
      const send = (token) =>
        fetch(path, {
          ...options,
          headers: {
            ...(options.headers || {}),
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

      let res = await send(accessTokenRef.current);
      if (res.status === 401) {
        const body = await res.clone().json().catch(() => ({}));
        if (body.code === 'token_expired' || !accessTokenRef.current) {
          const token = await refresh();
          if (token) {
            res = await send(token);
          }
        }
      }
      return res;
    },
    [refresh]
  );

  // Folded into the session rather than fetched separately: the signed-in user
  // already carries its username (null when unchosen), so the gate can decide
  // on the first render instead of flashing the app and then covering it.
  const applyUser = useCallback((updated) => setUser(updated), []);

  const value = useMemo(
    () => ({
      user,
      status,
      isSignedIn: status === 'signed-in',
      needsUsername: status === 'signed-in' && Boolean(user) && !user.username,
      applyUser,
      signIn,
      signOut,
      authFetch,
      refresh
    }),
    [user, status, applyUser, signIn, signOut, authFetch, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
