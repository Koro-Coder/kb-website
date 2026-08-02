const express = require('express');
const kbStore = require('../store/kbStore');
const { profileForSubject } = require('../parsing/adapters');

const router = express.Router();

// The store is over the network now, so a failed read is no longer proof that
// the book is missing. Only kbStore's own not-found error becomes a 404;
// anything else (connection refused, auth, timeout) must surface as a 500.
function isNotFound(error) {
  return /^Book not found:/.test(error.message);
}

// Merges every registered book's hierarchy into one subject-wide navigation
// tree, so "book" (= one repo) never has to be a concept the site's UI
// exposes. Every node is either a branch node ({key,label,children}) or a
// leaf node ({key,label,leaf:{bookId,fileId}}) pointing at a specific tex
// file — the frontend renders both shapes generically.
//
// The builders are synchronous and take their books already loaded: the whole
// library is assembled from one pass over the book collection (see
// buildLibrary), so a book shared by two subjects is still read only once.

function buildAptitudeTree(summaries, bookById) {
  const years = new Map();
  for (const book of booksFor(summaries, bookById)) {
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
  // Newest year first. Every other subject's top level is a name, where
  // alphabetical is the only sensible order; this one is a date, and someone
  // preparing for the next exam wants the most recent paper at the front of
  // the shelf, not thirty years of scrolling to reach it.
  return Array.from(years.values()).sort((a, b) =>
    b.key.localeCompare(a.key, undefined, { numeric: true })
  );
}

function buildMathsTree(summaries, bookById) {
  const chapters = new Map();
  for (const book of booksFor(summaries, bookById)) {
    for (const chapter of book.hierarchy || []) {
      if (!chapters.has(chapter.key)) {
        chapters.set(chapter.key, { key: chapter.key, label: chapter.label, children: [] });
      }
      const chapterNode = chapters.get(chapter.key);
      for (const branch of chapter.branches || []) {
        chapterNode.children.push({
          key: `${book.bookId}:${branch.fileId}`,
          // The two-letter code (EC, EE, CS…), not the full department name
          // the ingest stored. These are the buttons across the bottom of a
          // chapter card, where "Electronics & Communication Engineering"
          // wraps to three lines and crowds out its siblings — and the codes
          // are what a GATE candidate recognises anyway. The full name still
          // heads the question list, via the file's own label.
          label: (branch.branchCode || '').toUpperCase() || branch.label,
          leaf: { bookId: book.bookId, fileId: branch.fileId }
        });
      }
    }
  }
  return Array.from(chapters.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildTechnicalTree(summaries, bookById) {
  const domains = new Map();
  // Domain/branch live on the catalog row, not in the book document, so this
  // one walks the summaries and looks each book up rather than the reverse.
  for (const summary of summaries) {
    const book = bookById.get(summary.bookId);
    if (!book) {
      continue;
    }
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
  }
  return Array.from(domains.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function booksFor(summaries, bookById) {
  return summaries.map((s) => bookById.get(s.bookId)).filter(Boolean);
}

// Keyed by parser profile rather than by subject: the tree shape follows the
// repo layout, so any subject sharing the technical layout (Nexus X, Silicon X,
// Power X) gets the right navigation without being listed here.
const TREE_BUILDERS_BY_PROFILE = {
  // Must be the adapter's own `id` — this read 'aptitude-year-session', which
  // no adapter has ever exported, so every Aptitude tree request 404'd as
  // "Unknown subject" instead of building. See parsing/adapters/aptitude.js.
  'aptitude-session': buildAptitudeTree,
  'maths-chapter-branch': buildMathsTree,
  'technical-chapter-file': buildTechnicalTree
};

function treeBuilderFor(subject) {
  let profile;
  try {
    profile = profileForSubject(subject);
  } catch (error) {
    return null;
  }
  return TREE_BUILDERS_BY_PROFILE[profile] || null;
}

// --- counts ----------------------------------------------------------------

// Stamps every node with how much sits under it, so the UI can label a shelf
// "3 sections · 412 questions" without walking the tree itself on each render.
//
// Deliberately generic over the tree SHAPE: it only knows that a node either
// carries a `leaf` or a `children` array, which is the same contract the
// frontend renders against. That is why the three builders above need no
// changes to gain counts, and why a fourth subject layout would get them free.
//
// A "section" is one browsable question list — i.e. one leaf — so a branch's
// sectionCount is the number of leaves anywhere beneath it, not its immediate
// child count.
function annotateCounts(nodes, countOf) {
  let questions = 0;
  let sections = 0;
  for (const node of nodes) {
    if (node.leaf) {
      node.questionCount = countOf(node.leaf.bookId, node.leaf.fileId);
      node.sectionCount = 1;
    } else {
      const below = annotateCounts(node.children || [], countOf);
      node.questionCount = below.questions;
      node.sectionCount = below.sections;
    }
    questions += node.questionCount;
    sections += node.sectionCount;
  }
  return { questions, sections };
}

// (bookId, fileId) -> questionCount, straight off the book documents already
// loaded to build the trees. No extra reads: `files[].questionCount` is
// written by kb-ingest and is the same number /books/:bookId/file serves.
function countLookup(books) {
  const counts = new Map();
  for (const book of books) {
    for (const file of book.files || []) {
      counts.set(`${book.bookId}::${file.fileId}`, file.questionCount || 0);
    }
  }
  return (bookId, fileId) => counts.get(`${bookId}::${fileId}`) || 0;
}

// --- library ---------------------------------------------------------------

// The whole browsable catalogue in one object: every subject and its merged
// tree. Pure — takes the catalog and the already-loaded books — so it can be
// tested without a database.
//
// No site-wide totals here. The hero used to print them, and it no longer
// does; a number nothing renders is a number worth not computing.
function assembleLibrary(catalog, books) {
  const bookById = new Map(books.map((b) => [b.bookId, b]));
  const countOf = countLookup(books);

  const subjects = catalog.subjects.map((subject) => {
    const summaries = catalog.books.filter((b) => b.subject === subject.key);
    const builder = treeBuilderFor(subject.key);
    const tree = builder ? builder(summaries, bookById) : [];
    const { questions, sections } = annotateCounts(tree, countOf);
    return {
      key: subject.key,
      label: subject.label,
      bookCount: summaries.length,
      sectionCount: sections,
      questionCount: questions,
      // Per-file solution counts are not indexed, only per-book totals — so
      // this is the one number that cannot roll up through the tree.
      solutionCount: summaries.reduce((sum, b) => sum + (b.solutionCount || 0), 0),
      tree
    };
  });

  return { subjects };
}

async function buildLibrary() {
  const catalog = await kbStore.readCatalog();
  const books = await Promise.all(catalog.books.map((s) => kbStore.readBook(s.bookId)));
  return assembleLibrary(catalog, books);
}

// Book documents are large (every file, every question stub) and the landing
// page needs all of them at once, so building this per request would be the
// heaviest thing the site does. kb-ingest owns every write and syncs are
// manual, so a few minutes of staleness is invisible — and this replaces the
// old behaviour, where *each* subject page re-read *every* book in that
// subject on *every* request.
const LIBRARY_TTL_MS = 5 * 60 * 1000;

// "no-cache" does NOT mean "do not cache" — it means "revalidate before
// reusing". The browser still stores the response and still sends a
// conditional request, which Express answers with a 304 (a few bytes, served
// off the in-memory cache above) whenever nothing has changed.
//
// Deliberately not `max-age`: that was the first thing tried here, and it made
// a freshly synced book invisible to anyone who had loaded the page in the
// previous five minutes — reload included, with no way to force it. The server
// cache is what protects the database; putting the same window in the browser
// bought nothing and cost correctness.
const LIBRARY_CACHE_CONTROL = 'no-cache';

let cached = null;
let inFlight = null;

function getLibrary() {
  if (cached && Date.now() - cached.builtAt < LIBRARY_TTL_MS) {
    return Promise.resolve(cached.payload);
  }
  // Without this, a cold cache under load starts one full rebuild per waiting
  // request instead of one rebuild they all share.
  if (!inFlight) {
    inFlight = buildLibrary()
      .then((payload) => {
        cached = { builtAt: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

function sendLibraryError(res, error) {
  console.error(error);
  res.status(500).json({ error: error.message });
}

// --- routes ----------------------------------------------------------------

// One request renders the entire landing page: five shelves, their cards and
// every count on them.
router.get('/library', async (req, res) => {
  try {
    const library = await getLibrary();
    res.set('Cache-Control', LIBRARY_CACHE_CONTROL);
    res.json(library);
  } catch (error) {
    sendLibraryError(res, error);
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const library = await getLibrary();
    res.set('Cache-Control', LIBRARY_CACHE_CONTROL);
    res.json(library.subjects.map(({ tree, ...subject }) => subject));
  } catch (error) {
    sendLibraryError(res, error);
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

router.get('/subjects/:subject/tree', async (req, res) => {
  if (!treeBuilderFor(req.params.subject)) {
    res.status(404).json({ error: `Unknown subject: ${req.params.subject}` });
    return;
  }
  try {
    const library = await getLibrary();
    const subject = library.subjects.find((s) => s.key === req.params.subject);
    res.set('Cache-Control', LIBRARY_CACHE_CONTROL);
    // A known subject with nothing registered yet is an empty shelf, not a 404.
    res.json({ subject: req.params.subject, tree: subject ? subject.tree : [] });
  } catch (error) {
    sendLibraryError(res, error);
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
// Exported for the tests, which exercise the assembly without a database.
module.exports.assembleLibrary = assembleLibrary;
module.exports.annotateCounts = annotateCounts;
