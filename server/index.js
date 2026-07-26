const express = require('express');
const path = require('path');
const fs = require('fs');
const catalogRouter = require('./routes/catalog');
const questionsRouter = require('./routes/questions');
const assetsRouter = require('./routes/assets');

const app = express();

app.get('/health', (req, res) => {
  res.json({ ok: true, hasToken: Boolean(process.env.GITHUB_TOKEN) });
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
app.listen(port, () => {
  console.log(`kb-website API listening on http://localhost:${port}`);
});
