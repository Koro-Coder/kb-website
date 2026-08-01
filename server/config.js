// Turns environment variables into the config object createApp expects.
// Kept separate from index.js so the shape is one readable thing, and so the
// tests can construct an equivalent object without touching process.env.

const crypto = require('crypto');

function readProviders(env) {
  const providers = {};
  // A provider is only offered if it is actually configured. With none set,
  // /api/auth/<provider>/start simply 404s and the site stays fully browsable
  // — signing in is the only thing unavailable.
  if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET
    };
  }
  return providers;
}

function readJwtSecret(env, warn) {
  if (env.AUTH_JWT_SECRET) {
    return env.AUTH_JWT_SECRET;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('AUTH_JWT_SECRET must be set in production');
  }
  // Dev convenience only. An ephemeral secret means every restart invalidates
  // outstanding sessions, which is noisy but harmless locally.
  warn(
    'AUTH_JWT_SECRET is not set — using a random per-process secret. ' +
      'Sessions will not survive a restart. Set AUTH_JWT_SECRET in .env to fix.'
  );
  return crypto.randomBytes(32).toString('base64url');
}

function configFromEnv(env = process.env, warn = console.warn) {
  const providers = readProviders(env);

  if (Object.keys(providers).length === 0) {
    warn(
      'No OAuth provider configured (set GOOGLE_OAUTH_CLIENT_ID and ' +
        'GOOGLE_OAUTH_CLIENT_SECRET) — sign-in is disabled.'
    );
  }

  return {
    jwtSecret: readJwtSecret(env, warn),
    issuer: env.AUTH_ISSUER || 'prepfusion',
    audience: env.AUTH_AUDIENCE || 'prepfusion-web',
    accessTtlSeconds: Number(env.AUTH_ACCESS_TTL_SECONDS || 900),
    refreshTtlDays: Number(env.AUTH_REFRESH_TTL_DAYS || 30),
    oauthStateTtlSeconds: Number(env.AUTH_OAUTH_STATE_TTL_SECONDS || 300),
    // Where the browser is sent after the provider redirect completes.
    appUrl: env.APP_URL || 'http://localhost:5174',
    // Only needed behind a proxy, where the request's own host header is not
    // the public origin the provider redirected to.
    apiBaseUrl: env.API_BASE_URL || null,
    secureCookies: env.NODE_ENV === 'production',
    providers
  };
}

module.exports = { configFromEnv };
