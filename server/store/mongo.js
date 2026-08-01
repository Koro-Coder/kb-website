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
  videos: 'videos'
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

module.exports = { getDb, collection, ping, close, databaseName, COLLECTIONS };
