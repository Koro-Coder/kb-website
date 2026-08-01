// Per-book video-link overrides, stored in their own collection rather than
// on the book document. That separation is the whole point: the book document
// is regenerated from scratch on every sync, so anything written there would
// be wiped. These overrides are curated by hand (via the CSV round-trip in
// kb-ingest) and must outlive re-syncs.
//
// A link supplied here wins over the \MCQSol{...}{video}{...} argument in the
// LaTeX source, so a video can be added without touching the solution repo.
//
// Read-only here; kb-ingest owns the writes.

const { collection, COLLECTIONS } = require('./mongo');

// Identity is (file, year, question number) — the same triple the solution
// join uses. The printed question id is NOT safe here: aptitude ids omit the
// session, so they repeat across files within a book.
function videoKey(fileId, year, questionNum) {
  return `${fileId}|${year}|${questionNum}`;
}

// One document per override, instead of one map-shaped document per book:
// fileIds contain dots and slashes, which are illegal or query-hostile as
// MongoDB field names.
function docId(bookId, key) {
  return `${bookId}::${key}`;
}

async function readVideos(bookId) {
  const videos = await collection(COLLECTIONS.videos);
  const rows = await videos.find({ bookId }, { projection: { _id: 0, key: 1, video: 1 } }).toArray();
  const map = {};
  for (const row of rows) {
    map[row.key] = row.video;
  }
  return map;
}

async function getVideo(bookId, fileId, year, questionNum) {
  const videos = await collection(COLLECTIONS.videos);
  const row = await videos.findOne(
    { _id: docId(bookId, videoKey(fileId, year, questionNum)) },
    { projection: { _id: 0, video: 1 } }
  );
  return (row && row.video) || null;
}

module.exports = { readVideos, getVideo, videoKey };
