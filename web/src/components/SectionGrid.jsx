import { seriesStyle, levelNoun, plural, pluralWord } from '../series.js';

// Every level below the shelf. Works at any depth and for any subject shape,
// because a node is only ever a branch ({children}) or a leaf ({leaf}) — the
// same contract the server builds trees against.

export function resolvePath(tree, path) {
  let items = tree;
  const trail = [];
  for (const key of path) {
    const node = items.find((n) => n.key === key);
    if (!node) break;
    trail.push(node);
    items = node.children || [];
  }
  return { items, trail };
}

export default function SectionGrid({ subjectKey, items, depth, onOpen }) {
  const noun = levelNoun(subjectKey, depth);
  const childNoun = levelNoun(subjectKey, depth + 1);

  if (items.length === 0) {
    return (
      <div className="empty">
        <h3>Nothing here yet</h3>
        <p>No {pluralWord(noun)} have been registered under this section.</p>
      </div>
    );
  }

  return (
    <div className="sec-grid" style={seriesStyle(subjectKey)}>
      {items.map((node) => (
        <button key={node.key} type="button" className="sec-card" onClick={() => onOpen(node)}>
          <span className="sec-name">{node.label}</span>
          <span className="sec-meta">
            {!node.leaf && (
              <>
                <span>{plural(node.sectionCount, childNoun)}</span>
                <span className="sep">·</span>
              </>
            )}
            <span>{plural(node.questionCount, 'question')}</span>
          </span>
          <span className="go">
            {node.leaf ? 'Open questions' : `Browse ${pluralWord(childNoun)}`}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>
      ))}
    </div>
  );
}
