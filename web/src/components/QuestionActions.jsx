import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { listMyReports, submitReport, withdrawReport } from '../api.js';

// The three report types share everything except their wording and whether a
// comment is required, so they share one component too.
const COPY = {
  question_issue: {
    idle: '⚑ Report a problem',
    done: '⚑ Problem reported',
    title: "What's wrong with this question?",
    placeholder: 'e.g. option (C) is misprinted, the figure is missing, the answer key looks wrong…',
    requiresComment: true
  },
  solution_issue: {
    idle: '⚑ Report a problem with this solution',
    done: '⚑ Solution problem reported',
    title: "What's wrong with this solution?",
    placeholder: 'e.g. step 3 divides by zero, the final answer disagrees with the key…',
    requiresComment: true
  },
  video_request: {
    idle: '🎬 Request a video solution',
    done: '🎬 Video requested',
    title: 'Request a video solution',
    placeholder: 'Optional: anything in particular you find hard here?',
    requiresComment: false
  }
};

const MAX_COMMENT = 4000;

// Identity is (bookId, fileId, year, questionNum); the rest are hints so an
// admin queue can label and link the row.
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

export default function QuestionActions({ bookId, subject, question, types }) {
  const { isSignedIn, status, signIn, authFetch } = useAuth();
  const [mine, setMine] = useState(null);
  const [openType, setOpenType] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const identifiable = question.questionNum !== undefined && question.questionNum !== null;

  // Which of these has this user already filed? One request for all types on
  // this question, rather than one per button.
  useEffect(() => {
    let cancelled = false;
    setMine(null);
    if (!isSignedIn || !identifiable) {
      return undefined;
    }
    listMyReports(authFetch)
      .then((all) => {
        if (cancelled) return;
        const forThis = all.filter(
          (r) =>
            r.bookId === bookId &&
            r.fileId === question.fileId &&
            r.year === question.year &&
            r.questionNum === question.questionNum
        );
        setMine(Object.fromEntries(forThis.map((r) => [r.type, r])));
      })
      .catch(() => setMine({}));
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, identifiable, authFetch, bookId, question.fileId, question.year, question.questionNum]);

  // Nothing stable to attach a report to.
  if (!identifiable || status === 'loading') {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div className="question-actions">
        <button className="link" onClick={signIn}>
          Sign in
        </button>{' '}
        <span className="muted small">to report a problem or request a video solution.</span>
      </div>
    );
  }

  const close = () => {
    setOpenType(null);
    setComment('');
    setError('');
  };

  const open = (type) => {
    setOpenType(type);
    setComment(mine && mine[type] ? mine[type].comment || '' : '');
    setError('');
  };

  const send = async (type) => {
    const copy = COPY[type];
    if (copy.requiresComment && !comment.trim()) {
      setError('Please describe the problem.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await submitReport(authFetch, {
        ...refFor({ bookId, subject, question }),
        type,
        comment: comment.trim() || undefined
      });
      setMine((current) => ({ ...(current || {}), [type]: saved }));
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const drop = async (type) => {
    const existing = mine && mine[type];
    if (!existing) return;
    setBusy(true);
    try {
      await withdrawReport(authFetch, existing.id);
      setMine((current) => {
        const next = { ...(current || {}) };
        delete next[type];
        return next;
      });
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="question-actions">
      {types.map((type) => {
        const copy = COPY[type];
        const filed = mine && mine[type];
        return (
          <span key={type} className="action-slot">
            <button
              className={`action-btn${filed ? ' is-filed' : ''}`}
              onClick={() => (openType === type ? close() : open(type))}
              disabled={busy}
            >
              {filed ? copy.done : copy.idle}
            </button>
            {filed && (
              <button className="link small" onClick={() => drop(type)} disabled={busy}>
                withdraw
              </button>
            )}
          </span>
        );
      })}

      {openType && (
        <div className="report-form">
          <label htmlFor={`report-${openType}`}>{COPY[openType].title}</label>
          <textarea
            id={`report-${openType}`}
            rows={3}
            maxLength={MAX_COMMENT}
            value={comment}
            placeholder={COPY[openType].placeholder}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="report-form-actions">
            <button className="btn-primary" onClick={() => send(openType)} disabled={busy}>
              {mine && mine[openType] ? 'Update' : 'Submit'}
            </button>
            <button className="link" onClick={close} disabled={busy}>
              Cancel
            </button>
            <span className="muted small">
              {comment.length}/{MAX_COMMENT}
            </span>
          </div>
          {error && <p className="error small">{error}</p>}
        </div>
      )}
    </div>
  );
}
