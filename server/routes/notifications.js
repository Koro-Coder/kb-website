const express = require('express');

// Read-side only. Notifications are created by kb-ingest when an admin
// resolves a report — nothing a reader does creates one, so there is no POST.
function createNotificationsRouter({ store, requireAuth, now = Date.now }) {
  const router = express.Router();

  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      const [notifications, unread] = await Promise.all([
        store.listForUser(req.user.id),
        store.countUnread(req.user.id)
      ]);
      res.json({ notifications, unread });
    } catch (error) {
      next(error);
    }
  });

  // Opening the bell marks everything read in one go, which is what the count
  // badge means — "things you have not looked at yet".
  router.post('/read', async (req, res, next) => {
    try {
      const marked = await store.markAllRead(req.user.id, new Date(now()).toISOString());
      res.json({ marked });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/read', async (req, res, next) => {
    try {
      const marked = await store.markRead(req.user.id, req.params.id, new Date(now()).toISOString());
      if (!marked) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const removed = await store.remove(req.user.id, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createNotificationsRouter };
