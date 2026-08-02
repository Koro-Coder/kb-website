import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { listMyReports, submitReport, withdrawReport } from '../api.js';

// The three report types differ only in wording and whether a comment is
// required, so they share one component. Each carries its own sign-in prompt:
// "sign in to report a problem or request a video solution" told you about
// actions you were not looking at.
const COPY = {
  question_issue: {
    idle: '⚑ Report problem with question',
    done: '⚑ Problem reported',
    title: "What's wrong with this question?",
    placeholder: 'e.g. option (C) is misprinted, the figure is missing, the answer key looks wrong…',
    signedOut: 'to report a problem with this question.',
    requiresComment: true
  },
  solution_issue: {
    idle: '⚑ Report problem with solution',
    done: '⚑ Solution problem reported',
    title: "What's wrong with this solution?",
    placeholder: 'e.g. step 3 divides by zero, the final answer disagrees with the key…',
    signedOut: 'to report a problem with this solution.',
    requiresComment: true
  },
  video_request: {
    idle: '🎬 Request a video solution',
    done: '🎬 Video requested',
    title: 'Request a video solution',
    placeholder: 'Optional: anything in particular you find hard here?',
    signedOut: 'to request a video solution.',
    requiresComment: false
  }
};

const MAX_COMMENT = 4000;

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

  if (!identifiable || status === 'loading') {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div className="question-actions">
        {types.map((type) => (
          <span key={type} className="muted small signin-prompt">
            <button className="link" onClick={signIn}>
              Sign in
            </button>{' '}
            {COPY[type].signedOut}
          </span>
        ))}
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

  const save = async (type) => {
    if (COPY[type].requiresComment && !comment.trim()) {
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

  const remove = async (type) => {
    const existing = mine && mine[type];
    if (!existing) return;
    setBusy(true);
    setError('');
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
            {/* Once filed, the same button reopens the form — where Update and
                Delete both live — rather than offering a bare "withdraw". */}
            {filed && (
              <button className="link small" onClick={() => open(type)} disabled={busy}>
                Edit
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
            <button className="btn-primary" onClick={() => save(openType)} disabled={busy}>
              {mine && mine[openType] ? 'Update' : 'Submit'}
            </button>
            {mine && mine[openType] && (
              <button className="btn-danger" onClick={() => remove(openType)} disabled={busy}>
                Delete
              </button>
            )}
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
