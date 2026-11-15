import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RankingService, DomainError } from '../ranking/service';
import { View } from '../ranking/contracts';
import { mockSalesforceProjection, replayEvents } from '../ranking/seed';
import { SCENARIOS } from '../ranking/engine';
import { extractSource } from '../ranking/extractor';
import { DiscoveryHandoffError, prepareDiscoveryHandoff } from '../ranking/discovery';
import { recordDiscoveryHandoff } from '../sales/workflow';

export function createRankingRouter(service: RankingService) {
  const router = Router();
  const asyncRoute = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => fn(req, res)).catch(next);
  router.get('/queue', (req, res, next) => {
    try { const view = z.enum(['crm_plus_public', 'crm_only', 'deal_value']).parse(req.query.view || 'crm_plus_public'); res.json(service.get(view)); }
    catch (err) { next(err); }
  });
  router.get('/opportunities/:id/decision', (req, res) => {
    const row = service.get().items.find(r => r.id === req.params.id);
    if (!row) { res.status(404).json({ message: 'Opportunity not found' }); return; }
    res.json(row);
  });
  router.get('/demo', (_req, res) => {
    const state = service.inspect();
    res.json({ events: replayEvents, appliedEventIds: Object.keys(state.appliedEvents), aggregateVersions: state.versions, history: [...state.history].reverse(),
      sources: state.sources, evidence: state.evidence, crm: mockSalesforceProjection(state), scenarios: SCENARIOS,
      liveExtractionConfigured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
      clockMode: process.env.DEMO_REAL_CLOCK === 'true' ? 'real' : 'frozen', persistence: 'Atomic local JSON; no real Salesforce connection' });
  });
  router.get('/comparison', (_req, res) => res.json(service.comparison()));
  router.post('/import-discovery', asyncRoute(async (req, res) => {
    const { researchId } = z.object({ researchId: z.string().regex(/^research-[0-9a-f-]{36}$/) }).strict().parse(req.body);
    try {
      const handoff = await prepareDiscoveryHandoff(researchId);
      const queue = await service.ingestDiscovery(handoff);
      await recordDiscoveryHandoff({ companyId: `entity:${handoff.company.entityId}`, companyName: handoff.company.name,
        researchId: handoff.researchId, sourceIds: handoff.opportunities.flatMap(o => o.evidenceIds),
        evidence: handoff.sources.map(source => ({ sourceId: String(source.claims.researchSourceId), title: String(source.claims.title), url: source.sourceUrl, publishedAt: source.publishedAt })),
        candidates: handoff.opportunities.map(o => ({ opportunityId: o.id, service: o.product })),
      });
      res.status(201).json({ handoff: { researchId: handoff.researchId, company: handoff.company, candidates: handoff.opportunities.length }, queue });
    } catch (error) {
      if (error instanceof DiscoveryHandoffError) throw new DomainError(error.message, 409);
      throw error;
    }
  }));
  const writable = (_req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_CONTROLS !== 'true') next(new DomainError('Demo mutations are disabled in production', 403)); else next();
  };
  router.post('/demo/events', writable, asyncRoute(async (req, res) => res.json(await service.apply(req.body))));
  router.post('/demo/reset', writable, asyncRoute(async (req, res) => {
    const body = z.object({ empty: z.boolean().default(false) }).strict().parse(req.body || {});
    res.json(await service.reset(body.empty));
  }));
  router.post('/demo/clock', writable, asyncRoute(async (req, res) => {
    const body = z.object({ asOf: z.string().datetime({ offset: true }) }).strict().parse(req.body);
    res.json(await service.advance(body.asOf));
  }));
  router.post('/sources/refresh', writable, asyncRoute(async (req, res) => {
    const body = z.object({ simulateFailure: z.boolean().default(false) }).strict().parse(req.body || {});
    res.json(await service.refresh(body.simulateFailure));
  }));
  router.post('/sources/extract', writable, asyncRoute(async (req, res) => {
    const body = z.object({ sourceId: z.string(), live: z.boolean().default(false) }).strict().parse(req.body);
    const source = service.inspect().sources.find(s => s.id === body.sourceId);
    if (!source) throw new DomainError('Source not found', 404);
    res.json(await extractSource(source, body.live));
  }));
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) { res.status(400).json({ message: 'Invalid ranking input', issues: err.issues }); return; }
    res.status(err instanceof DomainError ? err.status : 500).json({ message: err.message });
  });
  return router;
}
