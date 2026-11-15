import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse';
import { loadResearch, validResearchId } from '../integrations/research/store';
import { INTERVENTION_REASONS, INTERVENTION_STATUSES, ISalesActivity } from '../models/SalesActivity';
import { appendActivity, findCompanyActivities, findInterventions, listDiscoveredCompanies } from '../salesStore';
import { receiveReply, selectCompany, identifyContact, draftEmail, approveEmail, sendApprovedEmail, updateIntervention, getWorkflow, SalesCompanyContext } from '../sales/workflow';

const router = Router();

async function contextFor(key: string): Promise<SalesCompanyContext> {
  if (validResearchId(key)) {
    const record = await loadResearch(key);
    const canonicalId = `entity:${record.company.entityId}`;
    const events = await findCompanyActivities(canonicalId);
    const service = [...events].reverse().find(event => event.type === 'QUALIFIED')?.service;
    return { companyId: canonicalId, companyName: record.company.name, researchId: record.id, service,
      sourceIds: record.sources.map(source => source.id),
      evidence: record.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt })) };
  }
  const events = await findCompanyActivities(key);
  const first = events[0];
  if (!first) throw new AppError('Company is not in the sales workflow.', 404, 'WORKFLOW_COMPANY_NOT_FOUND');
  const record = first.researchId && validResearchId(first.researchId) ? await loadResearch(first.researchId) : null;
  return { companyId: key, companyName: first.companyName, researchId: first.researchId,
    country: first.country, industry: first.industry,
    service: [...events].reverse().find(event => event.type === 'QUALIFIED')?.service,
    sourceIds: record?.sources.map(source => source.id) ?? first.sourceIds,
    evidence: record?.sources.map(source => ({ sourceId: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt })),
    isSynthetic: first.isSynthetic };
}

router.get('/companies', async (req, res, next) => {
  try {
    const query = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(25) }).parse(req.query);
    const result = await listDiscoveredCompanies(query.page, query.limit);
    sendSuccess(res, result.data, 200, undefined, buildPaginationMeta(query.page, query.limit, result.total));
  } catch (error) { next(error); }
});

router.get('/companies/:companyId', async (req, res, next) => {
  try { const context = await contextFor(req.params.companyId); sendSuccess(res, await getWorkflow(context.companyId)); }
  catch (error) { next(error); }
});

router.post('/companies/:companyId/select', async (req, res, next) => {
  try { const context = await contextFor(req.params.companyId); sendSuccess(res, await selectCompany(context), 201); }
  catch (error) { next(error); }
});

