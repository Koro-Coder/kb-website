// Read-only MongoDB access to the shared knowledge base. kb-ingest owns
// writes; this module is the single place the site reads them.
//
// The catalog is not a stored document: its summary rows are projected out of
// the `books` collection, which is the one source of truth for a book.
//
// Every function is async now; the filesystem versions were synchronous.

const { collection, COLLECTIONS } = require('./mongo');

// Must stay in step with kb-ingest's SUMMARY_PROJECTION.
const SUMMARY_PROJECTION = {
  _id: 0,
  bookId: 1,
  subject: 1,
  domain: 1,
  branch: 1,
  label: 1,
  repo: 1,
  solutionRepo: 1,
  parserProfile: 1,
  lastSyncedAt: 1,
  questionCount: 1,
  solutionCount: 1,
  warningCount: 1
};

async function readSubjects() {
  const subjects = await collection(COLLECTIONS.subjects);
  return subjects
    .find({}, { projection: { _id: 0, key: 1, label: 1 } })
    .sort({ order: 1, key: 1 })
    .toArray();
}

async function readCatalog() {
  const books = await collection(COLLECTIONS.books);
  const [subjects, summaries] = await Promise.all([
    readSubjects(),
    books.find({}, { projection: SUMMARY_PROJECTION }).sort({ bookId: 1 }).toArray()
  ]);
  return { subjects, books: summaries };
}

async function readBook(bookId) {
  const books = await collection(COLLECTIONS.books);
  const book = await books.findOne({ _id: bookId }, { projection: { _id: 0 } });
  if (!book) {
    // Callers translate a throw into a 404; returning null would 500 instead.
    throw new Error(`Book not found: ${bookId}`);
  }
  return book;
}

async function bookExists(bookId) {
  const books = await collection(COLLECTIONS.books);
  return (await books.countDocuments({ _id: bookId }, { limit: 1 })) > 0;
}

module.exports = { readCatalog, readSubjects, readBook, bookExists };
