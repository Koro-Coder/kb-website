const express = require('express');
const { createVerifier, challengeFor, createState } = require('../auth/pkce');
const { decodeIdToken, validateIdTokenClaims } = require('../auth/providers');
const { AuthError } = require('../auth/errors');

// Cookie carrying the in-flight OAuth transaction (state + PKCE verifier).
const OAUTH_COOKIE = 'pf_oauth';
// Cookie carrying the refresh token. Scoped to /api/auth so it is not sent on
// every ordinary API call — less exposure, and nothing else needs it.
const REFRESH_COOKIE = 'pf_refresh';
const COOKIE_PATH = '/api/auth';

function createAuthRouter({ stores, config, tokens, refreshService, requireAuth, now = Date.now }) {
  const router = express.Router();
  const providers = config.providers;

  function cookieOptions(maxAgeMs) {
    return {
      httpOnly: true, // keeps the token out of reach of any XSS on the page
      sameSite: 'lax', // still sent on the provider's top-level redirect back
      secure: Boolean(config.secureCookies),
      path: COOKIE_PATH,
      maxAge: maxAgeMs
    };
  }

  function callbackUrl(req, providerId) {
    const base = config.apiBaseUrl || `${req.protocol}://${req.get('host')}`;
    return `${base}/api/auth/${providerId}/callback`;
  }

  function appRedirect(params) {
    const url = new URL(config.appUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  function publicUser(user) {
    // Deliberately narrow: the provider's user id and internal bookkeeping
    // never reach the browser.
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl || null,
      roles: user.roles || ['user'],
      createdAt: user.createdAt
    };
  }

  function issueSession(res, user) {
    return refreshService.issue(user.id).then(({ token }) => {
      res.cookie(REFRESH_COOKIE, token, cookieOptions(config.refreshTtlDays * 24 * 60 * 60 * 1000));
      return token;
    });
  }

  // --- Step 1: send the browser to the provider ---------------------------
  router.get('/:provider/start', (req, res) => {
    const provider = providers[req.params.provider];
    if (!provider) {
      res.status(404).json({ error: `Unknown provider: ${req.params.provider}` });
      return;
    }

    const verifier = createVerifier();
    const state = createState();

    // The state lives in a signed, httpOnly cookie rather than server memory,
    // so the callback can be served by any instance without shared session
    // storage.
    res.cookie(
      OAUTH_COOKIE,
      tokens.signStateToken({ state, verifier, provider: provider.id }),
      cookieOptions(config.oauthStateTtlSeconds * 1000)
    );

    const url = new URL(provider.authorizeUrl);
    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('redirect_uri', callbackUrl(req, provider.id));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challengeFor(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    // Needed to be offered an account chooser rather than silently reusing
    // whichever Google session the browser already has.
    url.searchParams.set('prompt', 'select_account');

    res.redirect(302, url.toString());
  });

  // --- Step 2: the provider sends the browser back ------------------------
  router.get('/:provider/callback', async (req, res) => {
    const provider = providers[req.params.provider];
    if (!provider) {
      res.status(404).json({ error: `Unknown provider: ${req.params.provider}` });
      return;
    }

    // The user declined, or the provider refused. That is a normal outcome,
    // not an error page — send them back to the app with a reason.
    if (req.query.error) {
      res.clearCookie(OAUTH_COOKIE, { path: COOKIE_PATH });
      res.redirect(302, appRedirect({ auth_error: String(req.query.error) }));
      return;
    }

    const stateCookie = req.cookies ? req.cookies[OAUTH_COOKIE] : null;
    if (!stateCookie) {
      res.status(400).json({ error: 'Missing OAuth state cookie; the login may have expired' });
      return;
    }

    let transaction;
    try {
      transaction = tokens.verifyStateToken(stateCookie);
    } catch (error) {
      res.status(400).json({ error: 'OAuth state is invalid or expired' });
      return;
    }

    // The CSRF check: an attacker can make the browser hit this URL, but
    // cannot forge a state matching the victim's httpOnly cookie.
    if (!req.query.state || req.query.state !== transaction.state) {
      res.status(400).json({ error: 'OAuth state mismatch' });
      return;
    }
    if (transaction.provider !== provider.id) {
      res.status(400).json({ error: 'OAuth state was issued for a different provider' });
      return;
    }

    // One-shot: clearing before the exchange stops the same state being
    // replayed with a second code.
    res.clearCookie(OAUTH_COOKIE, { path: COOKIE_PATH });

    if (!req.query.code) {
      res.status(400).json({ error: 'No authorization code returned' });
      return;
    }

    let tokenResponse;
    try {
      tokenResponse = await exchangeCode({
        provider,
        code: String(req.query.code),
        verifier: transaction.verifier,
        redirectUri: callbackUrl(req, provider.id)
      });
    } catch (error) {
      const status = error.code === 'provider_rejected' ? 401 : 502;
      res.status(status).json({ error: error.message, code: error.code });
      return;
    }

    let profile;
    try {
      const claims = decodeIdToken(tokenResponse.id_token);
      validateIdTokenClaims(claims, provider, now());
      profile = provider.profileFromClaims(claims);
    } catch (error) {
      const authError = error instanceof AuthError ? error : new AuthError('invalid_id_token', 'Bad id_token');
      res.status(401).json({ error: authError.message, code: authError.code });
      return;
    }

    // Anyone can register a Google account asserting an address they do not
    // control; only the verified flag makes the email trustworthy as identity.
    if (!profile.emailVerified) {
      res.status(403).json({
        error: 'Your provider account has no verified email address',
        code: 'email_unverified'
      });
      return;
    }

    const timestamp = new Date(now()).toISOString();
    let user = await stores.users.findByProvider(provider.id, profile.providerUserId);
    const isNewUser = !user;

    if (isNewUser) {
      user = await stores.users.create({
        provider: provider.id,
        providerUserId: profile.providerUserId,
        email: profile.email,
        emailVerified: true,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        roles: ['user'],
        createdAt: timestamp,
        lastLoginAt: timestamp
      });
    } else {
      await stores.users.recordLogin(user.id, timestamp);
    }

    await issueSession(res, user);

    // The access token is not put in the URL — it would leak through browser
    // history and Referer. The SPA calls /api/auth/refresh on load instead.
    res.redirect(
      302,
      appRedirect(isNewUser ? { signed_in: '1', new_user: '1' } : { signed_in: '1' })
    );
  });

  // --- Step 3: trade the refresh cookie for an access token ---------------
  router.post('/refresh', async (req, res) => {
    const token = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
    if (!token) {
      res.status(401).json({ error: 'No session', code: 'unauthenticated' });
      return;
    }

    let rotated;
    try {
      rotated = await refreshService.rotate(token);
    } catch (error) {
      const code = error instanceof AuthError ? error.code : 'invalid_token';
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      res.status(401).json({ error: 'Session is no longer valid', code });
      return;
    }

    const user = await stores.users.findById(rotated.record.userId);
    if (!user) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      res.status(401).json({ error: 'Session is no longer valid', code: 'unknown_user' });
      return;
    }

    res.cookie(REFRESH_COOKIE, rotated.token, cookieOptions(config.refreshTtlDays * 24 * 60 * 60 * 1000));
    res.json({
      accessToken: tokens.signAccessToken(user),
      expiresIn: config.accessTtlSeconds,
      user: publicUser(user)
    });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
    // Only this token is revoked, not the family: signing out of one device
    // must leave the user's other devices signed in.
    await refreshService.revoke(token);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await stores.users.findById(req.user.id);
    if (!user) {
      res.status(401).json({ error: 'Session is no longer valid', code: 'unknown_user' });
      return;
    }
    res.json(publicUser(user));
  });

  return router;
}

// Exchanges the authorization code, distinguishing "the provider said no"
// (a 4xx — bad or replayed code) from "the provider is broken" (anything
// else), because the first is the user's problem and the second is ours.
async function exchangeCode({ provider, code, verifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  let response;
  try {
    response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    });
  } catch (error) {
    throw new AuthError('provider_unreachable', `Could not reach ${provider.id}: ${error.message}`, 502);
  }

  if (response.status >= 500) {
    throw new AuthError('provider_unavailable', `${provider.id} token endpoint failed`, 502);
  }
  if (!response.ok) {
    throw new AuthError('provider_rejected', 'Authorization code was rejected', 401);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new AuthError('provider_unavailable', 'Token endpoint returned unreadable JSON', 502);
  }
}

module.exports = { createAuthRouter, OAUTH_COOKIE, REFRESH_COOKIE, COOKIE_PATH };
