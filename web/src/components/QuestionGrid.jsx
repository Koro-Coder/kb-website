export default function QuestionGrid({ fileLabel, questions, onSelect, onBack }) {
  return (
    <div>
      <div className="breadcrumbs">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <span> / {fileLabel}</span>
      </div>
      <div className="grid">
        {questions.map((q) => (
          <button key={q.ordinal} className="tile question-tile" onClick={() => onSelect(q.ordinal)}>
            <div>Q{q.questionId || q.ordinal}</div>
            <div className="muted small">
              {q.questionType} · {q.year}
            </div>
          </button>
        ))}
        {questions.length === 0 && <p className="muted">No questions parsed for this file.</p>}
      </div>
    </div>
  );
}
