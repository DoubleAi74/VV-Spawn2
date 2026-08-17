import mongoose from 'mongoose';

// Use a module-level cached connection to avoid exhausting connections
// across serverless function invocations and hot-reloads.
let cached = global._mongooseConnection;

if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('Please define MONGODB_URI environment variable');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        // Fail fast rather than holding a serverless invocation open for the
        // 30s default while the driver hunts for a reachable server.
        serverSelectionTimeoutMS: 10000,
        // Each instance is one short-lived invocation; a large pool per
        // instance just multiplies connections against the cluster limit.
        maxPoolSize: 10,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Without this the rejected promise stays cached forever: every later
    // request awaits the same failure and the instance never recovers from a
    // transient blip without a redeploy.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
