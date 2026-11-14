import { Router } from 'express';
import { env } from '../config/env';
import { freeLlmClient } from '../integrations/freellmapi/client';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/apiResponse';
import { z } from 'zod';
import { analyzeCompany } from '../integrations/freellmapi/analyze';
import researchRoutes from './research.routes';
import businessRoutes from './business.routes';

const router = Router();

// Temporary local diagnostics, not a public inference gateway.
router.use((req, _res, next) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  const origin = req.get('origin');
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173', env.CORS_ORIGIN];
  if (env.NODE_ENV === 'production' || !local || (origin && !allowedOrigins.includes(origin))) {
    next(new AppError('AI diagnostics are available only in local development.', 403, 'AI_DIAGNOSTICS_DISABLED'));
    return;
  }
  next();
});

router.get('/models', async (_req, res, next) => {
  try {
    const models = await freeLlmClient.listModels();
    sendSuccess(res, { models, count: models.length });
  } catch (error) { next(error); }
});

router.use('/research', researchRoutes);
router.use('/business-knowledge', businessRoutes);

let analyzing = false;
router.post('/analyze', async (req, res, next) => {
  if (analyzing) { next(new AppError('Another analysis is running. Please wait.', 429, 'AI_BUSY')); return; }
  const input = z.object({ companyId: z.string().min(1).max(100) }).safeParse(req.body);
  if (!input.success) { next(new AppError('Provide a companyId.', 400, 'VALIDATION_ERROR')); return; }
  analyzing = true;
  try { sendSuccess(res, await analyzeCompany(input.data.companyId)); }
  catch (error) { next(error); }
  finally { analyzing = false; }
});

let testing = false;
let lastStarted = 0;
router.post('/test', async (_req, res, next) => {
  if (testing || Date.now() - lastStarted < 10000) {
    next(new AppError('Wait a few seconds before another AI test.', 429, 'AI_TEST_BUSY'));
    return;
  }
  testing = true;
  lastStarted = Date.now();
  try {
    const result = await freeLlmClient.generateText([
      { role: 'user', content: 'Connection test. Reply with only the word OK.' },
    ], 16);
    sendSuccess(res, { status: 'connected', ...result });
  } catch (error) { next(error); }
  finally { testing = false; }
});

export default router;
