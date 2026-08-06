// In-memory implementations of the auth stores, used by the tests so the
// suite stays hermetic — no mongod, no network, no credentials. These
// implement exactly the same contract as server/store/{user,token,bookmark}
// Store.js; if you add a method there, add it here or the tests stop covering
// it.

const crypto = require('crypto');

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createUserStore() {
  const byId = new Map();

  return {
    async findById(id) {
      return clone(byId.get(id)) || null;
    },

    async findByProvider(provider, providerUserId) {
      for (const user of byId.values()) {
        if (user.provider === provider && user.providerUserId === providerUserId) {
          return clone(user);
        }
      }
      return null;
    },

    async findByEmail(email) {
      for (const user of byId.values()) {
        if (user.email === email) {
          return clone(user);
        }
      }
      return null;
    },

    async findByUsername(usernameLower) {
      for (const user of byId.values()) {
        if (user.usernameLower === usernameLower) {
          return clone(user);
        }
      }
      return null;
    },

    async create(user) {
      const id = user.id || crypto.randomUUID();
      const record = { ...user, id };
      byId.set(id, record);
      return clone(record);
    },

    // Mirrors the Mongo store: null both when the name is taken and when this
    // account already has one. The taken-check stands in for the unique index.
    async setUsername(id, username, usernameLower, at) {
      for (const user of byId.values()) {
        if (user.usernameLower === usernameLower) {
          return null;
        }
      }
      const user = byId.get(id);
      if (!user || user.usernameLower) {
        return null;
      }
      user.username = username;
      user.usernameLower = usernameLower;
      user.usernameSetAt = at;
      return clone(user);
    },

    async recordLogin(id, at) {
      const user = byId.get(id);
      if (user) {
        user.lastLoginAt = at;
      }
    },

    // Test-only helpers.
    _all() {
      return Array.from(byId.values()).map(clone);
    },
    _count() {
      return byId.size;
    }
  };
}

function createRefreshTokenStore() {
  const byHash = new Map();

  return {
    async create(record) {
      byHash.set(record.hash, { ...record });
      return clone(record);
    },

    async findByHash(hash) {
      return clone(byHash.get(hash)) || null;
    },

    async markReplaced(hash, replacedByHash, at) {
      const record = byHash.get(hash);
      if (record) {
        record.replacedByHash = replacedByHash;
        record.usedAt = at;
      }
    },

    async revoke(hash, at) {
      const record = byHash.get(hash);
      if (record) {
        record.revokedAt = at;
      }
    },

    async revokeFamily(familyId, at) {
      let revoked = 0;
      for (const record of byHash.values()) {
        if (record.familyId === familyId && !record.revokedAt) {
          record.revokedAt = at;
          revoked += 1;
        }
      }
      return revoked;
    },

    // Test-only helpers.
    _all() {
      return Array.from(byHash.values()).map(clone);
    },
    _family(familyId) {
      return this._all().filter((r) => r.familyId === familyId);
    }
  };
}

function createBookmarkStore() {
  const byKey = new Map();

  return {
    async list(userId) {
      return Array.from(byKey.values())
        .filter((b) => b.userId === userId)
        .map(clone);
    },

    async add(bookmark) {
      // Upsert: bookmarking twice is not an error, it is a no-op.
      byKey.set(bookmark.id, { ...bookmark });
      return clone(bookmark);
    },

    async remove(userId, id) {
      const existing = byKey.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }
      byKey.delete(id);
      return true;
    },

    async exists(userId, id) {
      const existing = byKey.get(id);
      return Boolean(existing && existing.userId === userId);
    },

    _count() {
      return byKey.size;
    }
  };
}

function createReportStore() {
  const byId = new Map();

  return {
    async listForUser(userId) {
      return Array.from(byId.values())
        .filter((r) => r.userId === userId)
        .map(clone);
    },

    async get(userId, id) {
      const report = byId.get(id);
      return report && report.userId === userId ? clone(report) : null;
    },

    async upsert(report) {
      byId.set(report.id, { ...report });
      return clone(report);
    },

    async remove(userId, id) {
      const existing = byId.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }
      byId.delete(id);
      return true;
    },

    _all() {
      return Array.from(byId.values()).map(clone);
    },
    _count() {
      return byId.size;
    }
  };
}

// Ratings and reports have the same shape of access, so they share one
// implementation here — the difference is what a row means, not how it is
// stored.
function createKeyedByUserStore() {
  const byId = new Map();

  return {
    async listForUser(userId) {
      return Array.from(byId.values())
        .filter((r) => r.userId === userId)
        .map(clone);
    },
    async get(userId, id) {
      const row = byId.get(id);
      return row && row.userId === userId ? clone(row) : null;
    },
    async upsert(row) {
      byId.set(row.id, { ...row });
      return clone(row);
    },
    async remove(userId, id) {
      const existing = byId.get(id);
      if (!existing || existing.userId !== userId) {
        return false;
      }
      byId.delete(id);
      return true;
    },
    _all() {
      return Array.from(byId.values()).map(clone);
    },
    _count() {
      return byId.size;
    }
  };
}

function createStores() {
  return {
    users: createUserStore(),
    refreshTokens: createRefreshTokenStore(),
    bookmarks: createBookmarkStore(),
    reports: createReportStore(),
    ratings: createKeyedByUserStore(),
    notifications: createNotificationStore()
  };
}

function createNotificationStore(seed = []) {
  const byId = new Map(seed.map((n) => [n.id, { ...n }]));

  return {
    async listForUser(userId) {
      return Array.from(byId.values())
        .filter((n) => n.userId === userId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone);
    },
    async countUnread(userId) {
      return Array.from(byId.values()).filter((n) => n.userId === userId && !n.readAt).length;
    },
    async markAllRead(userId, at) {
      let n = 0;
      for (const row of byId.values()) {
        if (row.userId === userId && !row.readAt) {
          row.readAt = at;
          n += 1;
        }
      }
      return n;
    },
    async markRead(userId, id, at) {
      const row = byId.get(id);
      if (!row || row.userId !== userId) return false;
      row.readAt = at;
      return true;
    },
    async remove(userId, id) {
      const row = byId.get(id);
      if (!row || row.userId !== userId) return false;
      byId.delete(id);
      return true;
    },
    // Test-only: stands in for kb-ingest, which is what really creates these.
    _seed(notification) {
      byId.set(notification.id, { readAt: null, ...notification });
    },
    _count() {
      return byId.size;
    }
  };
}

module.exports = {
  createStores,
  createUserStore,
  createRefreshTokenStore,
  createBookmarkStore,
  createReportStore
};
