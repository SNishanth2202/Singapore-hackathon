import { Router, Request, Response } from 'express';
import healthRoutes      from './health.routes';
import companyRoutes     from './company.routes';
import opportunityRoutes from './opportunity.routes';
import analyticsRoutes   from './analytics.routes';
import aiRoutes          from './ai.routes';

const router = Router();

router.use('/health',       healthRoutes);
router.use('/companies',    companyRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/analytics',    analyticsRoutes);
router.use('/ai',           aiRoutes);

// 404 fallback for unmatched /api/v1/* routes
router.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
  });
});

export default router;
