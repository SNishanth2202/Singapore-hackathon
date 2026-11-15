import { Router } from 'express';
import { getOverallHealth, getMongoHealth, getNeo4jHealth, getReadiness } from '../controllers/healthController';

const router = Router();

router.get('/',       getOverallHealth);
router.get('/ready', getReadiness);
router.get('/mongodb', getMongoHealth);
router.get('/neo4j',   getNeo4jHealth);

export default router;
