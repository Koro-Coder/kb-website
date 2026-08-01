const express = require('express');
const path = require('path');
const fs = require('fs');
const catalogRouter = require('./routes/catalog');
const questionsRouter = require('./routes/questions');
const assetsRouter = require('./routes/assets');
const mongo = require('./store/mongo');

const app = express();

// `ok` now reflects database reachability too — with the knowledge base over
// the network, a process that is listening is no longer proof it can serve.
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

app.use('/api', catalogRouter);
app.use('/api', questionsRouter);
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

const port = process.env.PORT || 4002;

// Connect before listening so a bad MONGODB_URI fails loudly at startup
// instead of turning every request into a 500.
mongo
  .ping()
  .then(() => {
    app.listen(port, () => {
      console.log(`kb-website API listening on http://localhost:${port} (db: ${mongo.databaseName()})`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });
