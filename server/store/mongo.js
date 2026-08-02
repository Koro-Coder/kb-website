// MongoDB connection shared by every store module. One client per process,
// created lazily and reused: the driver pools connections internally, so
// opening a client per request is how you exhaust an Atlas connection limit.
//
// Intentionally identical to kb-ingest's copy, for the same reason
// server/parsing/ is — the two projects must agree on the database layout.

const { MongoClient } = require('mongodb');

const DEFAULT_DB = 'prepfusion_kb';

const COLLECTIONS = {
  subjects: 'subjects',
  books: 'books',
  videos: 'videos',
  // Owned by this project rather than kb-ingest: the site is where users sign
  // in and where their bookmarks/reports are created.
  users: 'users',
  refreshTokens: 'refreshTokens',
  bookmarks: 'bookmarks',
  reports: 'reports',
  ratings: 'ratings',
  // Created by kb-ingest when an admin resolves a report; read here.
  notifications: 'notifications'
};

let clientPromise = null;

function connectionUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Note that the Atlas service-account variables ' +
        '(MONGODB_CLIENT_ID / MONGODB_CLIENT_SECRET) authenticate only to the ' +
        'Atlas Admin API — the driver needs a database connection string.'
    );
  }
  return uri;
}

function databaseName() {
  return process.env.MONGODB_DB || DEFAULT_DB;
}

function connect() {
  if (!clientPromise) {
    clientPromise = MongoClient.connect(connectionUri(), {
      serverSelectionTimeoutMS: 10000
    }).catch((error) => {
      // Never cache a rejected connection, or every later call keeps replaying
      // the first failure instead of retrying.
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

async function getDb() {
  const client = await connect();
  return client.db(databaseName());
}

async function collection(name) {
  const db = await getDb();
  return db.collection(name);
}

// The knowledge-base collections are indexed by kb-ingest, which owns their
// writes. These are the site's own.
async function ensureAuthIndexes() {
  const db = await getDb();
  await db
    .collection(COLLECTIONS.users)
    .createIndex({ provider: 1, providerUserId: 1 }, { unique: true });
  await db.collection(COLLECTIONS.users).createIndex({ email: 1 });
  await db.collection(COLLECTIONS.refreshTokens).createIndex({ familyId: 1 });
  // Expired refresh tokens are worthless; let MongoDB reap them rather than
  // growing the collection forever. Requires expiresAt to be a real Date.
  await db.collection(COLLECTIONS.refreshTokens).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection(COLLECTIONS.bookmarks).createIndex({ userId: 1, createdAt: -1 });
  await db.collection(COLLECTIONS.reports).createIndex({ userId: 1, createdAt: -1 });
  // How an admin queue will read it: newest open reports of a given type, and
  // everything filed against one question.
  await db.collection(COLLECTIONS.reports).createIndex({ status: 1, type: 1, createdAt: -1 });
  await db
    .collection(COLLECTIONS.reports)
    .createIndex({ bookId: 1, fileId: 1, year: 1, questionNum: 1 });
  await db.collection(COLLECTIONS.ratings).createIndex({ userId: 1, updatedAt: -1 });
  // How the admin difficulty analytics reads it: every rating for one question.
  await db
    .collection(COLLECTIONS.ratings)
    .createIndex({ bookId: 1, fileId: 1, year: 1, questionNum: 1 });
}

async function ping() {
  const db = await getDb();
  await db.command({ ping: 1 });
  return true;
}

async function close() {
  if (!clientPromise) {
    return;
  }
  const client = await clientPromise;
  clientPromise = null;
  await client.close();
}

module.exports = { getDb, collection, ensureAuthIndexes, ping, close, databaseName, COLLECTIONS };
