// Shared definition of "which question is this about", used by bookmarks and
// reports alike so the two can never drift apart.
//
// Identity is (bookId, fileId, year, questionNum) — the same triple the
// solution join and video overrides use. The printed question id is not unique
// within a book (aptitude ids omit the session), and the ordinal is positional:
// it silently repoints at a different question the moment anyone inserts a
// question into the source .tex.

function parseQuestionRef(body) {
  const ref = body || {};
  const bookId = typeof ref.bookId === 'string' ? ref.bookId.trim() : '';
  const fileId = typeof ref.fileId === 'string' ? ref.fileId.trim() : '';
  const year = Number(ref.year);
  const questionNum = Number(ref.questionNum);

  if (!bookId || !fileId) {
    return { error: 'bookId and fileId are required' };
  }
  // Number(null) is 0 and Number('') is 0, so the raw value is checked too.
  if (ref.year === null || ref.year === undefined || !Number.isInteger(year)) {
    return { error: 'year must be an integer' };
  }
  if (ref.questionNum === null || ref.questionNum === undefined || !Number.isInteger(questionNum)) {
    return { error: 'questionNum must be an integer' };
  }
  return { ref: { bookId, fileId, year, questionNum }, hints: parseHints(ref) };
}

// Display/navigation hints stored alongside the row so a list can label and
// deep-link it without re-fetching every book. Deliberately NOT part of the
// identity — see the ordinal warning above.
function parseHints(ref) {
  const hints = {};
  if (typeof ref.subject === 'string' && ref.subject.trim()) {
    hints.subject = ref.subject.trim();
  }
  if (Number.isInteger(Number(ref.ordinal)) && Number(ref.ordinal) > 0) {
    hints.ordinal = Number(ref.ordinal);
  }
  if (typeof ref.label === 'string' && ref.label.trim()) {
    hints.label = ref.label.trim().slice(0, 200);
  }
  if (typeof ref.questionId === 'string' && ref.questionId.trim()) {
    hints.questionId = ref.questionId.trim();
  }
  return hints;
}

// The stable per-question part of a row id.
function questionKey(ref) {
  return `${ref.bookId}::${ref.fileId}|${ref.year}|${ref.questionNum}`;
}

module.exports = { parseQuestionRef, parseHints, questionKey };
