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
import { runDueFollowups } from './sales/workflow';
import { resolveSalesContext } from './sales/context';
import { runDailyRankingSchedulerTick } from './ai-management/scheduler';
import { runAiManagementWorkerTick } from './ai-management/orchestrator';

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
  const followupTimer = setInterval(() => {
    void runDueFollowups(resolveSalesContext).then(results => {
      if (results.some(result => result.status === 'drafted')) logger.info('Due follow-ups placed in the approval queue', { drafted: results.filter(result => result.status === 'drafted').length });
    }).catch(error => logger.error('Follow-up worker failed', { error: error instanceof Error ? error.message : 'unknown error' }));
  }, 60_000);
  followupTimer.unref();

  // Backend workers: independent of any browser session. Leases in MongoDB keep multiple instances from duplicating work.
  const aiManagementTick = () => {
    void runDailyRankingSchedulerTick().catch(error => logger.error('Daily ranking worker failed', { error: error instanceof Error ? error.message : 'unknown error' }));
    void runAiManagementWorkerTick().then(result => {
      if (result.status === 'ran' && result.processed.length) logger.info('AI Management worker processed due companies', { processed: result.processed.map(item => ({ companyId: item.companyId, status: item.status })) });
    }).catch(error => logger.error('AI Management worker failed', { error: error instanceof Error ? error.message : 'unknown error' }));
  };
  const aiManagementTimer = setInterval(aiManagementTick, 60_000);
  aiManagementTick();
  aiManagementTimer.unref();

  // ----- Graceful shutdown -----
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    clearInterval(followupTimer);
    clearInterval(aiManagementTimer);

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
