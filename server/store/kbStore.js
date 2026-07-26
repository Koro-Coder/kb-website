// Read-only filesystem access to the shared knowledge base. kb-ingest owns
// writes; this module is the single place to swap for a MongoDB read layer
// later.

const fs = require('fs');
const path = require('path');

function dataDir() {
  return path.resolve(__dirname, '../../', process.env.KB_DATA_DIR || '../kb-data');
}

function catalogPath() {
  return path.join(dataDir(), 'catalog.json');
}

function bookPath(bookId) {
  return path.join(dataDir(), 'books', `${bookId}.json`);
}

function readCatalog() {
  const raw = fs.readFileSync(catalogPath(), 'utf8');
  return JSON.parse(raw);
}

function readBook(bookId) {
  const raw = fs.readFileSync(bookPath(bookId), 'utf8');
  return JSON.parse(raw);
}

function bookExists(bookId) {
  return fs.existsSync(bookPath(bookId));
}

module.exports = { dataDir, readCatalog, readBook, bookExists };
