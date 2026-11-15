import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { RankingService, DomainError } from '../ranking/service';
import { View } from '../ranking/contracts';
import { mockSalesforceProjection, replayEvents } from '../ranking/seed';
import { SCENARIOS } from '../ranking/engine';
import { extractSource } from '../ranking/extractor';
import { DiscoveryHandoffError, prepareDiscoveryHandoff } from '../ranking/discovery';
import { recordDiscoveryHandoff } from '../sales/workflow';
import { LlmQueueService } from '../ranking/llm-queue';
import { RankingKeySessions } from '../ranking/key-sessions';
import { AppError } from '../utils/errors';
import { SALESPERSONS, salespersonQueue } from '../ranking/salesperson';

interface RankingRouterOptions { mode?: 'llm' | 'rules'; llm?: LlmQueueService; keys?: RankingKeySessions; }
export function createRankingRouter(service: RankingService, options: RankingRouterOptions = {}) {
  const router = Router(), mode = options.mode || (process.env.LEAD_RANKING_MODE === 'rules' ? 'rules' : 'llm');
  const llm = options.llm || new LlmQueueService(service, undefined, process.env.LEAD_RANKING_CACHE_PATH || undefined);
  const keys = options.keys || new RankingKeySessions();
  const asyncRoute = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const view = (req: Request): View => z.enum(['crm_plus_public', 'crm_only', 'deal_value']).parse(req.query.view || 'crm_plus_public');
  const queue = async (req: Request, force = false) => {
    const result = mode === 'rules' ? service.get(view(req)) : await llm.get(view(req), keys.resolve(req), force);
    if (!req.query.salesperson) return result;
    const id = z.enum(['aisha', 'daniel', 'priya']).parse(req.query.salesperson);
    return salespersonQueue(result, service.get('crm_plus_public'), service.customerDatabase(), id);
  };
  router.get('/salespeople', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(SALESPERSONS); });
  const writable = (_req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_CONTROLS !== 'true') next(new DomainError('Demo mutations are disabled in production', 403)); else next();
  };
  const mutation = (work: (req: Request) => Promise<unknown>) => asyncRoute(async (req, res) => { await work(req); res.json(await queue(req)); });

  router.get('/queue', asyncRoute(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(await queue(req)); }));
  router.get('/opportunities/:id/decision', asyncRoute(async (req, res) => {
    const row = (await queue(req)).items.find(r => r.id === req.params.id);
    if (!row) { res.status(404).json({ message: 'Opportunity not found' }); return; }
    res.json(row);
  }));
  router.get('/demo', (req, res) => {
    const state = service.inspect(); res.setHeader('Cache-Control', 'no-store');
    res.json({ events: replayEvents, appliedEventIds: Object.keys(state.appliedEvents), aggregateVersions: state.versions,
      history: mode === 'llm' ? llm.history(keys.resolve(req)) : [...state.history].reverse(),
      sources: state.sources, evidence: state.evidence, crm: mockSalesforceProjection(state, service.customerDatabase()), scenarios: mode === 'rules' ? SCENARIOS : [],
      liveExtractionConfigured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
      rankingMode: mode, openAi: mode === 'llm' ? keys.status(req) : null,
      customerEligibility: service.get().customerEligibility,
      clockMode: process.env.DEMO_REAL_CLOCK === 'true' ? 'real' : 'frozen', persistence: 'Atomic local JSON; no real Salesforce connection' });
  });
  router.get('/customers', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(service.customerDatabase()); });
  router.get('/comparison', asyncRoute(async (req, res) => {
    const comparison = mode === 'rules' ? service.comparison() : await llm.comparison(keys.resolve(req));
    if (!req.query.salesperson) { res.json(comparison); return; }
    const id = z.enum(['aisha', 'daniel', 'priya']).parse(req.query.salesperson);
    const allowed = new Set(salespersonQueue(service.get(), service.get(), service.customerDatabase(), id).items.map(row => row.id));
    res.json({ ...comparison, universe: comparison.universe.filter(x => allowed.has(x)), rows: comparison.rows.filter(x => allowed.has(x.id)),
      summaries: Object.fromEntries(Object.entries(comparison.summaries).map(([key, value]) => [key, { ...value, topFive: value.topFive.filter(x => allowed.has(x)) }])),
      ablations: comparison.ablations.map(value => ({ ...value, topFive: value.topFive.filter(x => allowed.has(x)), changedRows: value.changedRows.filter(x => allowed.has(x)) })) });
  }));

  router.post('/import-discovery', asyncRoute(async (req, res) => {
    const { researchId } = z.object({ researchId: z.string().regex(/^research-[0-9a-f-]{36}$/) }).strict().parse(req.body);
    try {
      const handoff = await prepareDiscoveryHandoff(researchId);
      await service.ingestDiscovery(handoff);
      await recordDiscoveryHandoff({
        companyId: `entity:${handoff.company.entityId}`,
        companyName: handoff.company.name,
        researchId: handoff.researchId,
        sourceIds: handoff.opportunities.flatMap(opportunity => opportunity.evidenceIds),
        evidence: handoff.sources.map(source => ({ sourceId: String(source.claims.researchSourceId), title: String(source.claims.title), url: source.sourceUrl, publishedAt: source.publishedAt })),
        candidates: handoff.opportunities.map(opportunity => ({ opportunityId: opportunity.id, service: opportunity.product })),
      });
      res.status(201).json({ handoff: { researchId: handoff.researchId, company: handoff.company, candidates: handoff.opportunities.length }, queue: await queue(req, true) });
    } catch (error) {
      if (error instanceof DiscoveryHandoffError) throw new DomainError(error.message, 409);
      throw error;
    }
  }));

  const keyLimit = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many connection attempts. Wait a minute and try again.' } });
  router.post('/llm/session', keyLimit, asyncRoute(async (req, res) => res.json(await keys.connect(req, res))));
  router.delete('/llm/session', (req, res) => res.json(keys.disconnect(req, res)));
  router.get('/llm/status', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(keys.status(req)); });
  router.post('/llm/analyze', keyLimit, asyncRoute(async (req, res) => {
    z.object({}).strict().parse(req.body || {}); res.json(await queue(req, true));
  }));

  router.post('/demo/events', writable, mutation(req => service.apply(req.body)));
  router.post('/demo/reset', writable, mutation(req => {
    const body = z.object({ empty: z.boolean().default(false) }).strict().parse(req.body || {}); return service.reset(body.empty);
  }));
  router.post('/demo/clock', writable, mutation(req => {
    const body = z.object({ asOf: z.string().datetime({ offset: true }) }).strict().parse(req.body); return service.advance(body.asOf);
  }));
  router.post('/sources/refresh', writable, mutation(req => {
    const body = z.object({ simulateFailure: z.boolean().default(false) }).strict().parse(req.body || {}); return service.refresh(body.simulateFailure);
  }));
  router.post('/sources/extract', writable, asyncRoute(async (req, res) => {
    const body = z.object({ sourceId: z.string(), live: z.boolean().default(false) }).strict().parse(req.body);
    const source = service.inspect().sources.find(s => s.id === body.sourceId);
    if (!source) throw new DomainError('Source not found', 404);
    res.json(await extractSource(source, body.live));
  }));
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) { res.status(400).json({ message: 'Invalid ranking input', issues: err.issues.map(issue => ({ path: issue.path, message: issue.message })) }); return; }
    const known = err instanceof DomainError || err instanceof AppError;
    res.status(err instanceof AppError ? err.statusCode : err instanceof DomainError ? err.status : 500).json({ message: known ? err.message : 'The ranking request could not be completed.', ...(err instanceof AppError ? { code: err.code } : {}) });
  });
  return router;
}
