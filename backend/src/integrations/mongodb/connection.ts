import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export async function connectMongoDB(): Promise<void> {
  try {
    mongoose.set('strictQuery', false);
    mongoose.set('bufferCommands', false);

    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connection established');
    });

    mongoose.connection.on('error', (err: Error) => {
      logger.error('MongoDB connection error', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to connect to MongoDB — running in degraded mode', { error: err.message });
    // Do not rethrow, allow the application to start and report degraded health
  }
}

export async function disconnectMongoDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  } catch (error) {
    const err = error as Error;
    logger.error('Error closing MongoDB connection', { error: err.message });
  }
}

export function isMongoDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
