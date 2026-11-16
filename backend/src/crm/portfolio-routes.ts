import { Router, Request, Response, NextFunction } from 'express';
import { createPortfolioStore, portfolioStore } from './portfolio-store';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../utils/errors';

export function createPortfolioRouter(store: ReturnType<typeof createPortfolioStore> = portfolioStore) {
  const router = Router();
  const action = (work: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    void work(req, res).catch(next);
  };
  router.get('/', action(async (req, res) => {
    const { details: _details, ...summary } = await store.get(req.query.refresh === 'true');
    sendSuccess(res, { ...summary, connection: store.mode });
  }));
  router.get('/accounts/:id', action(async (req, res) => {
    const snapshot = await store.get(req.query.refresh === 'true');
    const detail = Object.prototype.hasOwnProperty.call(snapshot.details, req.params.id) ? snapshot.details[req.params.id] : undefined;
    if (!detail) throw new AppError('This CRM account was not found.', 404, 'CRM_ACCOUNT_NOT_FOUND');
    sendSuccess(res, { ...detail, reportingMonth: snapshot.reportingMonth, refreshedAt: snapshot.refreshedAt, evaluatedOn: snapshot.evaluatedOn, connection: store.mode });
  }));
  return router;
}
