import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { CustomerGraphStore } from './store';
import { accounts, artifacts, entities } from './fixtures';
import { MODEL } from './contracts';
import { extractWithTerra } from './extract';

export function createCustomerGraphRouter(store: Pick<CustomerGraphStore, 'read' | 'save' | 'sync'> = new CustomerGraphStore(), extract = extractWithTerra) {
  const router = Router();
  let ingesting = false;
  const asyncRoute = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const envelope = (snapshot: Awaited<ReturnType<CustomerGraphStore['read']>>) => ({ ...snapshot, accounts, artifacts, entities,
    synthetic: true, asOf: '2026-11-15', model: MODEL, ingestionConfigured: !!process.env.OPENAI_API_KEY?.trim(), ingesting });
  router.get('/', asyncRoute(async (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(envelope(await store.read())); }));
  router.get('/artifacts/:id/download', (req, res) => {
    const artifact = artifacts.find(a => a.id === req.params.id);
    if (!artifact) { res.status(404).json({ message: 'Artifact not found' }); return; }
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    res.type('text/plain').send(artifact.content);
  });
  router.use((req, _res, next) => {
    if (req.method !== 'GET' && process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_CONTROLS !== 'true') {
      next(new AppError('Customer demo ingestion is disabled on this deployment.', 403, 'DEMO_CONTROLS_DISABLED')); return;
    }
    next();
  });
  router.post('/sync', asyncRoute(async (req, res) => { z.object({}).strict().parse(req.body || {}); res.json(envelope(await store.sync())); }));
  router.post('/ingest', rateLimit({ windowMs: 300000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Ingestion is limited to three runs per five minutes. The current graph is still available.' } }), asyncRoute(async (req, res) => {
    z.object({}).strict().parse(req.body || {});
    if (ingesting) throw new AppError('An ingestion is already running. Wait for it to finish.', 409, 'CUSTOMER_GRAPH_INGESTING');
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new AppError('Set OPENAI_API_KEY on the backend to ingest with GPT-6.1 Terra. The saved demo remains available.', 503, 'CUSTOMER_GRAPH_KEY_REQUIRED');
    ingesting = true;
    try {
      const run = await extract(key);
      const snapshot = await store.save(run);
      ingesting = false; res.json(envelope(snapshot));
    } finally { ingesting = false; }
  }));
  router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error instanceof z.ZodError ? 400 : error instanceof AppError ? error.statusCode : 500).json({
      message: error instanceof z.ZodError ? 'Invalid customer-intelligence request.' : error instanceof AppError ? error.message : 'The customer-intelligence request failed. The previous graph is preserved.',
      code: error instanceof AppError ? error.code : 'CUSTOMER_GRAPH_REQUEST_FAILED',
    });
  });
  return router;
}
