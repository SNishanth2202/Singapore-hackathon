import neo4j, { Driver } from 'neo4j-driver';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    throw new Error('Neo4j driver not initialized. Call connectNeo4j() first.');
  }
  return driver;
}

export async function connectNeo4j(): Promise<void> {
  try {
    driver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD),
      {
        connectionTimeout: 5000,
        maxConnectionPoolSize: 50,
      }
    );

    await driver.verifyConnectivity();
    logger.info('Neo4j connection established', { uri: env.NEO4J_URI });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to connect to Neo4j', { error: err.message });
    // Don't throw — allow app to start degraded
    driver = null;
  }
}

export async function disconnectNeo4j(): Promise<void> {
  if (driver) {
    try {
      await driver.close();
      driver = null;
      logger.info('Neo4j connection closed');
    } catch (error) {
      const err = error as Error;
      logger.error('Error closing Neo4j connection', { error: err.message });
    }
  }
}

export function isNeo4jConnected(): boolean {
  return driver !== null;
}
