import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initializeDatabases, closeDatabases } from './config/database';
import { applyConstraints } from './integrations/neo4j/graphService';
import { deploymentConfigurationProblems } from './config/deployment';
import { businessKnowledgeStore } from './business/store';
import { AppError } from './utils/errors';
import { ensureCloudIndexes } from './models/CloudStorage';
import { startGraphSyncWorker } from './integrations/neo4j/syncWorker';

const PORT = env.PORT;

async function start(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    const problems = deploymentConfigurationProblems(env);
    if (problems.length) throw new AppError(problems.join(' '), 503, 'DEPLOYMENT_CONFIGURATION_REQUIRED');
  }
  // Connect to databases
  await initializeDatabases();

  if (env.STORAGE_MODE === 'cloud') {
    await ensureCloudIndexes();
    await applyConstraints();
    await businessKnowledgeStore.read();
  }
  const stopGraphSync = env.STORAGE_MODE === 'cloud' ? startGraphSyncWorker() : async () => {};

  const server = app.listen(PORT, env.HOST, () => {
    logger.info(`Singtel Scout backend started`, {
      port: PORT,
      env: env.NODE_ENV,
      url: `http://localhost:${PORT}/api/${env.API_VERSION}`,
    });
  });

  // ----- Graceful shutdown -----
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(async () => {
      await stopGraphSync();
      await closeDatabases();
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

  // Handle uncaught exceptions / rejections
  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', { reason });
    process.exit(1);
  });
}

start().catch((err: Error) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
