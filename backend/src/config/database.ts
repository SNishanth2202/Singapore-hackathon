import { connectMongoDB, disconnectMongoDB } from '../integrations/mongodb/connection';
import { connectNeo4j, disconnectNeo4j } from '../integrations/neo4j/connection';
import { logger } from '../utils/logger';

export async function initializeDatabases(): Promise<void> {
  await Promise.allSettled([connectMongoDB(), connectNeo4j()]);
  logger.info('Database connection checks complete');
}

export async function closeDatabases(): Promise<void> {
  await Promise.allSettled([disconnectMongoDB(), disconnectNeo4j()]);
  logger.info('All database connections closed');
}

export { connectMongoDB, disconnectMongoDB } from '../integrations/mongodb/connection';
export { connectNeo4j, disconnectNeo4j } from '../integrations/neo4j/connection';
