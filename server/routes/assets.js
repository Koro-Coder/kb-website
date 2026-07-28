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

async function serveFromRepo(res, repo, relativePath, extension) {
  const fullPath = repo.rootPath ? `${repo.rootPath}/${relativePath}` : relativePath;
  const buffer = await github.getFileBuffer(repo.owner, repo.name || repo.repo, repo.branch, fullPath, getToken());
  res.set('Content-Type', CONTENT_TYPES[extension]);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(buffer);
}

// Solution figures live in the SOLUTIONS repo (img/<chapter>_solutions/...),
// which is a different repo from the questions. Falls back to the question
// repo because some subjects (Aptitude) keep an identical img/ tree in both.
router.get('/solution/:bookId/*', async (req, res) => {
  const relativePath = req.params[0];
  const extension = extensionOf(relativePath);
  if (!CONTENT_TYPES[extension]) {
    res.status(404).send('Not found');
    return;
  }

  let book;
  try {
    book = kbStore.readBook(req.params.bookId);
  } catch (error) {
    res.status(404).send('Not found');
    return;
  }

  if (book.solutionRepo) {
    try {
      await serveFromRepo(res, book.solutionRepo, relativePath, extension);
      return;
    } catch (error) {
      // fall through to the question repo
    }
  }
  try {
    await serveFromRepo(res, book.repo, relativePath, extension);
  } catch (error) {
    res.status(404).send('Not found');
  }
});

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
    await serveFromRepo(res, book.repo, relativePath, extension);
  } catch (error) {
    res.status(404).send('Not found');
  }
});

module.exports = router;
