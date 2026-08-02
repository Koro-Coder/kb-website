import { useEffect, useRef } from 'react';
import { seriesFor, plural } from '../series.js';

// The masthead and the controls that narrow the shelves below it. All three
// filters (text, subject chips, has-solutions) are lifted into the page so the
// result line can report on them together.

const SEGMENTS = [
  { value: 'all', label: 'All' },
  { value: 'solutions', label: 'With solutions' }
];

export default function Hero({
  subjects,
  query,
  onQuery,
  subjectFilter,
  onSubjectFilter,
  segment,
  onSegment,
  resultLine
}) {
  const inputRef = useRef(null);

  // "/" jumps to search from anywhere on the page, Esc clears and releases it.
  // Guarded so it does not steal the key while you are typing in a field.
  useEffect(() => {
    const onKey = (event) => {
      const tag = (event.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (event.key === 'Escape' && event.target === inputRef.current) {
        onQuery('');
        inputRef.current.blur();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onQuery]);

  return (
    <section className="wrap hero" id="top">
      <p className="eyebrow">
        <span className="cycle">GATE</span> Study Hub
        <span className="coverage">Last 40 years of GATE questions in one place</span>
      </p>

      <h1>
        Start your GATE preparation today — <em>test what you know.</em>
      </h1>

      <div className="tools">
        <label className="search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search subjects, chapters, branches, years…"
            aria-label="Search every question"
            title="Press / anywhere on the page to jump here. Esc clears it."
          />
          {/* The chip alone ("/") says a shortcut exists, not what it does or
              that Esc pairs with it — the title carries that. Hidden below the
              tablet breakpoint, since neither half applies to a touchscreen. */}
          <span className="kbd" title="Press / anywhere on the page to jump here. Esc clears it.">
            /
          </span>
        </label>

        <div className="chips">
          <button
            className="chip"
            type="button"
            aria-pressed={subjectFilter === 'all'}
            onClick={() => onSubjectFilter('all')}
          >
            <span className="dot" />
            All
          </button>
          {subjects.map((subject) => {
            const series = seriesFor(subject.key);
            return (
              <button
                key={subject.key}
                className="chip"
                type="button"
                aria-pressed={subjectFilter === subject.key}
                onClick={() => onSubjectFilter(subject.key)}
                style={{ '--sc': series.color, '--sc-d': series.colorDark }}
                title={plural(subject.questionCount, 'question')}
              >
                <span className="dot" />
                {subject.label}
                {/* How many cards this chip reveals, not how many books feed
                    them — three Nexus X repos merge into two domain cards, and
                    a chip reading "3" beside two visible cards just looks
                    wrong. Book count is an ingest detail the site never
                    otherwise exposes. */}
                <span className="chip-count">{(subject.tree || []).length}</span>
              </button>
            );
          })}
        </div>

        <div className="seg" role="group" aria-label="Filter by what is available">
          {SEGMENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={segment === option.value}
              onClick={() => onSegment(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="result-line" aria-live="polite">
        {resultLine}
      </p>
    </section>
  );
}
