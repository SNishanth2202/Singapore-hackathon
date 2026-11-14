import { Router } from 'express';
import { z } from 'zod';
import { businessKnowledgeStore } from '../business/store';
import { sendSuccess } from '../utils/apiResponse';

const router = Router();

// Mounted behind the existing local-development boundary. No authentication added.
router.get('/', async (_req, res, next) => {
  try { sendSuccess(res, await businessKnowledgeStore.read()); }
  catch (error) { next(error); }
});

router.put('/', async (req, res, next) => {
  try {
    const input = z.object({ expectedVersion: z.number().int().positive(), knowledge: z.unknown() }).strict().parse(req.body);
    sendSuccess(res, await businessKnowledgeStore.update(input.expectedVersion, input.knowledge));
  } catch (error) { next(error); }
});

export default router;
