import { Fragment, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getLibrary, getSubjectTree, getFileQuestions, getQuestion } from './api.js';
import { seriesFor, sortSubjects, subjectTitle, plural } from './series.js';
import SiteHeader from './components/SiteHeader.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import Hero from './components/Hero.jsx';
import Shelf from './components/Shelf.jsx';
import SectionGrid, { resolvePath } from './components/SectionGrid.jsx';
import QuestionList from './components/QuestionList.jsx';
import QuestionViewer from './components/QuestionViewer.jsx';
import QuestionNav from './components/QuestionNav.jsx';
import BookmarksPage from './components/BookmarksPage.jsx';

// The subject's display name without a round trip: the server sends one, but
// only the landing page fetches the whole library. Every other page can name
// its own subject from the local table.
function labelFor(subjectKey) {
  return seriesFor(subjectKey).label || subjectTitle(subjectKey);
}

// A card matches if the search term appears anywhere the visitor could
// reasonably expect: the shelf name, the card's own name, or the names of
// anything one or two levels inside it. Searching "network" should surface the
// domain; searching "fourier" should surface the chapter that contains it.
function nodeMatches(subject, node, term) {
  if (!term) {
    return true;
  }
  const children = node.children || [];
  const haystack = [
    subject.label,
    subject.key,
    node.label,
    ...children.map((c) => c.label),
    ...children.flatMap((c) => (c.children || []).map((g) => g.label))
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

function Page({ children }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}

// --- landing ---------------------------------------------------------------

function LibraryPage() {
  const navigate = useNavigate();
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [segment, setSegment] = useState('all');

  useEffect(() => {
    getLibrary().then(setLibrary).catch((e) => setError(e.message));
  }, []);

  const subjects = useMemo(() => sortSubjects(library?.subjects || []), [library]);

  const shelves = useMemo(() => {
    const term = query.trim().toLowerCase();
    return subjects
      .filter((s) => subjectFilter === 'all' || s.key === subjectFilter)
      .filter((s) => segment !== 'solutions' || s.solutionCount > 0)
      .map((subject) => ({
        subject,
        nodes: (subject.tree || []).filter((node) => nodeMatches(subject, node, term))
      }));
  }, [subjects, subjectFilter, segment, query]);

  const shown = shelves.reduce((sum, s) => sum + s.nodes.length, 0);
  const total = subjects.reduce((sum, s) => sum + (s.tree || []).length, 0);
  const narrowed = query.trim() || subjectFilter !== 'all' || segment !== 'all';

  const resultLine = library
    ? narrowed
      ? `${shown} of ${total} matching${query.trim() ? ` “${query.trim()}”` : ''}`
      : `${plural(total, 'section')} across ${subjects.length} shelves`
    : 'Loading every shelf…';

  // Clicking a card opens that node; clicking one of its buttons opens that
  // child. A leaf child goes straight to its questions, a branch child drills
  // one level further. The URL carries the whole position either way, so every
  // view here is linkable and the back button behaves.
  const open = (subject, node, child) => {
    const params = new URLSearchParams({
      path: (child ? [node.key, child.key] : [node.key]).join(',')
    });
    if (child && child.leaf) {
      params.set('bookId', child.leaf.bookId);
      params.set('fileId', child.leaf.fileId);
    }
    navigate(`/subject/${subject.key}?${params.toString()}`);
  };

  return (
    <Page>
      <Hero
        subjects={subjects}
        query={query}
        onQuery={setQuery}
        subjectFilter={subjectFilter}
        onSubjectFilter={setSubjectFilter}
        segment={segment}
        onSegment={setSegment}
        resultLine={resultLine}
      />

      <main className="wrap">
        {error && <p className="error">{error}</p>}

        {!library && !error && (
          <div className="grid" style={{ marginTop: 40 }} aria-hidden="true">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {shelves.map(({ subject, nodes }) => (
          <Shelf
            key={subject.key}
            subject={subject}
            nodes={nodes}
            query={query.trim()}
            onOpen={(node, child) => open(subject, node, child)}
          />
        ))}

        {library && shelves.length === 0 && (
          <div className="empty">
            <h3>No shelf matches</h3>
            <p>Try clearing the filters.</p>
            <button
              onClick={() => {
                setQuery('');
                setSubjectFilter('all');
                setSegment('all');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </main>
    </Page>
  );
}

// --- drill-down + question list + viewer ------------------------------------

function SubjectBrowser() {
  const { subject } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tree, setTree] = useState(null);
  const [treeError, setTreeError] = useState('');

  const [fileQuestions, setFileQuestions] = useState(null);
  const [fileLabel, setFileLabel] = useState('');

  const [question, setQuestion] = useState(null);
  const [questionError, setQuestionError] = useState('');

  const path = (searchParams.get('path') || '').split(',').filter(Boolean);
  const bookId = searchParams.get('bookId') || '';
  const fileId = searchParams.get('fileId') || '';
  const ordinal = searchParams.get('ordinal') || '';

  useEffect(() => {
    setTree(null);
    setTreeError('');
    getSubjectTree(subject)
      .then((data) => setTree(data.tree))
      .catch((e) => setTreeError(e.message));
  }, [subject]);

  useEffect(() => {
    setFileQuestions(null);
    setQuestion(null);
    if (bookId && fileId) {
      getFileQuestions(bookId, fileId)
        .then((data) => {
          setFileQuestions(data.questions);
          setFileLabel(data.label);
        })
        .catch((e) => setTreeError(e.message));
    }
  }, [bookId, fileId]);

  useEffect(() => {
    setQuestion(null);
    setQuestionError('');
    if (bookId && fileId && ordinal) {
      getQuestion(bookId, fileId, ordinal)
        .then((data) => setQuestion(data))
        .catch((e) => setQuestionError(e.message));
    }
  }, [bookId, fileId, ordinal]);

  const updateParams = (next) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    setSearchParams(params);
  };

  const goToDepth = (depth) => {
    updateParams({ path: path.slice(0, depth).join(','), bookId: null, fileId: null, ordinal: null });
  };

  const openNode = (node) => {
    if (node.leaf) {
      updateParams({
        path: [...path, node.key].join(','),
        bookId: node.leaf.bookId,
        fileId: node.leaf.fileId,
        ordinal: null
      });
      return;
    }
    updateParams({ path: [...path, node.key].join(','), bookId: null, fileId: null, ordinal: null });
  };

  const selectQuestion = (ord) => {
    updateParams({ ordinal: ord });
    // Moving through a series lands you mid-page otherwise, since the previous
    // question may have been long.
    window.scrollTo({ top: 0 });
  };

  const { items, trail } = tree ? resolvePath(tree, path) : { items: [], trail: [] };
  const showingQuestion = Boolean(bookId && fileId && ordinal);
  const showingList = Boolean(bookId && fileId && !ordinal);
  const label = labelFor(subject);

  // The trail's last entry is the section you are in when a file is open, so
  // it becomes the page heading rather than a crumb you can click back to.
  const crumbs = showingList || showingQuestion ? trail.slice(0, -1) : trail;

  return (
    <Page>
      <main className="wrap">
        <div className="page-head">
          <nav className="crumbs" aria-label="Breadcrumb">
            <button onClick={() => navigate('/')}>Study Hub</button>
            <span className="crumb-sep">/</span>
            <button onClick={() => goToDepth(0)}>{label}</button>
            {crumbs.map((node, idx) => (
              <Fragment key={node.key}>
                <span className="crumb-sep">/</span>
                <button onClick={() => goToDepth(idx + 1)}>{node.label}</button>
              </Fragment>
            ))}
            {showingQuestion && (
              <>
                <span className="crumb-sep">/</span>
                <button onClick={() => updateParams({ ordinal: null })}>
                  {fileLabel || 'Questions'}
                </button>
                <span className="crumb-sep">/</span>
                <span className="crumb-now">Q{question?.questionId || ordinal}</span>
              </>
            )}
          </nav>

          {!showingList && !showingQuestion && (
            <div className="page-title">
              <h1>{trail.length ? trail[trail.length - 1].label : label}</h1>
              {tree && (
                <span className="page-count">
                  {plural(
                    trail.length ? trail[trail.length - 1].questionCount : totalOf(tree),
                    'question'
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {treeError && <p className="error">{treeError}</p>}
        {!tree && !treeError && <p className="muted">Loading…</p>}

        {tree && !showingQuestion && !showingList && (
          <SectionGrid subjectKey={subject} items={items} depth={path.length} onOpen={openNode} />
        )}

        {showingList && fileQuestions && (
          <QuestionList
            subjectKey={subject}
            fileLabel={fileLabel || (trail.length ? trail[trail.length - 1].label : label)}
            questions={fileQuestions}
            onSelect={selectQuestion}
          />
        )}

        {showingQuestion && (
          <div>
            {questionError && <p className="error">{questionError}</p>}
            {!questionError && !question && <p className="muted">Loading…</p>}
            {question && <QuestionViewer bookId={bookId} subject={subject} question={question} />}
            {fileQuestions && (
              <QuestionNav questions={fileQuestions} ordinal={ordinal} onSelect={selectQuestion} />
            )}
          </div>
        )}
      </main>
    </Page>
  );
}

function totalOf(tree) {
  return tree.reduce((sum, node) => sum + (node.questionCount || 0), 0);
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route
        path="/bookmarks"
        element={
          <Page>
            <main className="wrap">
              <BookmarksPage />
            </main>
          </Page>
        }
      />
      <Route path="/subject/:subject" element={<SubjectBrowser />} />
    </Routes>
  );
}
