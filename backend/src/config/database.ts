import { connectMongoDB, disconnectMongoDB } from '../integrations/mongodb/connection';
import { connectNeo4j, disconnectNeo4j } from '../integrations/neo4j/connection';
import { env } from './env';
import { cloudConfigurationProblems } from './cloud';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export async function initializeDatabases(): Promise<void> {
  if (env.STORAGE_MODE === 'memory') {
    if (env.NODE_ENV === 'production' || !env.LOCAL_DEMO_MODE) throw new AppError('Memory storage is available only in explicit non-production sample preview.', 500, 'INVALID_STORAGE_MODE');
    return;
  }
  const problems = cloudConfigurationProblems(env);
  if (problems.length) throw new AppError(problems.join(' '), 503, 'CLOUD_CONFIGURATION_REQUIRED');
  const results = await Promise.allSettled([connectMongoDB(), connectNeo4j()]);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) {
    await closeDatabases();
    throw failure.reason;
  }
  logger.info('MongoDB Atlas and Neo4j Aura are ready');
}
export async function closeDatabases(): Promise<void> {
  await Promise.allSettled([disconnectMongoDB(), disconnectNeo4j()]);
}
export { connectMongoDB, disconnectMongoDB } from '../integrations/mongodb/connection';
export { connectNeo4j, disconnectNeo4j } from '../integrations/neo4j/connection';
