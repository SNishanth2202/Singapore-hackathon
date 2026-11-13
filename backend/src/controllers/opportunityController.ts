import { Request, Response, NextFunction } from 'express';
import { findOpportunities } from '../repositories/opportunityRepository';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse';
import { z } from 'zod';

const OpportunityQuerySchema = z.object({
  status:   z.string().trim().optional(),
  priority: z.string().trim().optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
});

export async function listOpportunities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = OpportunityQuerySchema.parse(req.query);

    const { opportunities, total } = await findOpportunities(
      { status: q.status, priority: q.priority },
      { page: q.page, limit: q.limit }
    );

    const meta = buildPaginationMeta(q.page, q.limit, total);
    sendSuccess(res, opportunities, 200, undefined, meta);
  } catch (err) {
    next(err);
  }
}
