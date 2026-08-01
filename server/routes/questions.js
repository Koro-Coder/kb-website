const express = require('express');
const kbStore = require('../store/kbStore');
const github = require('../github/client');
const { getAdapter } = require('../parsing/adapters');
const { parseQuestions, parseSolutions } = require('../parsing/texTokenizer');
const videoStore = require('../store/videoStore');

const router = express.Router();

function getToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set in the environment');
  }
  return token;
}

function findFile(book, fileId) {
  return (book.files || []).find((f) => f.fileId === fileId);
}

// The store is over the network now, so a failed read is no longer proof that
// the book is missing. Only kbStore's own not-found error becomes a 404;
// anything else (connection refused, auth, timeout) must surface as a 500.
function isNotFound(error) {
  return /^Book not found:/.test(error.message);
}

// Ordinal question list for one tex file (Q1, Q2, Q3...) — served straight
// from the knowledge base index, no GitHub call needed.
router.get('/books/:bookId/file', async (req, res) => {
  const { fileId } = req.query;
  if (!fileId) {
    res.status(400).json({ error: 'fileId query parameter is required' });
    return;
  }
  try {
    const book = await kbStore.readBook(req.params.bookId);
    const file = findFile(book, fileId);
    if (!file) {
      res.status(404).json({ error: `File not found: ${fileId}` });
      return;
    }
    res.json({
      fileId: file.fileId,
      label: file.label,
      questionCount: file.questionCount,
      questions: file.questions,
      warnings: file.warnings
    });
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: `Book not found: ${req.params.bookId}` });
      return;
    }
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Full rendered question (body/options/answer) — fetched + parsed live from
// GitHub so it always reflects the current repo content.
router.get('/books/:bookId/question', async (req, res) => {
  const { fileId, ordinal } = req.query;
  if (!fileId || !ordinal) {
    res.status(400).json({ error: 'fileId and ordinal query parameters are required' });
    return;
  }
  try {
    const book = await kbStore.readBook(req.params.bookId);
    const file = findFile(book, fileId);
    if (!file) {
      res.status(404).json({ error: `File not found: ${fileId}` });
      return;
    }

    const adapter = getAdapter(book.parserProfile);
    const { owner, name, branch, rootPath } = book.repo;
    const fullPath = rootPath ? `${rootPath}/${file.path}` : file.path;
    const tex = await github.getFileText(owner, name, branch, fullPath, getToken());

    const { questions } = parseQuestions(tex, adapter, {
      chapterFolder: file.chapterFolder || '',
      imgFolder: file.imgFolder || ''
    });
    const question = questions.find((q) => q.ordinal === Number(ordinal));
    if (!question) {
      res.status(404).json({ error: `Question ordinal ${ordinal} not found in ${fileId}` });
      return;
    }

    // Solutions live in a mirrored repo, joined on (file, question number) —
    // the printed Q-id is not unique per book for Aptitude, whose ids omit the
    // session. A missing/unreadable solution is never fatal: the question
    // still renders, just without a solution below it.
    let solution = null;
    if (book.solutionRepo && file.solutionPath) {
      try {
        const sr = book.solutionRepo;
        const solFullPath = sr.rootPath ? `${sr.rootPath}/${file.solutionPath}` : file.solutionPath;
        const solTex = await github.getFileText(sr.owner, sr.name, sr.branch, solFullPath, getToken());
        const { solutions } = parseSolutions(solTex, adapter, {
          chapterFolder: file.chapterFolder || '',
          imgFolder: file.imgFolder || ''
        });
        // Must match on BOTH year and question number: a chapter file spans
        // many years and restarts numbering each year, so questionNum alone
        // is ambiguous (2021 Q1, 2025 Q1, ... all collide).
        solution =
          solutions.find((s) => s.questionNum === question.questionNum && s.year === question.year) || null;

        // A curated link (uploaded via the video CSV) wins over whatever the
        // LaTeX source carries, so videos can be added without editing the
        // solution repo.
        if (solution) {
          const override = await videoStore.getVideo(
            req.params.bookId,
            file.fileId,
            question.year,
            question.questionNum
          );
          if (override) {
            solution.video = override;
          }
        }
      } catch (error) {
        console.error(`Solution lookup failed for ${fileId}#${ordinal}:`, error.message);
      }
    }

    res.json({
      solution,
      bookId: book.bookId,
      fileId: file.fileId,
      ordinal: question.ordinal,
      questionId: question.questionId,
      questionType: question.questionType,
      starred: question.starred,
      year: question.year,
      answer: question.answer,
      marks: question.marks,
      session: question.session,
      commonData: question.commonData,
      body: question.body,
      options: question.options
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
