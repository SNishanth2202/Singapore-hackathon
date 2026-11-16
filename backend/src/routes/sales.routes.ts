import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse';
import { INTERVENTION_REASONS, INTERVENTION_STATUSES, ISalesActivity } from '../models/SalesActivity';
import { appendActivity, findCompanyActivities, findInterventions, listDiscoveredCompanies, allActivityEvents } from '../salesStore';
import { receiveReply, selectCompany, identifyContact, draftEmail, approveEmail, rejectEmail, sendApprovedEmail, updateIntervention, getWorkflow,
  scheduleFollowup, runDueFollowups, SalesCompanyContext } from '../sales/workflow';
import { buildCompanyBrief } from '../sales/agents/company-context.agent';
import { resolveSalesContext } from '../sales/context';
import { handleInboundEmail } from '../ai-management/orchestrator';
import { salesPreviewEnabled } from '../sales/preview-policy';

const router = Router();

export { resolveSalesContext };

router.use((req, _res, next) => {
  if (req.path === '/webhooks/inbound') { next(); return; }
  const syntheticPreview = salesPreviewEnabled();
  if (env.NODE_ENV !== 'production' || syntheticPreview) { next(); return; }
  if (!env.SALES_API_TOKEN) { next(new AppError('Sales API is disabled until SALES_API_TOKEN is configured.', 503, 'SALES_AUTH_NOT_CONFIGURED')); return; }
  const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = Buffer.from(env.SALES_API_TOKEN);
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { next(new AppError('Sales API authentication is required.', 401, 'UNAUTHORIZED')); return; }
  next();
});

router.get('/companies', async (req, res, next) => {
  try {
    const query = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(25) }).parse(req.query);
    const result = await listDiscoveredCompanies(query.page, query.limit);
    sendSuccess(res, result.data, 200, undefined, buildPaginationMeta(query.page, query.limit, result.total));
  } catch (error) { next(error); }
});

router.get('/companies/:companyId', async (req, res, next) => {
  try {
    const context = await resolveSalesContext(req.params.companyId);
    const workflow = await getWorkflow(context.companyId);
    const companyBrief = await buildCompanyBrief(context, workflow.events);
    sendSuccess(res, { ...workflow, company: { companyId: context.companyId, companyName: context.companyName, country: context.country,
      industry: context.industry, website: context.website, description: context.description, opportunity: workflow.events.filter(event => event.type === 'QUALIFIED') },
      companyBrief });
  }
  catch (error) { next(error); }
});

router.get('/drafts', async (_req, res, next) => {
  try {
    const events = await allActivityEvents();
    const drafts = events.filter(event => event.type === 'EMAIL_DRAFTED' && event.payload.aiManaged !== true).filter(draft => !events.some(event => event.type === 'EMAIL_APPROVED' && event.payload.draftId === draft.payload.draftId)
      && !events.some(event => event.type === 'EMAIL_REJECTED' && event.payload.draftId === draft.payload.draftId))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    sendSuccess(res, drafts);
  } catch (error) { next(error); }
});

router.get('/qualification-feedback', async (_req, res, next) => {
  try {
    const items = (await allActivityEvents())
      .filter(event => event.type === 'OPPORTUNITY_UPDATED' && event.payload.change === 'customer_confirmed_requirement_added')
      .map(event => ({ eventId: event.eventId, opportunityId: event.opportunityId, companyId: event.companyId, companyName: event.companyName,
        service: event.service, requirement: event.payload.requirement, evidenceText: event.payload.evidenceText,
        sourceMessageId: event.payload.sourceMessageId, sourceIds: event.sourceIds, createdAt: event.createdAt }));
    sendSuccess(res, items.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)));
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/select', async (req, res, next) => {
  try { const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await selectCompany(context), 201); }
  catch (error) { next(error); }
});

