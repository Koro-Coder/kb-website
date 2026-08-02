import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { listMyRatings, rateQuestion, clearRating } from '../api.js';

const LEVELS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' }
];

// Identity is (bookId, fileId, year, questionNum); the rest are hints so the
// admin analytics can label the row.
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

export default function RateQuestion({ bookId, subject, question }) {
  const { isSignedIn, status, signIn, authFetch } = useAuth();
  const [mine, setMine] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const identifiable = question.questionNum !== undefined && question.questionNum !== null;

  useEffect(() => {
    let cancelled = false;
    setMine(null);
    if (!isSignedIn || !identifiable) {
      return undefined;
    }
    listMyRatings(authFetch)
      .then((all) => {
        if (cancelled) return;
        setMine(
          all.find(
            (r) =>
              r.bookId === bookId &&
              r.fileId === question.fileId &&
              r.year === question.year &&
              r.questionNum === question.questionNum
          ) || null
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, identifiable, authFetch, bookId, question.fileId, question.year, question.questionNum]);

  if (!identifiable || status === 'loading') {
    return null;
  }

  const choose = async (level) => {
    setBusy(true);
    setError('');
    try {
      // Clicking the level you already chose clears it, so a rating can be
      // taken back without a separate control.
      if (mine && mine.rating === level) {
        await clearRating(authFetch, mine.id);
        setMine(null);
      } else {
        setMine(await rateQuestion(authFetch, { ...refFor({ bookId, subject, question }), rating: level }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rate-question">
      <span className="rate-label">Rate question</span>
      {LEVELS.map((level) => {
        const chosen = mine && mine.rating === level.value;
        return (
          <button
            key={level.value}
            className={`pill rate-btn rate-${level.value}${chosen ? ' is-chosen' : ''}`}
            disabled={busy}
            aria-pressed={Boolean(chosen)}
            title={
              isSignedIn
                ? chosen
                  ? 'Click again to clear your rating'
                  : `Rate this question ${level.label.toLowerCase()}`
                : `Sign in to rate this question`
            }
            onClick={() => (isSignedIn ? choose(level.value) : signIn())}
          >
            {level.label}
          </button>
        );
      })}
      {error && <span className="error small"> {error}</span>}
    </div>
  );
}
