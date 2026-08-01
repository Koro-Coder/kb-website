import { useEffect, useState } from 'react';
import { Routes, Route, Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getSubjects, getSubjectTree, getFileQuestions, getQuestion } from './api.js';
import TreeBrowser from './components/TreeBrowser.jsx';
import QuestionGrid from './components/QuestionGrid.jsx';
import QuestionViewer from './components/QuestionViewer.jsx';
import AccountBar from './components/AccountBar.jsx';
import BookmarksPage from './components/BookmarksPage.jsx';

function SubjectPicker() {
  const [subjects, setSubjects] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSubjects().then(setSubjects).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <AccountBar />
      <header>
        <h1>PrepFusion Question Bank</h1>
        <p className="muted">Pick a subject to browse questions.</p>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {subjects?.map((s) => (
          <Link key={s.key} className="tile" to={`/subject/${s.key}`}>
            {s.label}
            <span className="muted small"> ({s.bookCount} book{s.bookCount === 1 ? '' : 's'})</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

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

  const handleNavigateToDepth = (depth) => {
    updateParams({ path: path.slice(0, depth).join(','), bookId: null, fileId: null, ordinal: null });
  };

  const handleEnterBranch = (key) => {
    updateParams({ path: [...path, key].join(','), bookId: null, fileId: null, ordinal: null });
  };

  const handleSelectLeaf = (leaf) => {
    updateParams({ bookId: leaf.bookId, fileId: leaf.fileId, ordinal: null });
  };

  const handleSelectQuestion = (ord) => {
    updateParams({ ordinal: ord });
  };

  const showingQuestion = Boolean(bookId && fileId && ordinal);
  const showingGrid = Boolean(bookId && fileId && !ordinal);

  return (
    <div className="app">
      <AccountBar />
      <header>
        <p className="muted small">
          <button className="link" onClick={() => navigate('/')}>
            ← All subjects
          </button>
        </p>
        <h1>{subject[0].toUpperCase() + subject.slice(1)}</h1>
      </header>

      {treeError && <p className="error">{treeError}</p>}

      {!showingQuestion && !showingGrid && tree && (
        <TreeBrowser
          tree={tree}
          path={path}
          onNavigateToDepth={handleNavigateToDepth}
          onEnterBranch={handleEnterBranch}
          onSelectLeaf={handleSelectLeaf}
        />
      )}

      {showingGrid && fileQuestions && (
        <QuestionGrid
          fileLabel={fileLabel}
          questions={fileQuestions}
          onSelect={handleSelectQuestion}
          onBack={() => updateParams({ bookId: null, fileId: null })}
        />
      )}

      {showingQuestion && (
        <div>
          <div className="breadcrumbs">
            <button className="link" onClick={() => updateParams({ ordinal: null })}>
              ← Back to {fileLabel || 'list'}
            </button>
          </div>
          {questionError && <p className="error">{questionError}</p>}
          {!questionError && !question && <p className="muted">Loading…</p>}
          {question && <QuestionViewer bookId={bookId} subject={subject} question={question} />}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SubjectPicker />} />
      <Route path="/bookmarks" element={<BookmarksPage />} />
      <Route path="/subject/:subject" element={<SubjectBrowser />} />
    </Routes>
  );
}
