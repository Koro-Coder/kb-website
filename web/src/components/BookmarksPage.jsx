import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { listBookmarks, removeBookmark, getSubjectTree } from '../api.js';
import { seriesFor, subjectTitle, plural } from '../series.js';

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

// The same display name the shelves use, so "nexus_x" reads as "Nexus X" here
// too rather than as "Nexus_x".
function titleCase(value) {
  return seriesFor(value).label || subjectTitle(value);
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
  // null = every subject collapsed, which is the state the page opens in.
  const [openSubject, setOpenSubject] = useState(null);

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
    <div className="page-head">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button onClick={() => navigate('/')}>Study Hub</button>
        <span className="crumb-sep">/</span>
        <span className="crumb-now">Bookmarks</span>
      </nav>
      <div className="page-title bookmarks-title">
        <h1>Your bookmarks</h1>
        {bookmarks && <span className="page-count">{plural(bookmarks.length, 'question')}</span>}
      </div>

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

      {grouped.map(({ subject, files }) => {
        const open = openSubject === subject;
        const count = files.reduce((sum, f) => sum + f.items.length, 0);
        return (
        <section className="bookmark-subject" key={subject}>
          {/* One subject open at a time, and none on arrival: someone with
              bookmarks across all three subjects was landing on a wall of
              chapters, when what they came for is one question in one of them.
              Clicking the open subject closes it again, so it is always
              possible to get back to the overview. */}
          <h2>
            <button
              type="button"
              className="bookmark-subject-head"
              aria-expanded={open}
              onClick={() => setOpenSubject(open ? null : subject)}
            >
              <svg
                className="bookmark-chev"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
              {titleCase(subject)}
              <span className="bookmark-subject-count">{plural(count, 'question')}</span>
            </button>
          </h2>

          {open && files.map(({ fileKey, placement, items }) => (
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
                    // The question id already encodes chapter.year.number
                    // (7.15.1 = chapter 7, 2015, Q1), so repeating the year and
                    // number beside it says the same thing twice. Only the
                    // fallback, used when no id was captured, still needs them
                    // to identify the question within its chapter.
                    const title = bookmark.questionId
                      ? `Q${bookmark.questionId}`
                      : `Q${bookmark.questionNum} · ${bookmark.year}`;
                    return (
                      <li key={bookmark.id}>
                        {href ? <Link to={href}>{title}</Link> : <span>{title}</span>}
                        {/* An icon, but never an unlabelled one: the chip
                            beside it is the only thing saying which question
                            this removes, and a screen reader reading a row of
                            bare "×" buttons has nothing to go on. */}
                        <button
                          className="link remove"
                          onClick={() => drop(bookmark.id)}
                          aria-label={`Remove ${title} from bookmarks`}
                          title={`Remove ${title} from bookmarks`}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </section>
        );
      })}
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
