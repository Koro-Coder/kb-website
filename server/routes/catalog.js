const express = require('express');
const kbStore = require('../store/kbStore');

const router = express.Router();

router.get('/subjects', (req, res) => {
  const catalog = kbStore.readCatalog();
  const subjects = catalog.subjects.map((s) => ({
    ...s,
    bookCount: catalog.books.filter((b) => b.subject === s.key).length
  }));
  res.json(subjects);
});

router.get('/subjects/:subject/books', (req, res) => {
  const catalog = kbStore.readCatalog();
  const books = catalog.books.filter((b) => b.subject === req.params.subject);
  res.json(books);
});

// Merges every registered book's hierarchy into one subject-wide navigation
// tree, so "book" (= one repo) never has to be a concept the site's UI
// exposes. Every node is either a branch node ({key,label,children}) or a
// leaf node ({key,label,leaf:{bookId,fileId}}) pointing at a specific tex
// file — the frontend renders both shapes generically.
function buildAptitudeTree(books) {
  const years = new Map();
  for (const summary of books) {
    const book = kbStore.readBook(summary.bookId);
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

function buildMathsTree(books) {
  const chapters = new Map();
  for (const summary of books) {
    const book = kbStore.readBook(summary.bookId);
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

function buildTechnicalTree(books) {
  const domains = new Map();
  for (const summary of books) {
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
    const book = kbStore.readBook(summary.bookId);
    for (const chapter of book.hierarchy || []) {
      branchNode.children.push({
        key: `${book.bookId}:${chapter.fileId}`,
        label: chapter.label,
        leaf: { bookId: book.bookId, fileId: chapter.fileId }
      });
    }
  }
  return Array.from(domains.values());
}

const TREE_BUILDERS = {
  aptitude: buildAptitudeTree,
  maths: buildMathsTree,
  technical: buildTechnicalTree
};

router.get('/subjects/:subject/tree', (req, res) => {
  const catalog = kbStore.readCatalog();
  const books = catalog.books.filter((b) => b.subject === req.params.subject);
  const builder = TREE_BUILDERS[req.params.subject];
  if (!builder) {
    res.status(404).json({ error: `Unknown subject: ${req.params.subject}` });
    return;
  }
  res.json({ subject: req.params.subject, tree: builder(books) });
});

router.get('/books/:bookId/hierarchy', (req, res) => {
  try {
    const book = kbStore.readBook(req.params.bookId);
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
    res.status(404).json({ error: `Book not found: ${req.params.bookId}` });
  }
});

module.exports = router;
