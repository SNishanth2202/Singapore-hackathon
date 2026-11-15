import { Router } from 'express';
import { z } from 'zod';
import { businessKnowledgeStore } from '../business/store';
import { sendSuccess } from '../utils/apiResponse';
import { env } from '../config/env';
import { requireLocalDevelopment } from '../middleware/localDevelopment';

const router = Router();

router.get('/', async (_req, res, next) => {
  try { res.setHeader('X-Knowledge-Editable', String(env.NODE_ENV !== 'production')); sendSuccess(res, await businessKnowledgeStore.read()); }
  catch (error) { next(error); }
});

router.put('/', requireLocalDevelopment, async (req, res, next) => {
  try {
    const input = z.object({ expectedVersion: z.number().int().positive(), knowledge: z.unknown() }).strict().parse(req.body);
    sendSuccess(res, await businessKnowledgeStore.update(input.expectedVersion, input.knowledge));
  } catch (error) { next(error); }
});

export default router;
