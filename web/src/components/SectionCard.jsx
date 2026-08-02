import { seriesFor, seriesStyle, levelNoun, formatCount, plural } from '../series.js';

// One card = one top-level node of a subject's tree: a technical Domain, a
// Maths chapter, an Aptitude year. The buttons along the bottom are that
// node's own children — which is what makes the layout work for all three
// shapes without a special case:
//
//   Maths / Aptitude — the children are leaves, so a button opens the
//                      question list directly.
//   Technical        — the children are branches with chapters inside, so a
//                      button drills one level further first.
//
// The cover is generated, not an image: the same gradient + oversized letter
// treatment the PDF library uses, so the two sites read as one shelf.

// How many child buttons fit across the bottom of a card before the rest
// collapse into an "All N". It depends on how wide the labels are, not just
// how many there are: eight two-letter branch codes (CE CH CS EC EE IN ME PI)
// sit comfortably on two rows, whereas four "Session 1"s already fill them.
const MAX_BUTTONS = 4;
const MAX_SHORT_BUTTONS = 8;
const SHORT_LABEL = 4;

// The search term, marked inside the cover title so a visitor can see *why* a
// card matched. Case-insensitive, and the query is escaped because it comes
// straight from an input.
function highlight(text, query) {
  const term = query.trim();
  if (!term) {
    return text;
  }
  const pattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  // Splitting on a pattern with one capture group interleaves the matches at
  // the odd indices — cheaper and safer than re-testing each part, since a /g
  // regex carries lastIndex between calls and would skip every other match.
  return String(text)
    .split(pattern)
    .map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}

export default function SectionCard({ subject, node, query = '', onOpen }) {
  const series = seriesFor(subject.key);
  const children = node.children || [];
  const childNoun = levelNoun(subject.key, 1);
  const grandchildNoun = levelNoun(subject.key, 2);
  const childrenAreLeaves = children.every((c) => c.leaf);

  const limit = children.every((c) => String(c.label).length <= SHORT_LABEL)
    ? MAX_SHORT_BUTTONS
    : MAX_BUTTONS;
  // One short of the limit when overflowing, because the "All N" button has to
  // fit in the row too.
  const shown = children.length > limit ? children.slice(0, limit - 1) : children;
  const overflow = children.length - shown.length;

  return (
    <article className="card" style={seriesStyle(subject.key)}>
      {/* The cover is the card's main target: the whole artwork is clickable,
          not just a link buried under it. */}
      <button
        type="button"
        className="cover"
        onClick={() => onOpen(node)}
        aria-label={`Open ${node.label}`}
      >
        <span className="halftone" />
        <span className="spine" />
        <span className="glyph" aria-hidden="true">
          {series.glyph}
        </span>
        <span className="qs" title={`${formatCount(node.questionCount)} questions`}>
          {formatCount(node.questionCount)}
        </span>
        <span className="cover-series">{subject.label}</span>
        <span className="cover-rule" />
        <span className="cover-title">{highlight(node.label, query)}</span>
        <span className="cover-foot">
          <span className="bm cover-brand">
            <span className="bm-mono" aria-hidden="true">
              P
            </span>
            <span className="bm-text">
              Prep<b>Fusion</b>
            </span>
          </span>
        </span>
      </button>

      <div className="card-body">
        <h3 className="card-title">
          {subject.label} — {node.label}
        </h3>
        <p className="card-kind">{plural(children.length, childNoun)}</p>
        <p className="card-meta">
          {/* When the children *are* the question lists, "6 branches · 6
              sections" would say the same thing twice. */}
          {!childrenAreLeaves && (
            <>
              <span>{plural(node.sectionCount, grandchildNoun)}</span>
              <span className="sep">·</span>
            </>
          )}
          <span>{plural(node.questionCount, 'question')}</span>
        </p>

        <div className="actions">
          {shown.map((child) => (
            <button
              key={child.key}
              type="button"
              className="btn tint"
              onClick={() => onOpen(node, child)}
              title={
                child.leaf
                  ? `${plural(child.questionCount, 'question')} in ${child.label}`
                  : `${plural(child.sectionCount, grandchildNoun)} in ${child.label}`
              }
            >
              {child.label}
            </button>
          ))}
          {overflow > 0 && (
            <button type="button" className="btn solid" onClick={() => onOpen(node)}>
              All {children.length}
            </button>
          )}
          {children.length === 0 && (
            <button type="button" className="btn ghost" disabled>
              Nothing here yet
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
