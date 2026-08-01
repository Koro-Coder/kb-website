// Access-token gates. The site stays fully readable without signing in — only
// the routes that write something a user owns are wrapped in requireAuth.

const { AuthError } = require('./errors');

function bearerFrom(req) {
  const header = req.get('authorization') || '';
  const [scheme, ...rest] = header.split(' ');
  if (!/^Bearer$/i.test(scheme)) {
    return null;
  }
  const token = rest.join(' ').trim();
  return token || null;
}

function toPublicUser(claims) {
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    roles: claims.roles || ['user']
  };
}

function createRequireAuth(tokens) {
  return function requireAuth(req, res, next) {
    const token = bearerFrom(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
      return;
    }
    try {
      req.user = toPublicUser(tokens.verifyAccessToken(token));
      next();
    } catch (error) {
      const authError = error instanceof AuthError ? error : new AuthError('invalid_token', 'Token is not valid');
      // `token_expired` is surfaced verbatim so the SPA knows to refresh
      // rather than send the user back to a sign-in screen.
      res.status(401).json({ error: authError.message, code: authError.code });
    }
  };
}

// For routes that render differently when signed in but must not 401 —
// e.g. showing whether a question is already bookmarked.
function createOptionalAuth(tokens) {
  return function optionalAuth(req, res, next) {
    const token = bearerFrom(req);
    if (token) {
      try {
        req.user = toPublicUser(tokens.verifyAccessToken(token));
      } catch (error) {
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  };
}

module.exports = { createRequireAuth, createOptionalAuth, bearerFrom, toPublicUser };
