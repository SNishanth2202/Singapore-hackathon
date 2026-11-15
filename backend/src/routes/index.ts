import { Router, Request, Response } from 'express';
import healthRoutes      from './health.routes';
import companyRoutes     from './company.routes';
import opportunityRoutes from './opportunity.routes';
import analyticsRoutes   from './analytics.routes';
import aiRoutes          from './ai.routes';
import graphRoutes from './graph.routes';
import { createRankingRouter } from './ranking.routes';
import { rankingLlmQueue, rankingService } from '../ranking/runtime';
import salesRoutes from './sales.routes';
import aiManagementRoutes from './ai-management.routes';
import { createCustomerGraphRouter } from '../customer-graph/routes';
import prospectingRoutes from './prospecting.routes';

const router = Router();

router.use('/health',       healthRoutes);
router.use('/companies',    companyRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/analytics',    analyticsRoutes);
router.use('/ai',           aiRoutes);
router.use('/graph',        graphRoutes);
router.use('/sales',        salesRoutes);
router.use('/ai-management', aiManagementRoutes);
router.use('/customer-graph', createCustomerGraphRouter());
router.use('/prospecting', prospectingRoutes);
if (process.env.DEMO_REAL_CLOCK === 'true') {
  const rankingClock = setInterval(() => { void rankingService.advance(new Date().toISOString()).catch(err => console.error(err.message)); }, 30000);
  rankingClock.unref();
}
router.use('/ranking',      createRankingRouter(rankingService, { llm: rankingLlmQueue }));

// 404 fallback for unmatched /api/v1/* routes
router.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
  });
});

export default router;
