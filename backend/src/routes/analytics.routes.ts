import { Router } from 'express';
import { z } from 'zod';
import { getSalesAnalytics, AnalyticsFilters } from '../services/salesAnalytics';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../utils/errors';

const router = Router();
const Views = ['overview', 'kpis', 'funnel', 'outreach', 'responses', 'interventions', 'opportunities', 'geography', 'agents', 'insights'] as const;
const Query = z.object({ startDate: z.string().datetime({ offset: true }).optional(), endDate: z.string().datetime({ offset: true }).optional(),
  country: z.string().trim().max(120).optional(), industry: z.string().trim().max(120).optional(), service: z.string().trim().max(200).optional(),
  agent: z.string().trim().max(120).optional(), status: z.string().trim().max(40).optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(20) }).strict();

router.get('/:view?', async (req, res, next) => {
  try {
    const input = Query.parse(req.query);
    const endDate = input.endDate ? new Date(input.endDate) : new Date();
    const startDate = input.startDate ? new Date(input.startDate) : new Date(endDate.getTime() - 30 * 86400000);
    if (startDate > endDate) throw new AppError('startDate must be before or equal to endDate.', 400, 'INVALID_DATE_RANGE');
    const filters: AnalyticsFilters = { ...input, startDate, endDate };
    const analytics = await getSalesAnalytics(filters);
    const view = req.params.view ?? 'overview';
    if (!(Views as readonly string[]).includes(view)) throw new AppError('Unknown analytics view.', 404, 'ANALYTICS_VIEW_NOT_FOUND');
    const data = view === 'overview' ? analytics : view === 'outreach' ? { metrics: analytics.metrics, timeline: analytics.timeline }
      : view === 'responses' ? { metrics: analytics.metrics, timeline: analytics.timeline, intents: analytics.intentDistribution, sentiment: analytics.sentimentDistribution }
        : view === 'interventions' ? analytics.interventions : analytics[view as keyof typeof analytics];
    sendSuccess(res, data);
  } catch (error) { next(error); }
});

export default router;
