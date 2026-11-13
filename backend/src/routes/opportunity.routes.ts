import { Router } from 'express';
import { listOpportunities } from '../controllers/opportunityController';

const router = Router();

router.get('/', listOpportunities);

export default router;
