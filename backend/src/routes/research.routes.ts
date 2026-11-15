import { Router } from 'express';
import { z } from 'zod';
import { searchCompanies, researchCompany } from '../integrations/research/service';
import { loadResearch } from '../integrations/research/store';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/apiResponse';

const router = Router();
let researching = false;
router.post('/search', async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().trim().min(2).max(120) }).strict().parse(req.body);
    sendSuccess(res, await searchCompanies(name));
  } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
  if (researching) { next(new AppError('Another company research request is running. Please wait.', 429, 'RESEARCH_BUSY')); return; }
  try {
    const { entityId } = z.object({ entityId: z.string().regex(/^Q[1-9][0-9]{0,12}$/) }).strict().parse(req.body);
    researching = true;
    sendSuccess(res, await researchCompany(entityId), 201);
  } catch (error) { next(error); }
  finally { researching = false; }
});
router.get('/:id', async (req, res, next) => {
  try { sendSuccess(res, await loadResearch(req.params.id)); }
  catch (error) { next(error); }
});
export default router;
