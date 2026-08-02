// Builds the Express app from injected dependencies. Split out of index.js so
// tests can boot the real app with in-memory stores, a fake OAuth provider and
// a controllable clock — no mongod, no network, no credentials.
//
// index.js is now just the production wiring: read env, build Mongo-backed
// stores, call createApp, listen.

const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const catalogRouter = require('./routes/catalog');
const questionsRouter = require('./routes/questions');
const assetsRouter = require('./routes/assets');
const { createAuthRouter } = require('./routes/auth');
const { createBookmarksRouter } = require('./routes/bookmarks');
const { createReportsRouter } = require('./routes/reports');
const { createRatingsRouter } = require('./routes/ratings');
const { createNotificationsRouter } = require('./routes/notifications');
const { createTokenService } = require('./auth/tokens');
const { createRefreshService } = require('./auth/refreshTokens');
const { createRequireAuth, createOptionalAuth } = require('./auth/middleware');
const { resolveProviders } = require('./auth/providers');
const mongo = require('./store/mongo');

function createApp({ stores, config: rawConfig, now = Date.now }) {
  const app = express();

  // Config supplies credentials and (in tests) endpoint overrides; the rest of
  // each provider's behaviour — claim mapping, accepted issuers — comes from
  // the built-in definition.
  const config = { ...rawConfig, providers: resolveProviders(rawConfig.providers) };

  app.use(express.json());
  app.use(cookieParser());

  const tokens = createTokenService({
    jwtSecret: config.jwtSecret,
    issuer: config.issuer,
    audience: config.audience,
    accessTtlSeconds: config.accessTtlSeconds,
    oauthStateTtlSeconds: config.oauthStateTtlSeconds,
    now
  });

  const refreshService = createRefreshService({
    store: stores.refreshTokens,
    tokens,
    refreshTtlDays: config.refreshTtlDays,
    now
  });

  const requireAuth = createRequireAuth(tokens);
  const optionalAuth = createOptionalAuth(tokens);

  app.get('/health', async (req, res) => {
    let db = false;
    try {
      db = await mongo.ping();
    } catch (error) {
      db = false;
    }
    res.json({
      ok: db,
      hasToken: Boolean(process.env.GITHUB_TOKEN),
      db: db ? 'up' : 'down',
      database: mongo.databaseName()
    });
  });

  app.use('/api/auth', createAuthRouter({ stores, config, tokens, refreshService, requireAuth, now }));
  app.use('/api/bookmarks', createBookmarksRouter({ store: stores.bookmarks, requireAuth, now }));
  app.use('/api/reports', createReportsRouter({ store: stores.reports, requireAuth, now }));
  app.use('/api/ratings', createRatingsRouter({ store: stores.ratings, requireAuth, now }));
  app.use(
    '/api/notifications',
    createNotificationsRouter({ store: stores.notifications, requireAuth, now })
  );

  // Browsing stays open to everyone; optionalAuth only attaches req.user when
  // a token happens to be present, so these routes can personalise later
  // without ever turning anyone away.
  app.use('/api', optionalAuth, catalogRouter);
  app.use('/api', optionalAuth, questionsRouter);
  app.use('/assets', assetsRouter);

  // Serve the built user UI in production; in dev, run `npm run dev` inside web/ separately.
  const webDist = path.join(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: error.message });
  });

  return app;
}

module.exports = { createApp };
