import { Request, Response, NextFunction } from 'express';
import { isMongoDBConnected } from '../integrations/mongodb/connection';
import { verifyConnectivity } from '../integrations/neo4j/graphService';
import { sendSuccess } from '../utils/apiResponse';

export async function getOverallHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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
