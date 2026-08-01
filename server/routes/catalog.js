const express = require('express');
const kbStore = require('../store/kbStore');

const router = express.Router();

// The store is over the network now, so a failed read is no longer proof that
// the book is missing. Only kbStore's own not-found error becomes a 404;
// anything else (connection refused, auth, timeout) must surface as a 500.
function isNotFound(error) {
  return /^Book not found:/.test(error.message);
}

router.get('/subjects', async (req, res) => {
  try {
    const catalog = await kbStore.readCatalog();
    const subjects = catalog.subjects.map((s) => ({
      ...s,
      bookCount: catalog.books.filter((b) => b.subject === s.key).length
    }));
    res.json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/subjects/:subject/books', async (req, res) => {
  try {
    const catalog = await kbStore.readCatalog();
    const books = catalog.books.filter((b) => b.subject === req.params.subject);
    res.json(books);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Merges every registered book's hierarchy into one subject-wide navigation
// tree, so "book" (= one repo) never has to be a concept the site's UI
// exposes. Every node is either a branch node ({key,label,children}) or a
// leaf node ({key,label,leaf:{bookId,fileId}}) pointing at a specific tex
// file — the frontend renders both shapes generically.
//
// The builders are async because each book is a separate database read. The
// reads are issued together rather than in sequence, so tree cost stays one
// round trip regardless of how many books a subject has.
async function loadBooks(summaries) {
  return Promise.all(summaries.map((summary) => kbStore.readBook(summary.bookId)));
}

async function buildAptitudeTree(summaries) {
  const years = new Map();
  for (const book of await loadBooks(summaries)) {
    for (const year of book.hierarchy || []) {
      if (!years.has(year.key)) {
        years.set(year.key, { key: year.key, label: year.label, children: [] });
      }
      const yearNode = years.get(year.key);
      for (const session of year.sessions || []) {
        yearNode.children.push({
          key: `${book.bookId}:${session.fileId}`,
          label: session.label,
          leaf: { bookId: book.bookId, fileId: session.fileId }
        });
      }
    }
  }
  return Array.from(years.values()).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

async function buildMathsTree(summaries) {
  const chapters = new Map();
  for (const book of await loadBooks(summaries)) {
    for (const chapter of book.hierarchy || []) {
      if (!chapters.has(chapter.key)) {
        chapters.set(chapter.key, { key: chapter.key, label: chapter.label, children: [] });
      }
      const chapterNode = chapters.get(chapter.key);
      for (const branch of chapter.branches || []) {
        chapterNode.children.push({
          key: `${book.bookId}:${branch.fileId}`,
          label: branch.label,
          leaf: { bookId: book.bookId, fileId: branch.fileId }
        });
      }
    }
  }
  return Array.from(chapters.values()).sort((a, b) => a.label.localeCompare(b.label));
}

async function buildTechnicalTree(summaries) {
  const domains = new Map();
  const books = await loadBooks(summaries);
  // Zipped with `summaries` because domain/branch live on the catalog row,
  // and Promise.all preserves order.
  summaries.forEach((summary, index) => {
    const book = books[index];
    const domainKey = summary.domain || 'Other';
    if (!domains.has(domainKey)) {
      domains.set(domainKey, { key: domainKey, label: domainKey, children: [] });
    }
    const domainNode = domains.get(domainKey);
    const branchKey = summary.branch || 'General';
    let branchNode = domainNode.children.find((c) => c.key === branchKey);
    if (!branchNode) {
      branchNode = { key: branchKey, label: branchKey, children: [] };
      domainNode.children.push(branchNode);
    }
    for (const chapter of book.hierarchy || []) {
      branchNode.children.push({
        key: `${book.bookId}:${chapter.fileId}`,
        label: chapter.label,
        leaf: { bookId: book.bookId, fileId: chapter.fileId }
      });
    }
  });
  return Array.from(domains.values());
}

const TREE_BUILDERS = {
  aptitude: buildAptitudeTree,
  maths: buildMathsTree,
  technical: buildTechnicalTree
};

router.get('/subjects/:subject/tree', async (req, res) => {
  const builder = TREE_BUILDERS[req.params.subject];
  if (!builder) {
    res.status(404).json({ error: `Unknown subject: ${req.params.subject}` });
    return;
  }
  try {
    const catalog = await kbStore.readCatalog();
    const books = catalog.books.filter((b) => b.subject === req.params.subject);
    res.json({ subject: req.params.subject, tree: await builder(books) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/books/:bookId/hierarchy', async (req, res) => {
  try {
    const book = await kbStore.readBook(req.params.bookId);
    res.json({
      bookId: book.bookId,
      subject: book.subject,
      domain: book.domain,
      branch: book.branch,
      label: book.label,
      parserProfile: book.parserProfile,
      hierarchy: book.hierarchy
    });
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: `Book not found: ${req.params.bookId}` });
      return;
    }
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
