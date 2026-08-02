import { useMemo, useState } from 'react';
import { seriesStyle, plural } from '../series.js';

// What a card's button opens. The PDF library hands you a file here; we hand
// you the questions themselves, so this level gets the filters a PDF cannot
// have: by year and by question type.

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'MCQ', label: 'MCQ' },
  { value: 'NAT', label: 'NAT' },
  { value: 'MSQ', label: 'MSQ' }
];

export default function QuestionList({ subjectKey, fileLabel, questions, ordinal, onSelect }) {
  const [year, setYear] = useState('all');
  const [type, setType] = useState('all');

  // Newest first — the same reasoning as the Aptitude shelf: a year is a date,
  // and the recent papers are the ones people work through first.
  const years = useMemo(
    () =>
      Array.from(new Set(questions.map((q) => q.year).filter(Boolean))).sort((a, b) => b - a),
    [questions]
  );

  // Only offer the types this section actually contains — a NAT filter on a
  // chapter with no NAT questions is a dead control.
  const types = useMemo(() => {
    const present = new Set(questions.map((q) => q.questionType));
    return TYPES.filter((t) => t.value === 'all' || present.has(t.value));
  }, [questions]);

  const shown = questions.filter(
    (q) =>
      (year === 'all' || String(q.year) === year) &&
      (type === 'all' || q.questionType === type)
  );

  const filtered = shown.length !== questions.length;

  return (
    <div style={seriesStyle(subjectKey)}>
      <div className="qlist-head">
        <div className="page-title">
          <h1>{fileLabel}</h1>
          <span className="page-count">{plural(questions.length, 'question')}</span>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="qfilters">
          {years.length > 1 && (
            <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Filter by year">
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          )}
          {types.length > 2 && (
            <div className="seg" role="group" aria-label="Filter by question type">
              {types.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={type === t.value}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {filtered && (
            <button
              className="link small"
              onClick={() => {
                setYear('all');
                setType('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {questions.length === 0 && (
        <div className="empty">
          <h3>No questions here yet</h3>
          <p>Nothing has been parsed out of this section.</p>
        </div>
      )}

      {questions.length > 0 && shown.length === 0 && (
        <div className="empty">
          <h3>Nothing matches</h3>
          <p>No question in this section fits the filters you have set.</p>
        </div>
      )}

      <ul className="qlist">
        {shown.map((q) => (
          <li key={q.ordinal}>
            <button
              type="button"
              className={`qrow${String(q.ordinal) === String(ordinal) ? ' is-current' : ''}`}
              onClick={() => onSelect(q.ordinal)}
            >
              <span className="qid">Q{q.questionId || q.ordinal}</span>
              {q.starred && (
                <span className="qstar" title="Marked important" aria-label="Marked important">
                  ★
                </span>
              )}
              <span className="qrow-meta">
                {q.questionType && <span className="qtype">{q.questionType}</span>}
                {q.marks ? <span>{q.marks}m</span> : null}
                {q.year && <span>{q.year}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