router.post('/companies/:companyId/contacts', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), role: z.string().trim().min(1).max(120) }).strict().parse(req.body);
    const context = await contextFor(req.params.companyId); sendSuccess(res, await identifyContact(context, input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts', async (req, res, next) => {
  try {
    const input = z.object({ contactId: z.string().optional(), subject: z.string().trim().max(200).optional(), body: z.string().trim().max(10000).optional() }).strict().default({}).parse(req.body ?? {});
    const context = await contextFor(req.params.companyId); sendSuccess(res, await draftEmail(context, input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts/:draftId/approve', async (req, res, next) => {
  try {
    const input = z.object({ editedBody: z.string().trim().min(1).max(10000).optional() }).strict().default({}).parse(req.body ?? {});
    const context = await contextFor(req.params.companyId); sendSuccess(res, await approveEmail(context, req.params.draftId, input.editedBody), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts/:draftId/send', async (req, res, next) => {
  try { const context = await contextFor(req.params.companyId); sendSuccess(res, await sendApprovedEmail(context, req.params.draftId), 201); }
  catch (error) { next(error); }
});

router.post('/companies/:companyId/replies', async (req, res, next) => {
  try {
    if (env.NODE_ENV === 'production' && !env.HOSTED_PREVIEW) throw new AppError('Reply simulation is available only in the local or hosted demo.', 403, 'DEMO_ONLY');
    const input = z.object({ replyId: z.string().trim().min(1).max(120), contactEmail: z.string().trim().email().max(254), text: z.string().trim().min(1).max(5000) }).strict().parse(req.body);
    const context = await contextFor(req.params.companyId); sendSuccess(res, await receiveReply(context, input), 201);
  } catch (error) { next(error); }
});

router.patch('/companies/:companyId/interventions/:interventionId', async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(INTERVENTION_STATUSES), assignedTo: z.string().trim().max(120).optional() }).strict().parse(req.body);
    const context = await contextFor(req.params.companyId); sendSuccess(res, await updateIntervention(context, req.params.interventionId, input));
  } catch (error) { next(error); }
});

router.get('/interventions', async (req, res, next) => {
  try {
    const query = z.object({ status: z.enum(INTERVENTION_STATUSES).optional(), priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
      reason: z.enum(INTERVENTION_REASONS).optional(), assignedTo: z.string().trim().optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(20) }).parse(req.query);
    const result = await findInterventions(query);
    sendSuccess(res, result.data, 200, undefined, buildPaginationMeta(query.page, query.limit, result.total));
  } catch (error) { next(error); }
});

router.post('/demo/run', async (_req, res, next) => {
  try {
    if (env.NODE_ENV === 'production' && !env.HOSTED_PREVIEW) throw new AppError('Synthetic workflow seeding is disabled in production.', 403, 'DEMO_ONLY');
    const context: SalesCompanyContext & { sourceIds: string[]; isSynthetic: true } = { companyId: 'synthetic:merlion-logistics', companyName: 'Merlion Logistics (Synthetic)', country: 'Singapore',
      industry: 'Logistics', service: 'Managed Network Services', isSynthetic: true, sourceIds: ['synthetic:public-expansion-1'] };
    const at = new Date();
    const records: ISalesActivity[] = [
      { eventId: 'demo:discovery', type: 'DISCOVERED', ...context, researchId: 'synthetic:research-1', sourceIds: context.sourceIds!, payload: { sourceCount: 1 }, createdAt: at },
      { eventId: 'demo:qualified', type: 'QUALIFIED', ...context, opportunityId: 'synthetic:opp-1', payload: { qualification: 'Evidence-linked regional expansion; synthetic scenario.' }, createdAt: at },
      { eventId: 'demo:selected', type: 'SELECTED', ...context, payload: {}, createdAt: at },
      { eventId: 'demo:contact', type: 'CONTACT_IDENTIFIED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', payload: { role: 'Synthetic Operations Director' }, createdAt: at },
      { eventId: 'demo:draft', type: 'EMAIL_DRAFTED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', subject: 'Exploring regional network readiness', body: 'Synthetic demo message. A public signal suggests regional expansion; would a short discussion about network requirements be useful?', payload: { draftId: 'synthetic:draft-1', requiresApproval: true }, createdAt: at },
      { eventId: 'demo:approved', type: 'EMAIL_APPROVED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', subject: 'Exploring regional network readiness', body: 'Synthetic demo message. A public signal suggests regional expansion; would a short discussion about network requirements be useful?', payload: { draftId: 'synthetic:draft-1', humanApprovedAt: '2026-11-15T00:00:00.000Z' }, createdAt: at },
      { eventId: 'demo:accepted', type: 'EMAIL_PROVIDER_ACCEPTED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', subject: 'Exploring regional network readiness', provider: 'MOCK', providerMessageId: 'synthetic:message-1', payload: { inboxDelivery: 'unknown' }, createdAt: at },
      { eventId: 'demo:reply', type: 'REPLY_RECEIVED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', body: 'Could we schedule a meeting next week to discuss our network requirements?', payload: { inReplyTo: 'synthetic:message-1' }, createdAt: at },
      { eventId: 'demo:classified', type: 'REPLY_CLASSIFIED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', intent: 'MEETING_REQUEST', sentiment: 'POSITIVE', confidence: 0.91, payload: { evidence: 'schedule a meeting', suggestedResponse: 'A representative should coordinate a time.' }, createdAt: at },
      { eventId: 'demo:meeting', type: 'MEETING_REQUESTED', ...context, contactId: 'synthetic:contact-1', contactEmail: 'asha.lim@example.invalid', intent: 'MEETING_REQUEST', payload: { confirmedMeeting: false }, createdAt: at },
      { eventId: 'demo:intervention', type: 'INTERVENTION_CREATED', ...context, contactId: 'synthetic:contact-1', contactName: 'Asha Lim', contactEmail: 'asha.lim@example.invalid', reason: 'MEETING_COORDINATION', priority: 'HIGH', assignedTo: 'Synthetic Sales Owner', status: 'PENDING', payload: { interventionId: 'synthetic:reply-1', replyEventId: 'demo:reply', recommendation: 'Coordinate a meeting time.' }, createdAt: at },
      { eventId: 'demo:feedback', type: 'FEEDBACK_CAPTURED', ...context, contactId: 'synthetic:contact-1', intent: 'MEETING_REQUEST', sourceIds: ['demo:reply'], payload: { requirement: 'network requirements', verifiedByCustomer: true }, createdAt: at },
      { eventId: 'demo:scheduled', type: 'MEETING_SCHEDULED', ...context, contactId: 'synthetic:contact-1', payload: { isSynthetic: true }, createdAt: at },
      { eventId: 'demo:resolved', type: 'INTERVENTION_UPDATED', ...context, contactId: 'synthetic:contact-1', reason: 'MEETING_COORDINATION', priority: 'HIGH', assignedTo: 'Synthetic Sales Owner', status: 'RESOLVED', payload: { interventionId: 'synthetic:reply-1', resolutionMs: 3600000 }, createdAt: at },
    ];
    const results = [];
    for (const event of records) results.push(await appendActivity(event));
    await appendActivity({ eventId: 'demo:agent-discovery', type: 'AGENT_EXECUTION', ...context, agent: 'Discovery & Qualification', success: true, executionMs: 1200, payload: { demo: true }, createdAt: at });
    await appendActivity({ eventId: 'demo:agent-reply', type: 'AGENT_EXECUTION', ...context, agent: 'Reply Intelligence', success: true, executionMs: 230, intent: 'MEETING_REQUEST', confidence: 0.91, payload: { demo: true }, createdAt: at });
    sendSuccess(res, { createdEvents: results.length, company: context.companyName, dataMode: 'synthetic_demo', message: 'Synthetic workflow recorded: discovery through meeting scheduling and intervention resolution. No email was sent.' }, 201);
  } catch (error) { next(error); }
});

export default router;
