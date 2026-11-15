import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { readResearchGraph } from '../integrations/neo4j/researchGraph';
import { ResearchSnapshot } from '../models/CloudStorage';
import { sendSuccess } from '../utils/apiResponse';

const router = Router();
router.get('/', async (req, res, next) => {
  try {
    const { researchId } = z.object({ researchId: z.string().regex(/^research-[0-9a-f-]{36}$/).optional() }).parse(req.query);
    if (env.STORAGE_MODE !== 'cloud') {
      sendSuccess(res, { nodes: [], edges: [], storageMode: 'memory', pendingSnapshots: 0 }); return;
    }
    const [graph, pendingSnapshots] = await Promise.all([
      readResearchGraph(researchId), ResearchSnapshot.countDocuments({ graphStatus: { $ne: 'SYNCED' } }),
    ]);
    sendSuccess(res, { ...graph, storageMode: 'cloud', pendingSnapshots });
  } catch (error) { next(error); }
});
export default router;
