import { Request, Response, NextFunction } from 'express';
import { isMongoDBConnected, verifyMongoConnectivity } from '../integrations/mongodb/connection';
import { verifyConnectivity } from '../integrations/neo4j/graphService';
import { sendSuccess } from '../utils/apiResponse';
import { env } from '../config/env';

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  if (env.STORAGE_MODE === 'memory' && (env.NODE_ENV !== 'production' || env.HOSTED_PREVIEW) && env.LOCAL_DEMO_MODE) {
    res.json({ success: true, status: 'ready', storageMode: 'temporary_preview' }); return;
  }
  const checks = Promise.all([verifyMongoConnectivity(), verifyConnectivity()]);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean[]>(resolve => { timer = setTimeout(() => resolve([false, false]), 3500); });
  const [mongo, graph] = await Promise.race([checks, timeout]).finally(() => clearTimeout(timer));
  res.status(mongo && graph ? 200 : 503).json({ success: mongo && graph, status: mongo && graph ? 'ready' : 'unavailable',
    services: { mongodb: mongo ? 'up' : 'down', neo4j: graph ? 'up' : 'down' } });
}

export async function getOverallHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (env.STORAGE_MODE === 'memory' && env.LOCAL_DEMO_MODE && (env.NODE_ENV !== 'production' || env.HOSTED_PREVIEW)) {
      res.json({ success: true, status: 'healthy', storageMode: 'temporary_preview', timestamp: new Date().toISOString(),
        services: { mongodb: 'not_configured', neo4j: 'not_configured' } }); return;
    }
    const mongoStatus = isMongoDBConnected();
    const neo4jStatus = await verifyConnectivity();

    const allHealthy = mongoStatus && neo4jStatus;

    res.status(allHealthy ? 200 : 207).json({
      success: true,
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoStatus ? 'up' : 'down',
        neo4j:   neo4jStatus ? 'up' : 'down',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMongoHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const start = Date.now();
    const connected = isMongoDBConnected();
    const latencyMs = Date.now() - start;

    sendSuccess(res, { status: connected ? 'up' : 'down', latencyMs });
  } catch (err) {
    next(err);
  }
}

export async function getNeo4jHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const start = Date.now();
    const connected = await verifyConnectivity();
    const latencyMs = Date.now() - start;

    sendSuccess(res, { status: connected ? 'up' : 'down', latencyMs });
  } catch (err) {
    next(err);
  }
}