router.post('/companies/:companyId/contacts', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), role: z.string().trim().min(1).max(120),
      source: z.string().trim().min(1).max(300), outreachBasis: z.enum(['RECORDED_CONSENT', 'EXISTING_BUSINESS_RELATIONSHIP', 'ASSESSED_LEGITIMATE_INTEREST', 'INBOUND_REQUEST']) }).strict().parse(req.body);
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await identifyContact(context, input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts', async (req, res, next) => {
  try {
    const input = z.object({ contactId: z.string().optional(), subject: z.string().trim().max(200).optional(), body: z.string().trim().max(10000).optional() }).strict().default({}).parse(req.body ?? {});
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await draftEmail(context, input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts/:draftId/approve', async (req, res, next) => {
  try {
    const input = z.object({ editedSubject: z.string().trim().min(1).max(200).optional(), editedBody: z.string().trim().min(1).max(10000).optional() }).strict().default({}).parse(req.body ?? {});
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await approveEmail(context, req.params.draftId, input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts/:draftId/reject', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().max(500).optional() }).strict().default({}).parse(req.body ?? {});
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await rejectEmail(context, req.params.draftId, input.reason), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/drafts/:draftId/send', async (req, res, next) => {
  try { const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await sendApprovedEmail(context, req.params.draftId), 201); }
  catch (error) { next(error); }
});

router.post('/companies/:companyId/replies', async (req, res, next) => {
  try {
    if (env.NODE_ENV === 'production' && !env.HOSTED_PREVIEW) throw new AppError('Reply simulation is available only in the local or hosted demo.', 403, 'DEMO_ONLY');
    const input = z.object({ replyId: z.string().trim().min(1).max(200), contactEmail: z.string().trim().email().max(254), text: z.string().trim().min(1).max(5000),
      providerMessageId: z.string().trim().max(500).optional(), providerThreadId: z.string().trim().max(500).optional(),
    internetMessageId: z.string().trim().max(500).optional() }).strict().parse(req.body);
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await receiveReply(context, input), 201);
  } catch (error) { next(error); }
});

router.post('/companies/:companyId/followups', async (req, res, next) => {
  try {
    const input = z.object({ contactEmail: z.string().trim().email().max(254), scheduledAt: z.string().datetime({ offset: true }),
      requestId: z.string().trim().min(1).max(120), reason: z.string().trim().max(500).optional() }).strict().parse(req.body);
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await scheduleFollowup(context, input), 201);
  } catch (error) { next(error); }
});

router.get('/followups', async (req, res, next) => {
  try {
    const events = await allActivityEvents();
    const pending = events.filter(event => event.type === 'FOLLOWUP_SCHEDULED').filter(schedule => {
      const canceled = events.some(event => event.type === 'FOLLOWUP_CANCELLED' && event.payload.scheduleEventId === schedule.eventId);
      const processed = events.some(event => event.type === 'FOLLOWUP_DUE' && event.payload.scheduleEventId === schedule.eventId);
      return !canceled && !processed && (!req.query.state || (req.query.state === 'due' ? +new Date(String(schedule.payload.scheduledAt)) <= Date.now() : +new Date(String(schedule.payload.scheduledAt)) > Date.now()));
    }).sort((a, b) => +new Date(String(a.payload.scheduledAt)) - +new Date(String(b.payload.scheduledAt)));
    sendSuccess(res, pending);
  } catch (error) { next(error); }
});

router.post('/followups/run-due', async (_req, res, next) => {
  try { sendSuccess(res, await runDueFollowups(resolveSalesContext)); }
  catch (error) { next(error); }
});

router.post('/webhooks/inbound', async (req, res, next) => {
  try {
    if (!env.SALES_EMAIL_WEBHOOK_SECRET) throw new AppError('Inbound email webhook is not enabled.', 503, 'EMAIL_WEBHOOK_NOT_CONFIGURED');
    const supplied = req.header('x-sales-webhook-secret') ?? '';
    const expected = Buffer.from(env.SALES_EMAIL_WEBHOOK_SECRET);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError('Webhook authentication failed.', 401, 'WEBHOOK_UNAUTHORIZED');
    const input = z.object({ providerMessageId: z.string().trim().min(1).max(500), providerThreadId: z.string().trim().min(1).max(500),
      internetMessageId: z.string().trim().max(500).optional(),
      contactEmail: z.string().trim().email().max(254), subject: z.string().trim().max(200).optional(), text: z.string().trim().min(1).max(20000) }).strict().parse(req.body);
    const provider = env.SALES_EMAIL_PROVIDER === 'gmail' ? 'GMAIL' : env.SALES_EMAIL_PROVIDER === 'microsoft' ? 'MICROSOFT_GRAPH' : 'MOCK';
    // The same replyId is used by the polling worker, so a message delivered by both paths is processed once.
    const result = await handleInboundEmail({ replyId: provider + ':' + input.providerMessageId, contactEmail: input.contactEmail, text: input.text,
      providerMessageId: input.providerMessageId, providerThreadId: input.providerThreadId, internetMessageId: input.internetMessageId,
      subject: input.subject, requireThreadMatch: true });
    if (result.status === 'unmatched' || result.status === 'ambiguous') throw new AppError('Sender and provider thread do not match an existing sales conversation.', 404, 'INBOUND_THREAD_UNMATCHED');
    if (result.status === 'busy') throw new AppError('Another AI Management action is running for this company; the provider should retry.', 409, 'AI_MANAGEMENT_BUSY');
    sendSuccess(res, { ...result.reply, aiManagement: { managed: result.managed, companyId: result.companyId, decision: result.decision ?? null, status: result.status } }, 201);
  } catch (error) { next(error); }
});

router.patch('/companies/:companyId/interventions/:interventionId', async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(INTERVENTION_STATUSES), assignedTo: z.string().trim().max(120).optional() }).strict().parse(req.body);
    const context = await resolveSalesContext(req.params.companyId); sendSuccess(res, await updateIntervention(context, req.params.interventionId, input));
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
