// MongoDB implementations of the three stores the auth layer depends on.
// They implement the same contract as server/test-support/memoryStores.js —
// that pairing is what lets the whole OAuth flow be tested without a database.

const crypto = require('crypto');
const { collection, COLLECTIONS } = require('./mongo');

// _id carries the natural key throughout, so it is mapped back to the field
// name the service layer expects.
function toUser(doc) {
  if (!doc) {
    return null;
  }
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function createUserStore() {
  return {
    async findById(id) {
      const users = await collection(COLLECTIONS.users);
      return toUser(await users.findOne({ _id: id }));
    },

    async findByProvider(provider, providerUserId) {
      const users = await collection(COLLECTIONS.users);
      return toUser(await users.findOne({ provider, providerUserId }));
    },

    async findByEmail(email) {
      const users = await collection(COLLECTIONS.users);
      return toUser(await users.findOne({ email }));
    },

    async create(user) {
      const users = await collection(COLLECTIONS.users);
      const { id, ...fields } = user;
      const _id = id || crypto.randomUUID();
      await users.insertOne({ _id, ...fields });
      return { id: _id, ...fields };
    },

    async recordLogin(id, at) {
      const users = await collection(COLLECTIONS.users);
      await users.updateOne({ _id: id }, { $set: { lastLoginAt: at } });
    }
  };
}

// expiresAt is stored as a Date so the TTL index can reap expired rows, but
// crosses the boundary as an ISO string to match the in-memory store.
function toTokenRecord(doc) {
  if (!doc) {
    return null;
  }
  const { _id, expiresAt, ...rest } = doc;
  return {
    hash: _id,
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    ...rest
  };
}

function createRefreshTokenStore() {
  return {
    async create(record) {
      const tokens = await collection(COLLECTIONS.refreshTokens);
      const { hash, expiresAt, ...rest } = record;
      await tokens.insertOne({ _id: hash, expiresAt: new Date(expiresAt), ...rest });
      return record;
    },

    async findByHash(hash) {
      const tokens = await collection(COLLECTIONS.refreshTokens);
      return toTokenRecord(await tokens.findOne({ _id: hash }));
    },

    async markReplaced(hash, replacedByHash, at) {
      const tokens = await collection(COLLECTIONS.refreshTokens);
      await tokens.updateOne({ _id: hash }, { $set: { replacedByHash, usedAt: at } });
    },

    async revoke(hash, at) {
      const tokens = await collection(COLLECTIONS.refreshTokens);
      await tokens.updateOne({ _id: hash }, { $set: { revokedAt: at } });
    },

    async revokeFamily(familyId, at) {
      const tokens = await collection(COLLECTIONS.refreshTokens);
      const result = await tokens.updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: at } }
      );
      return result.modifiedCount;
    }
  };
}

// Shared by bookmarks and reports: both carry their natural key in _id.
function withId(doc) {
  if (!doc) {
    return null;
  }
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function createBookmarkStore() {
  return {
    async list(userId) {
      const bookmarks = await collection(COLLECTIONS.bookmarks);
      const rows = await bookmarks.find({ userId }).sort({ createdAt: -1 }).toArray();
      return rows.map(toBookmark);
    },

    async add(bookmark) {
      const bookmarks = await collection(COLLECTIONS.bookmarks);
      const { id, ...fields } = bookmark;
      await bookmarks.replaceOne({ _id: id }, { ...fields }, { upsert: true });
      return bookmark;
    },

    async remove(userId, id) {
      const bookmarks = await collection(COLLECTIONS.bookmarks);
      // Scoped by userId so a guessed id cannot delete someone else's row.
      const result = await bookmarks.deleteOne({ _id: id, userId });
      return result.deletedCount > 0;
    },

    async exists(userId, id) {
      const bookmarks = await collection(COLLECTIONS.bookmarks);
      return (await bookmarks.countDocuments({ _id: id, userId }, { limit: 1 })) > 0;
    }
  };
}

function createReportStore() {
  return {
    async listForUser(userId) {
      const reports = await collection(COLLECTIONS.reports);
      const rows = await reports.find({ userId }).sort({ createdAt: -1 }).toArray();
      return rows.map(toBookmark);
    },

    async get(userId, id) {
      const reports = await collection(COLLECTIONS.reports);
      return withId(await reports.findOne({ _id: id, userId }));
    },

    async upsert(report) {
      const reports = await collection(COLLECTIONS.reports);
      const { id, ...fields } = report;
      await reports.replaceOne({ _id: id }, { ...fields }, { upsert: true });
      return report;
    },

    async remove(userId, id) {
      const reports = await collection(COLLECTIONS.reports);
      const result = await reports.deleteOne({ _id: id, userId });
      return result.deletedCount > 0;
    }
  };
}

function createStores() {
  return {
    users: createUserStore(),
    refreshTokens: createRefreshTokenStore(),
    bookmarks: createBookmarkStore(),
    reports: createReportStore()
  };
}

module.exports = {
  createStores,
  createUserStore,
  createRefreshTokenStore,
  createBookmarkStore,
  createReportStore
};
