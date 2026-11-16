import { Router, Request, Response, NextFunction } from 'express';
import { crmService, createCrmService } from './service';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../utils/errors';

export function createCrmRouter(service: ReturnType<typeof createCrmService> = crmService) {
  const router = Router();
  const action = (work: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'no-store'); void work(req, res).catch(next); };
  router.get('/accounts', action(async (_req, res) => sendSuccess(res, await service.list())));
  router.get('/accounts/:id', action(async (req, res) => sendSuccess(res, await service.detail(req.params.id))));
  router.get('/accounts/:id/artifacts/:artifactId', action(async (req, res) => {
    const detail = await service.detail(req.params.id);
    const artifact = detail.artifacts.find(row => row.id === req.params.artifactId);
    if (!artifact) throw new AppError('CRM source artifact not found for this account.', 404, 'CRM_ARTIFACT_NOT_FOUND');
    res.setHeader('Content-Disposition', 'attachment; filename="' + artifact.filename.replace(/[^a-zA-Z0-9_.-]/g, '_') + '"');
    res.type('text/plain; charset=utf-8').send(artifact.content);
  }));
  return router;
}
