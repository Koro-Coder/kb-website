const express = require('express');
const kbStore = require('../store/kbStore');
const github = require('../github/client');

const router = express.Router();

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function getToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set in the environment');
  }
  return token;
}

function extensionOf(filePath) {
  const idx = filePath.lastIndexOf('.');
  return idx === -1 ? '' : filePath.slice(idx).toLowerCase();
}

// /assets/:bookId/<repo-root-relative image path, as stored in question body.src>
router.get('/:bookId/*', async (req, res) => {
  const relativePath = req.params[0];
  const extension = extensionOf(relativePath);
  if (!CONTENT_TYPES[extension]) {
    res.status(404).send('Not found');
    return;
  }

  try {
    const book = kbStore.readBook(req.params.bookId);
    const { owner, name, branch, rootPath } = book.repo;
    const fullPath = rootPath ? `${rootPath}/${relativePath}` : relativePath;
    const buffer = await github.getFileBuffer(owner, name, branch, fullPath, getToken());
    res.set('Content-Type', CONTENT_TYPES[extension]);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    res.status(404).send('Not found');
  }
});

module.exports = router;
