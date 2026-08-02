const express = require('express');
const { parseQuestionRef, questionKey } = require('../questionRef');

// How hard a reader found a question. One rating per person per question —
// re-rating replaces, it does not accumulate, or a single user clicking about
// would skew the difficulty an admin sees.
const RATINGS = ['easy', 'medium', 'hard'];

function ratingId(userId, ref) {
  return `${userId}::${questionKey(ref)}`;
}

function createRatingsRouter({ store, requireAuth, now = Date.now }) {
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
    if (!RATINGS.includes(body.rating)) {
      res.status(400).json({ error: `rating must be one of: ${RATINGS.join(', ')}` });
      return;
    }

    const { ref, hints, error } = parseQuestionRef(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    try {
      const id = ratingId(req.user.id, ref);
      const existing = await store.get(req.user.id, id);
      const timestamp = new Date(now()).toISOString();
      const rating = {
        id,
        userId: req.user.id,
        ...ref,
        ...hints,
        rating: body.rating,
        createdAt: existing ? existing.createdAt : timestamp,
        updatedAt: timestamp
      };
      await store.upsert(rating);
      // 200 on a change of mind, 201 the first time — the client uses it only
      // to decide whether to say "rated" or "updated".
      res.status(existing ? 200 : 201).json(rating);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const removed = await store.remove(req.user.id, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Rating not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createRatingsRouter, ratingId, RATINGS };
