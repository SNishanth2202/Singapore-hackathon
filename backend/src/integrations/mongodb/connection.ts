import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

let listenersInstalled = false;
export async function connectMongoDB(): Promise<void> {
  mongoose.set('strictQuery', false);
  mongoose.set('bufferCommands', false);
  if (!listenersInstalled) {
    mongoose.connection.on('connected', () => logger.info('MongoDB Atlas connection established'));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB Atlas disconnected'));
    mongoose.connection.on('error', () => logger.error('MongoDB Atlas connection error; check database credentials and the Atlas IP access list'));
    listenersInstalled = true;
  }
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME, tls: true,
      serverSelectionTimeoutMS: env.DB_CONNECTION_TIMEOUT_MS,
      connectTimeoutMS: env.DB_CONNECTION_TIMEOUT_MS,
      socketTimeoutMS: 45000, maxPoolSize: env.DB_MAX_POOL_SIZE,
      minPoolSize: 0, autoIndex: false,
    });
    await mongoose.connection.db!.command({ ping: 1 });
  } catch {
    throw new AppError('MongoDB Atlas connection failed. Check the URI, database user and allowed client IP.', 503, 'ATLAS_CONNECTION_FAILED');
  }
}
export async function disconnectMongoDB(): Promise<void> { await mongoose.disconnect(); }
export function isMongoDBConnected(): boolean { return mongoose.connection.readyState === 1; }
export async function verifyMongoConnectivity(): Promise<boolean> {
  if (!isMongoDBConnected() || !mongoose.connection.db) return false;
  try { await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 3000 }); return true; }
  catch { return false; }
}
