import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { addBookmark, removeBookmark, listBookmarks } from '../api.js';

// The identity is (bookId, fileId, year, questionNum) — matching the server.
// The ordinal is sent only as a navigation hint for the bookmarks list.
function refFor({ bookId, subject, question }) {
  return {
    bookId,
    fileId: question.fileId,
    year: question.year,
    questionNum: question.questionNum,
    subject,
    ordinal: question.ordinal,
    questionId: question.questionId,
    label: question.questionId ? `Q${question.questionId}` : `Question ${question.ordinal}`
  };
}

export default function BookmarkButton({ bookId, subject, question }) {
  const { isSignedIn, status, signIn, authFetch } = useAuth();
  const [bookmarkId, setBookmarkId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Work out whether this question is already bookmarked. The list is small
  // (one user's own bookmarks), so filtering client-side avoids adding an
  // endpoint just for this.
  useEffect(() => {
    let cancelled = false;
    setBookmarkId(null);
    if (!isSignedIn || question.questionNum === undefined || question.questionNum === null) {
      return undefined;
    }
    listBookmarks(authFetch)
      .then((all) => {
        if (cancelled) return;
        const match = all.find(
          (b) =>
            b.bookId === bookId &&
            b.fileId === question.fileId &&
            b.year === question.year &&
            b.questionNum === question.questionNum
        );
        setBookmarkId(match ? match.id : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, authFetch, bookId, question.fileId, question.year, question.questionNum]);

  // A question the parser could not give a number to cannot be identified
  // stably, so there is nothing safe to bookmark against.
  if (question.questionNum === undefined || question.questionNum === null) {
    return null;
  }

  if (status === 'loading') {
    return null;
  }

  if (!isSignedIn) {
    return (
      <button className="bookmark-btn" onClick={signIn} title="Sign in to bookmark this question">
        ☆ Bookmark
      </button>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (bookmarkId) {
        await removeBookmark(authFetch, bookmarkId);
        setBookmarkId(null);
      } else {
        const created = await addBookmark(authFetch, refFor({ bookId, subject, question }));
        setBookmarkId(created.id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={`bookmark-btn${bookmarkId ? ' is-bookmarked' : ''}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={Boolean(bookmarkId)}
        title={bookmarkId ? 'Remove bookmark' : 'Bookmark this question'}
      >
        {bookmarkId ? '★ Bookmarked' : '☆ Bookmark'}
      </button>
      {error && <span className="error small"> {error}</span>}
    </>
  );
}
