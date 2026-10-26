const mongoose = require('mongoose');

// Disable Mongoose query buffering so offline/fallback operations fail instantly without hanging
mongoose.set('bufferCommands', false);

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * MongoDB Connection Handler
 * Connects to Mongoose URI if provided, caches connection across serverless lambda invocations.
 */
const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.warn('[MongoDB] MONGODB_URI not configured in environment. Using in-memory fallback.');
    return null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 5,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      autoIndex: process.env.NODE_ENV !== 'production',
    };

    cached.promise = mongoose
      .connect(mongoURI, opts)
      .then((m) => {
        console.log(`🍃 MONGODB CONNECTED: host=${m.connection.host}`);
        return m;
      })
      .catch((err) => {
        console.error('⚠️ MONGODB CONNECTION ERROR:', err.message);
        cached.promise = null;
        cached.conn = null;
        return null;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    console.error('⚠️ MONGODB RESOLUTION ERROR:', err.message);
    return null;
  }
};

const isDbConnected = () => {
  return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.isDbConnected = isDbConnected;
