// Production wiring only: read the environment, build the Mongo-backed
// stores, and start listening. Everything else lives in app.js so the same
// app can be built in tests with in-memory stores.

const { createApp } = require('./app');
const { configFromEnv } = require('./config');
const { createStores } = require('./store/authStores');
const mongo = require('./store/mongo');

const config = configFromEnv();
const app = createApp({ stores: createStores(), config });

const port = process.env.PORT || 4002;

// Connect before listening so a bad MONGODB_URI fails loudly at startup
// instead of turning every request into a 500.
mongo
  .ping()
  .then(() => mongo.ensureAuthIndexes())
  .then(() => {
    app.listen(port, () => {
      const providers = Object.keys(config.providers);
      console.log(
        `kb-website API listening on http://localhost:${port} ` +
          `(db: ${mongo.databaseName()}, auth: ${providers.length ? providers.join(', ') : 'disabled'})`
      );
    });
  })
  .catch((error) => {
    console.error('Failed to start:', error.message);
    process.exit(1);
  });
