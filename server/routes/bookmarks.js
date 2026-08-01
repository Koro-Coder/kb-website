const express = require('express');
const { parseQuestionRef, questionKey } = require('../questionRef');

function bookmarkId(userId, ref) {
  return `${userId}::${questionKey(ref)}`;
}

function createBookmarksRouter({ store, requireAuth, now = Date.now }) {
  const router = express.Router();

  // Every route is gated: bookmarks only exist relative to a user.
  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      res.json(await store.list(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const { ref, hints, error } = parseQuestionRef(req.body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    try {
      const id = bookmarkId(req.user.id, ref);
      // Bookmarking twice is a no-op rather than an error — the UI treats the
      // star as a toggle and may double-fire.
      const already = await store.exists(req.user.id, id);
      const bookmark = {
        id,
        userId: req.user.id,
        ...ref,
        ...hints,
        createdAt: new Date(now()).toISOString()
      };
      await store.add(bookmark);
      res.status(already ? 200 : 201).json(bookmark);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      // remove() is scoped by userId, so a guessed id belonging to someone
      // else is a 404 rather than someone else's bookmark disappearing.
      const removed = await store.remove(req.user.id, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Bookmark not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createBookmarksRouter, bookmarkId };
