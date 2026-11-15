import neo4j, { Driver } from 'neo4j-driver';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

let driver: Driver | null = null;
export function getDriver(): Driver {
  if (!driver) throw new AppError('Neo4j Aura is not connected.', 503, 'AURA_UNAVAILABLE');
  return driver;
}
export async function connectNeo4j(): Promise<void> {
  if (driver) return;
  const candidate = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD), {
    connectionTimeout: env.DB_CONNECTION_TIMEOUT_MS,
    connectionAcquisitionTimeout: env.DB_CONNECTION_TIMEOUT_MS,
    maxConnectionPoolSize: env.DB_MAX_POOL_SIZE,
    maxTransactionRetryTime: 10000,
  });
  try {
    await candidate.verifyConnectivity();
    const session = candidate.session({ database: env.NEO4J_DATABASE, defaultAccessMode: neo4j.session.READ });
    try { await session.executeRead(tx => tx.run('RETURN 1 AS ready')); }
    finally { await session.close(); }
    driver = candidate;
    logger.info('Neo4j Aura connection established');
  } catch {
    await candidate.close().catch(() => undefined);
    throw new AppError('Neo4j Aura connection failed. Check the encrypted URI, database name and database credentials.', 503, 'AURA_CONNECTION_FAILED');
  }
}
export async function disconnectNeo4j(): Promise<void> {
  const current = driver; driver = null;
  if (current) await current.close();
}
export function isNeo4jConnected(): boolean { return driver !== null; }
