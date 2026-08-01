const express = require('express');
const { parseQuestionRef, questionKey } = require('../questionRef');

// One collection with a type discriminator rather than three near-identical
// ones: an admin reviewing the queue wants everything about a question in one
// place, and the three differ only in what they mean.
const TYPES = {
  // Something is wrong with the question itself — misprinted option, missing
  // figure, wrong answer key.
  question_issue: { requiresComment: true },
  // Something is wrong with the worked solution.
  solution_issue: { requiresComment: true },
  // No video solution exists yet and someone wants one. Carries no information
  // beyond "me too", so demanding a comment would just be friction.
  video_request: { requiresComment: false }
};

const MAX_COMMENT = 4000;

function reportId(userId, type, ref) {
  return `${userId}::${type}::${questionKey(ref)}`;
}

function parseComment(raw, requiresComment) {
  if (raw === undefined || raw === null) {
    return requiresComment ? { error: 'A comment is required' } : { comment: null };
  }
  if (typeof raw !== 'string') {
    return { error: 'comment must be text' };
  }
  const comment = raw.trim();
  if (!comment) {
    return requiresComment ? { error: 'A comment is required' } : { comment: null };
  }
  // Rejected rather than truncated: silently dropping the end of someone's
  // bug report is worse than telling them it was too long.
  if (comment.length > MAX_COMMENT) {
    return { error: `comment must be ${MAX_COMMENT} characters or fewer` };
  }
  return { comment };
}

function createReportsRouter({ store, requireAuth, now = Date.now }) {
  const router = express.Router();

  router.use(requireAuth);

  router.get('/mine', async (req, res, next) => {
    try {
      res.json(await store.listForUser(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const body = req.body || {};
    const definition = TYPES[body.type];
    if (!definition) {
      res.status(400).json({ error: `type must be one of: ${Object.keys(TYPES).join(', ')}` });
      return;
    }

    const { ref, hints, error } = parseQuestionRef(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { comment, error: commentError } = parseComment(body.comment, definition.requiresComment);
    if (commentError) {
      res.status(400).json({ error: commentError });
      return;
    }

    try {
      const id = reportId(req.user.id, body.type, ref);
      const timestamp = new Date(now()).toISOString();
      // Re-reporting the same thing edits the existing report rather than
      // filing a second one — but a question problem, a solution problem and a
      // video request are three different reports about the same question, so
      // the type is part of the id.
      const existing = await store.get(req.user.id, id);

      const report = {
        id,
        userId: req.user.id,
        type: body.type,
        ...ref,
        ...hints,
        comment,
        status: existing ? existing.status : 'open',
        createdAt: existing ? existing.createdAt : timestamp,
        updatedAt: timestamp
      };

      await store.upsert(report);
      res.status(existing ? 200 : 201).json(report);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      // Scoped by userId, so a guessed id belonging to someone else is a 404
      // rather than someone else's report disappearing.
      const removed = await store.remove(req.user.id, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createReportsRouter, reportId, TYPES, MAX_COMMENT };
