import { seriesFor, seriesStyle } from '../series.js';
import SectionCard from './SectionCard.jsx';

// One shelf per subject. It stays on the page even when it holds nothing yet:
// the shelves are the map of the library, and hiding an empty one makes the
// plan look smaller than it is. An empty shelf shows a row of blank spines,
// which reads as "being filled" rather than as an error.

export default function Shelf({ subject, nodes, query, onOpen }) {
  const series = seriesFor(subject.key);
  const filtered = nodes.length > 0;

  return (
    <section
      className="shelf"
      id={subject.key}
      style={{ '--sc': series.color, '--sc-d': series.colorDark }}
    >
      <header className="shelf-head">
        <span className="shelf-sq" />
        <h2>{subject.label}</h2>
        <p className="shelf-tagline">{series.tagline}</p>
      </header>

      {filtered ? (
        <div className="grid">
          {nodes.map((node) => (
            <SectionCard
              key={node.key}
              subject={subject}
              node={node}
              query={query}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="shelf-empty" style={seriesStyle(subject.key)}>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span className="shelf-empty-note">
            {subject.bookCount === 0
              ? 'No books registered on this shelf yet.'
              : 'Nothing here matches your search.'}
          </span>
        </div>
      )}
    </section>
  );
}
