import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { listBookmarks, removeBookmark, getSubjectTree } from '../api.js';

// Walks a subject tree and indexes every leaf by the book+file it points at,
// recording the branch labels (and keys) sitting above it.
//
// That index is what lets a bookmark be shown as the same path you would have
// followed to reach the question — Domain > Branch > Chapter for technical,
// Chapter > Branch for maths, Year > Session for aptitude — instead of a raw
// fileId. Reading the labels from the live tree rather than storing them on
// the bookmark also means a re-synced book shows its current names.
function indexTree(nodes, ancestors = [], into = new Map()) {
  for (const node of nodes || []) {
    if (node.leaf) {
      into.set(`${node.leaf.bookId}::${node.leaf.fileId}`, {
        pathLabels: ancestors.map((a) => a.label),
        pathKeys: ancestors.map((a) => a.key),
        leafLabel: node.label
      });
    } else if (node.children) {
      indexTree(node.children, [...ancestors, { key: node.key, label: node.label }], into);
    }
  }
  return into;
}

function titleCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

// Rebuilds the browse URL including the tree path, so going "back" from a
// bookmarked question lands where that question actually lives rather than at
// the top of the subject.
function questionHref(bookmark, placement) {
  if (!bookmark.subject || !bookmark.ordinal) {
    return null;
  }
  const params = new URLSearchParams();
  if (placement && placement.pathKeys.length) {
    params.set('path', placement.pathKeys.join(','));
  }
  params.set('bookId', bookmark.bookId);
  params.set('fileId', bookmark.fileId);
  params.set('ordinal', String(bookmark.ordinal));
  return `/subject/${bookmark.subject}?${params.toString()}`;
}

export default function BookmarksPage() {
  const { isSignedIn, status, signIn, authFetch } = useAuth();
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState(null);
  const [trees, setTrees] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }
    listBookmarks(authFetch)
      .then(setBookmarks)
      .catch((e) => setError(e.message));
  }, [isSignedIn, authFetch]);

  // One tree fetch per subject actually bookmarked — at most three.
  useEffect(() => {
    if (!bookmarks) {
      return;
    }
    const subjects = [...new Set(bookmarks.map((b) => b.subject).filter(Boolean))];
    subjects.forEach((subject) => {
      if (trees[subject]) {
        return;
      }
      getSubjectTree(subject)
        .then((data) => setTrees((current) => ({ ...current, [subject]: indexTree(data.tree) })))
        // A missing tree only costs us the pretty path, so it is not surfaced
        // as an error — the fallback rendering still identifies the question.
        .catch(() => {});
    });
  }, [bookmarks, trees]);

  // subject -> file -> questions, mirroring the browse hierarchy.
  const grouped = useMemo(() => {
    if (!bookmarks) {
      return [];
    }
    const bySubject = new Map();

    for (const bookmark of bookmarks) {
      const subject = bookmark.subject || 'other';
      if (!bySubject.has(subject)) {
        bySubject.set(subject, new Map());
      }
      const files = bySubject.get(subject);
      const fileKey = `${bookmark.bookId}::${bookmark.fileId}`;
      if (!files.has(fileKey)) {
        const placement = trees[subject] ? trees[subject].get(fileKey) : null;
        files.set(fileKey, { placement, items: [] });
      }
      files.get(fileKey).items.push(bookmark);
    }

    return [...bySubject.entries()].map(([subject, files]) => ({
      subject,
      files: [...files.entries()]
        .map(([fileKey, group]) => ({ fileKey, ...group }))
        .sort((a, b) => crumbOf(a).localeCompare(crumbOf(b)))
    }));
  }, [bookmarks, trees]);

  const drop = async (id) => {
    await removeBookmark(authFetch, id);
    setBookmarks((current) => current.filter((b) => b.id !== id));
  };

  return (
    <div className="app">
      <header>
        <p className="muted small">
          <button className="link" onClick={() => navigate('/')}>
            ← All subjects
          </button>
        </p>
        <h1>Your bookmarks</h1>
      </header>

      {status === 'loading' && <p className="muted">Loading…</p>}

      {status === 'signed-out' && (
        <p className="muted">
          <button className="link" onClick={signIn}>
            Sign in
          </button>{' '}
          to keep a list of questions to come back to.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {isSignedIn && bookmarks && bookmarks.length === 0 && (
        <p className="muted">
          No bookmarks yet — open any question and press <strong>☆ Bookmark</strong>.
        </p>
      )}

      {grouped.map(({ subject, files }) => (
        <section className="bookmark-subject" key={subject}>
          <h2>{titleCase(subject)}</h2>

          {files.map(({ fileKey, placement, items }) => (
            <div className="bookmark-group" key={fileKey}>
              <div className="bookmark-path">
                {placement ? (
                  <>
                    {placement.pathLabels.map((label) => (
                      <span key={label}>
                        {label}
                        <span className="crumb-sep"> › </span>
                      </span>
                    ))}
                    <strong>{placement.leafLabel}</strong>
                  </>
                ) : (
                  // The tree has not loaded, or the file is no longer in it —
                  // fall back to the identifiers we stored.
                  <span className="muted">{items[0].fileId}</span>
                )}
              </div>

              <ul className="bookmark-questions">
                {items
                  .slice()
                  .sort((a, b) => a.year - b.year || a.questionNum - b.questionNum)
                  .map((bookmark) => {
                    const href = questionHref(bookmark, placement);
                    const title = bookmark.questionId
                      ? `Q${bookmark.questionId}`
                      : `Q${bookmark.questionNum}`;
                    return (
                      <li key={bookmark.id}>
                        {href ? <Link to={href}>{title}</Link> : <span>{title}</span>}
                        <span className="muted small">
                          {' '}
                          {bookmark.year} · Q{bookmark.questionNum}
                        </span>
                        <button className="link remove" onClick={() => drop(bookmark.id)}>
                          Remove
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// Sort key for a file group: its breadcrumb if we have one, else the raw id.
function crumbOf(group) {
  if (!group.placement) {
    return group.items[0].fileId;
  }
  return [...group.placement.pathLabels, group.placement.leafLabel].join(' › ');
}
