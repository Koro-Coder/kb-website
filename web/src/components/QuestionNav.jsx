import { useEffect } from 'react';

// Previous/next within the chapter you are already browsing.
//
// Navigation is by POSITION in the file's question list, never by ordinal ± 1:
// ordinals are not guaranteed contiguous — a question the parser had to
// exclude leaves a gap — so arithmetic would land on a question that is not
// there and show "not found".
function neighboursOf(questions, ordinal) {
  const list = questions || [];
  const index = list.findIndex((q) => String(q.ordinal) === String(ordinal));
  if (index === -1) {
    return { index: -1, total: list.length, previous: null, next: null };
  }
  return {
    index,
    total: list.length,
    previous: index > 0 ? list[index - 1] : null,
    next: index < list.length - 1 ? list[index + 1] : null
  };
}

function labelFor(question) {
  return question.questionId ? `Q${question.questionId}` : `Question ${question.ordinal}`;
}

export default function QuestionNav({ questions, ordinal, onSelect }) {
  const { index, total, previous, next } = neighboursOf(questions, ordinal);

  // Arrow keys, but never while someone is typing — the report form on this
  // same page has a textarea, and stealing its arrow keys would be maddening.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const el = event.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft' && previous) {
        onSelect(previous.ordinal);
      } else if (event.key === 'ArrowRight' && next) {
        onSelect(next.ordinal);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previous, next, onSelect]);

  // Unknown ordinal (a stale link, say) — there is no series position to show.
  if (index === -1) {
    return null;
  }

  return (
    <nav className="question-nav" aria-label="Question navigation">
      {/* At the first question there is no previous, and at the last no next.
          The empty span keeps the counter centred either way. */}
      {previous ? (
        <button className="nav-btn" onClick={() => onSelect(previous.ordinal)}>
          <span aria-hidden="true">←</span> Previous
          <span className="nav-hint">{labelFor(previous)}</span>
        </button>
      ) : (
        <span className="nav-spacer" />
      )}

      <span className="nav-position muted small">
        {index + 1} of {total}
      </span>

      {next ? (
        <button className="nav-btn" onClick={() => onSelect(next.ordinal)}>
          Next <span aria-hidden="true">→</span>
          <span className="nav-hint">{labelFor(next)}</span>
        </button>
      ) : (
        <span className="nav-spacer" />
      )}
    </nav>
  );
}

export { neighboursOf };
