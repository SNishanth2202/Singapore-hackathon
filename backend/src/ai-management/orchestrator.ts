import { createHash, randomUUID } from 'node:crypto';
import { businessKnowledgeStore } from '../business/store';
import { isNeo4jConnected } from '../integrations/neo4j/connection';
import { linkSalesConversation } from '../integrations/neo4j/graphService';
import {
  AiManagementCompanyRecord, AiManagementSettingsRecord, CommunicationState, CompanyMemory, ManagementState, MemoryItem,
  NextActionKind, NotificationPriority, NotificationType, PendingAction,
} from '../models/AiManagement';
import { ISalesActivity } from '../models/SalesActivity';
import { allActivityEvents, appendActivity, findActivityById, findCompanyActivities, findEmailSuppression } from '../salesStore';
import { buildCompanyBrief } from '../sales/agents/company-context.agent';
import { offeringsMentioned } from '../sales/agents/contextual-response.agent';
import { generateFollowupCopy } from '../sales/agents/follow-up.agent';
import { ReplyAnalysis } from '../sales/agents/reply-understanding.agent';
import { resolveSalesContext } from '../sales/context';
import { enqueueSyntheticInbound, getEmailProvider, InboundEmail } from '../sales/email-provider';
import { draftEmail, identifyContact, receiveReply, SalesCompanyContext, selectCompany, sendAutonomousEmail, updateIntervention } from '../sales/workflow';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  AI_AUTHORIZATION_STATEMENT, AI_AUTHORIZATION_VERSION, buyingIntentLevel, BuyingIntent, checkOutreachPermission, decideReplyAction,
  OUTREACH_BASES, ReplyDecision, ROUTINE_INTENTS,
} from './policy';
import { latestSelectedLeads } from './scheduler';
import { isTerminalCommunicationState, transitionManagementState } from './state';
import {
  acquireAiManagementLease, createAiNotification, emptyMemory, findEnrolledByContactEmail, getAiManagementSettings, getCompanyManagement,
  listDueCompanies, patchOperationalSettings, releaseAiManagementLease, saveCompanyManagement, updateCompanyNotifications,
} from './store';

const DAY = 86_400_000;
const LEASE_MS = 5 * 60_000;
const AGENT = 'Autonomous Company Communication';
const SYSTEM_ACTOR = 'ai-agent';
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);
const lower = (value?: string | null) => (value ?? '').trim().toLowerCase();

// ---------------------------------------------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------------------------------------------

async function withCompanyLease<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  const leaseKey = 'ai-company:' + companyId;
  const owner = await acquireAiManagementLease(leaseKey, LEASE_MS);
  if (!owner) throw new AppError('Another AI Management action is running for this company. Try again shortly.', 409, 'AI_MANAGEMENT_BUSY');
  try { return await fn(); } finally { await releaseAiManagementLease(leaseKey, owner); }
}

function transition(record: AiManagementCompanyRecord, to: { management?: ManagementState; communication?: CommunicationState },
  actor: string, reason: string, now: Date): AiManagementCompanyRecord {
  const fromManagement = record.managementState, fromCommunication = record.communicationState;
  const toManagement = to.management ?? fromManagement, toCommunication = to.communication ?? fromCommunication;
  transitionManagementState(fromManagement, toManagement);
  if (fromManagement === toManagement && fromCommunication === toCommunication) return record;
  return { ...record, managementState: toManagement, communicationState: toCommunication,
    history: [...(record.history ?? []), { at: now.toISOString(), actor, reason, fromManagement, toManagement, fromCommunication, toCommunication }] };
}

/**
 * Read-modify-write with optimistic concurrency. The mutator always receives the freshest record, so a salesperson
 * pausing or disabling a company while the agent is working is never overwritten. New history entries are also
 * appended to the immutable SalesActivity audit ledger.
 */
async function updateCompany(companyId: string, companyName: string,
  mutate: (record: AiManagementCompanyRecord) => AiManagementCompanyRecord | null, isSynthetic = false): Promise<AiManagementCompanyRecord> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await getCompanyManagement(companyId, companyName);
    const next = mutate(structuredClone(current));
    if (!next) return current;
    try {
      const saved = await saveCompanyManagement(next);
      const added = (saved.history ?? []).slice((current.history ?? []).length);
      for (const [index, change] of added.entries()) {
        await appendActivity({ eventId: `ai-state:${companyId}:${saved.version}:${index}`, type: 'AI_MANAGEMENT_STATE_CHANGED', companyId,
          companyName: saved.companyName, sourceIds: [], isSynthetic, createdAt: new Date(change.at), agent: AGENT,
          payload: { ...change, activationId: saved.activationId ?? null } });
      }
      return saved;
    } catch (error) {
      if (error instanceof AppError && error.code === 'AI_MANAGEMENT_CONFLICT' && attempt < 5) continue;
      throw error;
    }
  }
  throw new AppError('Company management is changing too quickly. Refresh and retry.', 409, 'AI_MANAGEMENT_CONFLICT');
}

async function notify(record: Pick<AiManagementCompanyRecord, 'companyId' | 'companyName' | 'contactName' | 'contactEmail' | 'opportunityScore'>, input: {
  key: string; type: NotificationType; priority: NotificationPriority; title: string; summary: string; requiresAction: boolean;
  eventId?: string; latestMessage?: string; reason?: string; intent?: string; buyingIntent?: BuyingIntent; sentiment?: string;
  buyingSignals?: string[]; requirements?: string[]; recommendation?: string;
}) {
  return createAiNotification({
    notificationId: `${input.type}:${record.companyId}:${input.key}`, eventId: input.eventId ?? input.key, companyId: record.companyId,
    companyName: record.companyName, contactName: record.contactName, contactEmail: record.contactEmail, type: input.type, priority: input.priority,
    title: input.title, summary: input.summary, latestMessage: input.latestMessage?.slice(0, 2000), reason: input.reason, intent: input.intent,
    buyingIntent: input.buyingIntent, sentiment: input.sentiment, buyingSignals: input.buyingSignals ?? [], requirements: input.requirements ?? [],
    recommendation: input.recommendation, opportunityScore: record.opportunityScore ?? null, requiresAction: input.requiresAction,
  });
}

async function agentLog(context: SalesCompanyContext, eventId: string, success: boolean, payload: Record<string, unknown>, extra: Partial<ISalesActivity> = {}) {
  if (await findActivityById(eventId)) return;
  await appendActivity({ eventId, type: 'AGENT_EXECUTION', companyId: context.companyId, companyName: context.companyName, agent: AGENT,
    success, executionMs: 0, sourceIds: [], isSynthetic: context.isSynthetic ?? false, createdAt: new Date(), payload, ...extra });
}

async function logSchedule(context: SalesCompanyContext, record: AiManagementCompanyRecord, kind: NextActionKind, at: Date, reason: string) {
  const eventId = `followup-scheduled:ai:${context.companyId}:${hash(kind + at.toISOString() + (record.activationId ?? ''))}`;
  if (await findActivityById(eventId)) return;
  await appendActivity({ eventId, type: 'FOLLOWUP_SCHEDULED', companyId: context.companyId, companyName: context.companyName,
    contactId: record.contactId, contactName: record.contactName, contactEmail: record.contactEmail, opportunityId: record.opportunityId,
    sourceIds: [], isSynthetic: context.isSynthetic ?? false, createdAt: new Date(),
    payload: { scheduledAt: at.toISOString(), kind: kind === 'CUSTOMER_REQUESTED_FOLLOWUP' ? 'customer_requested' : kind === 'NO_RESPONSE_CLOSE' ? 'no_response_close' : 'no_reply',
      aiManaged: true, nextActionKind: kind, reason, activationId: record.activationId } });
}

async function cancelOpenSchedules(context: SalesCompanyContext, reason: string) {
  const events = await findCompanyActivities(context.companyId);
  const open = events.filter(event => event.type === 'FOLLOWUP_SCHEDULED' && event.payload.aiManaged === true
    && !events.some(other => other.type === 'FOLLOWUP_CANCELLED' && other.payload.scheduleEventId === event.eventId));
  for (const schedule of open) {
    await appendActivity({ eventId: 'followup-cancelled:' + schedule.eventId, type: 'FOLLOWUP_CANCELLED', companyId: context.companyId,
      companyName: context.companyName, contactId: schedule.contactId, contactEmail: schedule.contactEmail, sourceIds: [],
      isSynthetic: context.isSynthetic ?? false, createdAt: new Date(), payload: { scheduleEventId: schedule.eventId, reason, aiManaged: true } });
  }
  return open.length;
}

function effectiveMaxFollowups(settings: AiManagementSettingsRecord) { return Math.min(settings.maxFollowups, settings.followupIntervalsDays.length); }

function nextNoReplyStep(settings: AiManagementSettingsRecord, attemptsDone: number, from: Date): { kind: NextActionKind; at: Date } {
  if (attemptsDone < effectiveMaxFollowups(settings)) return { kind: 'NO_REPLY_FOLLOWUP', at: new Date(+from + settings.followupIntervalsDays[attemptsDone] * DAY) };
  return { kind: 'NO_RESPONSE_CLOSE', at: new Date(+from + settings.noResponseCloseDays * DAY) };
}

// ---------------------------------------------------------------------------------------------------------------
// Readiness and activation
// ---------------------------------------------------------------------------------------------------------------

export interface ReadinessReport {
  ready: boolean; problems: string[];
  intelligence: { discovered: boolean; qualifiedOpportunities: number; evidenceSources: number; researchSnapshot: boolean };
  contact: { contactId?: string; name?: string; email?: string; role?: string; source?: string; outreachBasis?: string; suppressed: boolean } | null;
}

export async function assessReadiness(context: SalesCompanyContext, events?: ISalesActivity[]): Promise<ReadinessReport> {
  const all = events ?? await findCompanyActivities(context.companyId);
  const contactEvent = [...all].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && event.contactEmail);
  const suppressed = contactEvent?.contactEmail ? !!await findEmailSuppression(contactEvent.contactEmail) : false;
  const intelligence = {
    discovered: all.some(event => event.type === 'DISCOVERED'),
    qualifiedOpportunities: all.filter(event => event.type === 'QUALIFIED').length,
    evidenceSources: context.evidence?.length ?? 0,
    researchSnapshot: !!context.researchId && !!context.evidence?.length,
  };
  const problems: string[] = [];
  if (!intelligence.discovered) problems.push('The company has not entered Sales through Discovery.');
  if (!intelligence.qualifiedOpportunities) problems.push('No evidence-qualified opportunity is linked to this company.');
  if (!intelligence.evidenceSources && !context.isSynthetic) problems.push('No verified research evidence is available for this company.');
  if (!contactEvent) problems.push('Add a verified business contact with its source and outreach basis.');
  else if (!contactEvent.payload.outreachBasis && !context.isSynthetic) problems.push('The contact has no recorded outreach basis.');
  if (suppressed) problems.push('The contact has opted out of further outreach.');
  return {
    ready: problems.length === 0, problems, intelligence,
    contact: contactEvent ? { contactId: contactEvent.contactId, name: contactEvent.contactName, email: contactEvent.contactEmail,
      role: typeof contactEvent.payload.role === 'string' ? contactEvent.payload.role : undefined,
      source: typeof contactEvent.payload.source === 'string' ? contactEvent.payload.source : undefined,
      outreachBasis: typeof contactEvent.payload.outreachBasis === 'string' ? contactEvent.payload.outreachBasis : undefined, suppressed } : null,
  };
}

export interface EnableInput {
  actor: string; authorizationAcknowledged: true; complianceReviewed: true; jurisdiction: string;
  contact?: { name: string; email: string; role: string; source: string; outreachBasis: typeof OUTREACH_BASES[number] };
}

const ENROLLED: ManagementState[] = ['ACTIVATING', 'ACTIVE', 'PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER'];

export async function enableCompanyManagement(companyId: string, input: EnableInput, now = new Date()) {
  const context = await resolveSalesContext(companyId);
  return withCompanyLease(context.companyId, async () => {
    const existing = await getCompanyManagement(context.companyId, context.companyName);
    if (ENROLLED.includes(existing.managementState)) {
      throw new AppError('AI Management is already enabled for this company. Use resume to continue a paused workflow.', 409, 'AI_MANAGEMENT_ALREADY_ENABLED');
    }
    if (existing.communicationState === 'UNSUBSCRIBED' || existing.communicationState === 'NOT_INTERESTED') {
      throw new AppError('The customer declined or unsubscribed; AI Management cannot restart outreach for this contact.', 409, 'CUSTOMER_DECLINED');
    }
    const settings = await getAiManagementSettings();
    await selectCompany(context);
    if (input.contact) await identifyContact(context, input.contact);
    const events = await findCompanyActivities(context.companyId);
    const readiness = await assessReadiness(context, events);
    if (!readiness.ready) throw Object.assign(new AppError('AI Management cannot start: ' + readiness.problems.join(' '), 409, 'AI_MANAGEMENT_NOT_READY'), { problems: readiness.problems });
    const contact = readiness.contact!;
    const permission = checkOutreachPermission({ basis: contact.outreachBasis ?? (context.isSynthetic ? 'RECORDED_CONSENT' : undefined), jurisdiction: input.jurisdiction, settings });
    if (!permission.allowed) throw new AppError(permission.reason, 409, 'OUTREACH_NOT_PERMITTED');

    const lead = (await latestSelectedLeads()).find(item => item.companyId === context.companyId);
    const email = lower(contact.email);
    const accepted = events.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email);
    const initial = accepted.find(event => event.payload.kind === 'initial');
    const lastOutbound = accepted.at(-1);
    const brief = await buildCompanyBrief(context, events);
    const activationId = randomUUID();
    const actor = input.actor.trim() || 'local_sales_user';
    const qualified = [...events].reverse().find(event => event.type === 'QUALIFIED');

    const saved = await updateCompany(context.companyId, context.companyName, record => {
      let next = transition({ ...record, communicationState: isTerminalCommunicationState(record.communicationState) || record.communicationState === 'ERROR' ? 'READY' : record.communicationState },
        { management: 'ACTIVATING' }, actor, 'Activation requested by salesperson.', now);
      // If an initial email was already sent (e.g. manually), continue with the follow-up policy instead of sending another one.
      const resumeStep = initial ? nextNoReplyStep(settings, 0, new Date(lastOutbound!.createdAt)) : null;
      next = {
        ...next, companyName: context.companyName, researchId: context.researchId, opportunityId: lead?.opportunityId ?? qualified?.opportunityId,
        country: lead?.country ?? context.country ?? undefined, industry: lead?.industry ?? context.industry ?? undefined,
        priority: lead?.priority ?? record.priority, product: lead?.product ?? context.service ?? record.product,
        leadScore: lead?.score ?? record.leadScore ?? null, leadConfidence: lead?.confidence ?? record.leadConfidence ?? null,
        contactId: contact.contactId, contactEmail: email, contactName: contact.name, contactRole: contact.role,
        jurisdiction: input.jurisdiction.toUpperCase(), outreachBasis: contact.outreachBasis,
        activationId, activatedAt: now, activatedBy: actor, consentVersion: AI_AUTHORIZATION_VERSION,
        authorization: { version: AI_AUTHORIZATION_VERSION, statement: AI_AUTHORIZATION_STATEMENT, acknowledgedBy: actor, acknowledgedAt: now.toISOString(),
          complianceReviewed: true, jurisdiction: input.jurisdiction.toUpperCase(), outreachBasis: contact.outreachBasis ?? 'SYNTHETIC_PREVIEW' },
        humanAttention: false, attentionReason: undefined, humanOwner: undefined, pausedAt: undefined, pauseReason: undefined, lastError: null,
        completedAt: undefined, disabledAt: undefined, followupAttempts: 0,
        initialSentAt: initial ? new Date(initial.createdAt) : undefined, lastOutboundAt: lastOutbound ? new Date(lastOutbound.createdAt) : record.lastOutboundAt,
        nextActionAt: resumeStep ? new Date(Math.max(+now, +resumeStep.at)) : now,
        nextActionKind: resumeStep ? resumeStep.kind : 'INITIAL_OUTREACH',
        nextActionNote: initial ? 'Initial outreach was already sent; continuing with the follow-up policy.' : 'Initial outreach',
        opportunityScore: record.opportunityScore ?? lead?.score ?? null,
        scoreHistory: record.scoreHistory?.length || lead?.score == null ? record.scoreHistory
          : [{ at: now.toISOString(), previous: null, score: lead.score, reason: 'Baseline from the Lead Ranking Agent at activation.', sourceEventId: lead.runId }],
        memory: { ...(record.memory ?? emptyMemory()), summary: record.memory?.summary || brief.companySummary },
      };
      return transition(next, { management: 'ACTIVE', communication: initial ? 'FOLLOW_UP_SCHEDULED' : 'READY' }, actor,
        'Intelligence, contact, suppression and outreach-basis checks passed; autonomous workflow authorised.', now);
    }, context.isSynthetic);
    await agentLog(context, 'agent:ai-activation:' + activationId, true, { activationId, actor, jurisdiction: saved.jurisdiction,
      outreachBasis: saved.outreachBasis, authorizationVersion: AI_AUTHORIZATION_VERSION, readiness: readiness.intelligence,
      globalOutboundEnabled: settings.globalOutboundEnabled });
    const step = await runCompanyStepUnderLease(context, now);
    const warnings = settings.globalOutboundEnabled ? [] : ['Global outbound sending is stopped; no email will be sent until it is resumed.'];
    if (env.SALES_EMAIL_PROVIDER === 'mock') warnings.push('Synthetic preview mode: messages are recorded in a local synthetic outbox and are not sent.');
    return { company: await getCompanyManagement(context.companyId), step, warnings };
  });
}

/** Keep the existing Sales intervention queue consistent with decisions taken in AI Management. */
export async function syncCompanyInterventions(companyId: string, status: 'ASSIGNED' | 'RESOLVED', actor: string) {
  const events = await findCompanyActivities(companyId);
  const latest = new Map<string, ISalesActivity>();
  for (const event of events) if (event.type === 'INTERVENTION_CREATED' || event.type === 'INTERVENTION_UPDATED') latest.set(String(event.payload.interventionId), event);
  const open = [...latest.values()].filter(event => !['RESOLVED', 'CLOSED'].includes(event.status ?? '') && event.status !== status);
  if (!open.length) return 0;
  const context = await resolveSalesContext(companyId);
  for (const event of open) await updateIntervention(context, String(event.payload.interventionId), { status, assignedTo: actor });
  return open.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Salesperson controls (no lease: these must never wait behind a slow model call)
// ---------------------------------------------------------------------------------------------------------------

async function requireRecord(companyId: string) {
  const record = await getCompanyManagement(companyId);
  if (record.managementState === 'OFF' && !record.activatedAt) throw new AppError('AI Management has not been enabled for this company.', 404, 'AI_MANAGEMENT_NOT_ENABLED');
  return record;
}

export async function pauseCompanyManagement(companyId: string, actor: string, reason?: string, now = new Date()) {
  const record = await requireRecord(companyId);
  if (record.managementState === 'PAUSED') return record;
  return updateCompany(companyId, record.companyName, current => ({
    ...transition(current, { management: 'PAUSED' }, actor, reason?.trim() || 'Paused by salesperson.', now), pausedAt: now, pauseReason: reason?.trim() || 'Paused by salesperson.',
  }));
}

export async function resumeCompanyManagement(companyId: string, actor: string, now = new Date()) {
  const record = await requireRecord(companyId);
  if (record.managementState === 'ACTIVE') return record;
  if (isTerminalCommunicationState(record.communicationState)) {
    throw new AppError('This conversation has ended (' + record.communicationState.replace(/_/g, ' ').toLowerCase() + '). Enable AI Management again to start a new cycle.', 409, 'AI_MANAGEMENT_CONVERSATION_ENDED');
  }
  if (!['PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'ERROR'].includes(record.managementState)) {
    throw new AppError('Only paused, escalated, handed-over or failed companies can be resumed.', 409, 'AI_MANAGEMENT_TRANSITION_INVALID');
  }
  if (record.contactEmail && await findEmailSuppression(record.contactEmail)) throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  const settings = await getAiManagementSettings();
  const context = await resolveSalesContext(companyId);
  const saved = await updateCompany(companyId, record.companyName, current => {
    let nextActionAt = current.nextActionAt ? new Date(current.nextActionAt) : null;
    let nextActionKind = current.nextActionKind ?? null;
    let followupAttempts = current.followupAttempts;
    if (!nextActionAt || !nextActionKind) {
      if (!current.initialSentAt) { nextActionKind = 'INITIAL_OUTREACH'; nextActionAt = now; }
      else {
        // After a human has handled the conversation, restart the no-reply sequence from the latest message.
        const lastActivity = Math.max(+new Date(current.lastOutboundAt ?? 0), +new Date(current.lastInboundAt ?? 0));
        const step = nextNoReplyStep(settings, 0, new Date(lastActivity));
        nextActionKind = step.kind; nextActionAt = new Date(Math.max(+now, +step.at)); followupAttempts = 0;
      }
    }
    const communication: CommunicationState = !current.initialSentAt ? 'READY'
      : nextActionKind === 'NO_RESPONSE_CLOSE' ? 'WAITING_FOR_REPLY' : 'FOLLOW_UP_SCHEDULED';
    return { ...transition(current, { management: 'ACTIVE', communication: current.communicationState === 'ERROR' || current.communicationState === 'CUSTOMER_RESPONDED' ? communication : current.communicationState },
      actor, 'Resumed by salesperson.', now),
    resumedAt: now, lastHandledInboundAt: now, humanAttention: false, attentionReason: undefined, lastError: null,
    nextActionAt, nextActionKind, followupAttempts, nextActionNote: current.nextActionNote ?? 'Resumed by salesperson' };
  }, context.isSynthetic);
  if (saved.nextActionAt) await logSchedule(context, saved, saved.nextActionKind!, new Date(saved.nextActionAt), 'AI Management resumed');
  await updateCompanyNotifications(companyId, { status: 'RESOLVED', resolvedAt: now, resolvedBy: actor, resolution: 'AI Management resumed by salesperson.' }, ['OPEN', 'ACKNOWLEDGED']);
  // Resuming means the salesperson has handled the open items; otherwise an assigned intervention would block follow-ups.
  await syncCompanyInterventions(companyId, 'RESOLVED', actor);
  return saved;
}

export async function takeOverCompany(companyId: string, owner: string, now = new Date()) {
  const record = await requireRecord(companyId);
  const context = await resolveSalesContext(companyId);
  const saved = await updateCompany(companyId, record.companyName, current => ({
    ...transition(current, { management: 'HUMAN_HANDOVER' }, owner, 'Salesperson took over the conversation.', now),
    humanOwner: owner, handoverAt: now, nextActionAt: null, nextActionKind: null, nextActionNote: 'Handled by ' + owner,
  }), context.isSynthetic);
  await cancelOpenSchedules(context, 'human_takeover');
  await updateCompanyNotifications(companyId, { status: 'ACKNOWLEDGED', owner }, ['OPEN']);
  await syncCompanyInterventions(companyId, 'ASSIGNED', owner);
  return saved;
}

export async function disableCompanyManagement(companyId: string, actor: string, now = new Date()) {
  const record = await requireRecord(companyId);
  if (record.managementState === 'OFF') return record;
  const context = await resolveSalesContext(companyId);
  const saved = await updateCompany(companyId, record.companyName, current => ({
    ...transition(current, { management: 'OFF' }, actor, 'AI Management disabled by salesperson; history and intelligence retained.', now),
    disabledAt: now, disabledBy: actor, nextActionAt: null, nextActionKind: null, nextActionNote: null, humanAttention: false,
  }), context.isSynthetic);
  const cancelled = await cancelOpenSchedules(context, 'ai_management_disabled');
  return { ...saved, cancelledFollowups: cancelled };
}

export async function setGlobalOutbound(enabled: boolean, actor: string, reason?: string, now = new Date()) {
  const settings = await patchOperationalSettings({ globalOutboundEnabled: enabled, outboundStoppedAt: enabled ? null : now,
    outboundStopReason: enabled ? null : (reason?.trim() || 'Emergency stop by ' + actor) });
  await createAiNotification({ notificationId: `EMERGENCY_STOP:global:${now.toISOString()}`, eventId: 'global-outbound', companyId: 'global',
    companyName: 'All companies', type: 'EMERGENCY_STOP', priority: enabled ? 'MEDIUM' : 'CRITICAL', requiresAction: false,
    title: enabled ? 'Autonomous outbound email resumed' : 'Emergency stop: all autonomous outbound email halted',
    summary: (enabled ? 'Resumed by ' : 'Stopped by ') + actor + (reason ? ': ' + reason : '.') });
  return settings;
}

// ---------------------------------------------------------------------------------------------------------------
// Scheduled company steps: initial outreach, follow-ups and close-out
// ---------------------------------------------------------------------------------------------------------------

export interface StepResult { companyId: string; status: 'sent' | 'skipped' | 'blocked' | 'failed' | 'closed' | 'rescheduled' | 'busy'; action?: NextActionKind | null; reason?: string; eventId?: string }

function followupBlocker(events: ISalesActivity[], record: AiManagementCompanyRecord): { outcome: 'UNSUBSCRIBED' | 'DECLINED' | 'HUMAN_HANDLING' | 'UNANSWERED_REPLY'; reason: string } | null {
  const email = lower(record.contactEmail);
  if (events.some(event => event.type === 'SUPPRESSION_ADDED' && lower(event.contactEmail) === email)) return { outcome: 'UNSUBSCRIBED', reason: 'Contact is suppressed.' };
  const since = +new Date(record.activatedAt ?? 0);
  if (events.some(event => event.type === 'REPLY_CLASSIFIED' && lower(event.contactEmail) === email && +new Date(event.createdAt) >= since
    && ['UNSUBSCRIBE', 'NOT_INTERESTED', 'COMPLAINT'].includes(event.intent ?? ''))) return { outcome: 'DECLINED', reason: 'Customer declined or complained.' };
  const interventions = new Map<string, ISalesActivity>();
  for (const event of events) if (event.type === 'INTERVENTION_CREATED' || event.type === 'INTERVENTION_UPDATED') interventions.set(String(event.payload.interventionId), event);
  if ([...interventions.values()].some(event => lower(event.contactEmail) === email && ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_INTERNAL_INFORMATION'].includes(event.status ?? ''))) {
    return { outcome: 'HUMAN_HANDLING', reason: 'A salesperson is handling an open intervention for this contact.' };
  }
  const lastReply = [...events].reverse().find(event => event.type === 'REPLY_RECEIVED' && lower(event.contactEmail) === email);
  const lastOutbound = [...events].reverse().find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email);
  const handled = Math.max(+new Date(lastOutbound?.createdAt ?? 0), +new Date(record.lastHandledInboundAt ?? 0), +new Date(record.resumedAt ?? 0));
  if (lastReply && +new Date(lastReply.createdAt) > handled) return { outcome: 'UNANSWERED_REPLY', reason: 'The customer’s latest message has not been answered; answer it before any follow-up.' };
  return null;
}

async function initialOutreach(context: SalesCompanyContext, record: AiManagementCompanyRecord, settings: AiManagementSettingsRecord, now: Date): Promise<StepResult> {
  const events = await findCompanyActivities(context.companyId);
  const email = lower(record.contactEmail);
  const already = events.find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email && event.payload.kind === 'initial');
  const contact = [...events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && lower(event.contactEmail) === email);
  if (!contact) throw new AppError('The activated contact record no longer exists.', 409, 'CONTACT_REQUIRED');
  let accepted = already;
  if (!accepted) {
    const draftId = hash('ai-initial:' + context.companyId + ':' + record.activationId);
    await draftEmail(context, { contactId: contact.contactId, kind: 'initial', draftId, aiManaged: true });
    accepted = await sendAutonomousEmail(context, draftId, { leaseHeld: true, minimumConfidence: settings.minimumOutreachConfidence, proactive: true, now });
  }
  const sentAt = new Date(accepted.createdAt);
  const step = nextNoReplyStep(settings, 0, sentAt);
  const saved = await updateCompany(context.companyId, context.companyName, current => {
    const next = transition(current, { communication: 'OUTREACH_SENT' }, SYSTEM_ACTOR, 'Initial outreach accepted by the email provider.', now);
    const keepSchedule = current.managementState !== 'OFF';
    return { ...transition(next, { communication: step.kind === 'NO_REPLY_FOLLOWUP' ? 'FOLLOW_UP_SCHEDULED' : 'WAITING_FOR_REPLY' }, SYSTEM_ACTOR,
      step.kind === 'NO_REPLY_FOLLOWUP' ? 'Waiting for a reply; follow-up scheduled.' : 'Waiting for a reply; no follow-ups configured.', now),
    initialSentAt: sentAt, lastOutboundAt: sentAt, lastMessageAt: sentAt, followupAttempts: 0,
    nextActionAt: keepSchedule ? step.at : null, nextActionKind: keepSchedule ? step.kind : null, nextActionNote: 'No reply to initial outreach' };
  }, context.isSynthetic);
  if (saved.nextActionAt) await logSchedule(context, saved, step.kind, step.at, 'No reply to initial outreach');
  await syncOutbound(context, saved, accepted);
  return { companyId: context.companyId, status: 'sent', action: 'INITIAL_OUTREACH', eventId: accepted.eventId };
}

async function followup(context: SalesCompanyContext, record: AiManagementCompanyRecord, settings: AiManagementSettingsRecord, now: Date): Promise<StepResult> {
  const events = await findCompanyActivities(context.companyId);
  const kind = record.nextActionKind as 'NO_REPLY_FOLLOWUP' | 'CUSTOMER_REQUESTED_FOLLOWUP';
  const blocker = followupBlocker(events, record);
  if (blocker) {
    if (blocker.outcome === 'UNSUBSCRIBED' || blocker.outcome === 'DECLINED') {
      await updateCompany(context.companyId, context.companyName, current => ({
        ...transition(current, { management: 'COMPLETED', communication: blocker.outcome === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'NOT_INTERESTED' }, SYSTEM_ACTOR, blocker.reason, now),
        completedAt: now, nextActionAt: null, nextActionKind: null }), context.isSynthetic);
      await cancelOpenSchedules(context, blocker.outcome.toLowerCase());
      return { companyId: context.companyId, status: 'closed', action: kind, reason: blocker.reason };
    }
    await updateCompany(context.companyId, context.companyName, current => ({
      ...transition(current, { management: 'HUMAN_ATTENTION_REQUIRED', communication: 'CUSTOMER_RESPONDED' }, SYSTEM_ACTOR, blocker.reason, now),
      humanAttention: true, attentionReason: blocker.reason, nextActionAt: null, nextActionKind: null }), context.isSynthetic);
    await notify(record, { key: 'blocked:' + hash(String(record.nextActionAt)), type: 'FOLLOWUP_FAILED', priority: 'MEDIUM', requiresAction: true,
      title: 'Follow-up held for ' + record.companyName, summary: blocker.reason, reason: blocker.reason,
      recommendation: 'Review the conversation, then resume AI Management or take over.' });
    return { companyId: context.companyId, status: 'blocked', action: kind, reason: blocker.reason };
  }
  const max = effectiveMaxFollowups(settings);
  if (kind === 'NO_REPLY_FOLLOWUP' && record.followupAttempts >= max) {
    const step = nextNoReplyStep(settings, record.followupAttempts, now);
    await updateCompany(context.companyId, context.companyName, current => ({
      ...transition(current, { communication: 'WAITING_FOR_REPLY' }, SYSTEM_ACTOR, 'Follow-up limit reached.', now), nextActionAt: step.at, nextActionKind: step.kind }), context.isSynthetic);
    return { companyId: context.companyId, status: 'rescheduled', action: kind, reason: 'Follow-up limit reached.' };
  }
  const email = lower(record.contactEmail);
  const contact = [...events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && lower(event.contactEmail) === email);
  const lastAccepted = [...events].reverse().find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email);
  if (!contact || !lastAccepted) throw new AppError('A follow-up needs the activated contact and an earlier accepted email.', 409, 'FOLLOWUP_CONTEXT_REQUIRED');
  const attempt = kind === 'NO_REPLY_FOLLOWUP' ? record.followupAttempts + 1 : 0;
  const isFinal = kind === 'NO_REPLY_FOLLOWUP' && attempt === max;
  const draftId = hash('ai-followup:' + context.companyId + ':' + record.activationId + ':' + kind + ':' + new Date(record.nextActionAt!).toISOString());
  if (!await findActivityById('draft:' + draftId)) {
    const brief = await buildCompanyBrief(context, events);
    const copy = await generateFollowupCopy(context, brief, events, contact,
      { kind: kind === 'CUSTOMER_REQUESTED_FOLLOWUP' ? 'customer_requested' : 'no_reply', attempt, isFinal, note: record.nextActionNote ?? undefined });
    await appendActivity({ eventId: 'draft:' + draftId, type: 'EMAIL_DRAFTED', companyId: context.companyId, companyName: context.companyName,
      contactId: contact.contactId, contactName: contact.contactName, contactEmail: email, opportunityId: lastAccepted.opportunityId,
      subject: copy.subject, body: copy.body, sourceIds: lastAccepted.sourceIds, isSynthetic: context.isSynthetic ?? false, createdAt: new Date(),
      payload: { draftId, kind: 'followup', followupKind: kind === 'CUSTOMER_REQUESTED_FOLLOWUP' ? 'customer_requested' : 'no_reply', attempt, isFinal,
        aiManaged: true, editable: false, requiresApproval: false, providerThreadId: lastAccepted.payload.providerThreadId,
        inboundProviderMessageId: lastAccepted.providerMessageId, internetMessageId: lastAccepted.payload.internetMessageId,
        inReplyTo: lastAccepted.payload.internetMessageId ?? lastAccepted.providerMessageId,
        rationale: copy.rationale, confidence: copy.confidence, generatedBy: copy.generatedBy } });
  }
  const accepted = await sendAutonomousEmail(context, draftId, { leaseHeld: true, minimumConfidence: settings.minimumOutreachConfidence, proactive: true, now });
  const sentAt = new Date(accepted.createdAt);
  const step = nextNoReplyStep(settings, kind === 'NO_REPLY_FOLLOWUP' ? attempt : 0, sentAt);
  const saved = await updateCompany(context.companyId, context.companyName, current => {
    const keep = current.managementState !== 'OFF';
    const memory = closePending(current.memory, 'FOLLOW_UP_REQUESTED', now);
    return { ...transition(current, { communication: step.kind === 'NO_REPLY_FOLLOWUP' ? 'FOLLOW_UP_SCHEDULED' : 'WAITING_FOR_REPLY' }, SYSTEM_ACTOR,
      (kind === 'CUSTOMER_REQUESTED_FOLLOWUP' ? 'Customer-requested follow-up sent.' : `Follow-up ${attempt} of ${max} sent.`), now),
    lastOutboundAt: sentAt, lastMessageAt: sentAt, followupAttempts: kind === 'NO_REPLY_FOLLOWUP' ? attempt : 0, memory,
    nextActionAt: keep ? step.at : null, nextActionKind: keep ? step.kind : null,
    nextActionNote: step.kind === 'NO_RESPONSE_CLOSE' ? 'Close as no response if the customer does not reply' : 'No reply to follow-up' };
  }, context.isSynthetic);
  if (saved.nextActionAt) await logSchedule(context, saved, step.kind, step.at, step.kind === 'NO_RESPONSE_CLOSE' ? 'Final close-out' : 'No reply');
  await syncOutbound(context, saved, accepted);
  return { companyId: context.companyId, status: 'sent', action: kind, eventId: accepted.eventId };
}

async function closeNoResponse(context: SalesCompanyContext, record: AiManagementCompanyRecord, now: Date): Promise<StepResult> {
  const events = await findCompanyActivities(context.companyId);
  const blocker = followupBlocker(events, record);
  if (blocker) return followup(context, { ...record, nextActionKind: 'NO_REPLY_FOLLOWUP' }, await getAiManagementSettings(), now);
  await updateCompany(context.companyId, context.companyName, current => ({
    ...transition(current, { management: 'COMPLETED', communication: 'NO_RESPONSE' }, SYSTEM_ACTOR, 'No reply after the configured follow-up sequence.', now),
    completedAt: now, nextActionAt: null, nextActionKind: null, nextActionNote: null }), context.isSynthetic);
  await notify(record, { key: 'no-response:' + record.activationId, type: 'NO_RESPONSE', priority: 'LOW', requiresAction: false,
    title: record.companyName + ': no response', summary: `No reply after the initial outreach and ${record.followupAttempts} follow-up(s). Automated outreach has stopped.` });
  return { companyId: context.companyId, status: 'closed', action: 'NO_RESPONSE_CLOSE', reason: 'No response.' };
}

const BLOCKING_CODES = ['AUTONOMOUS_CONFIDENCE_LOW', 'OUTBOUND_SAFETY_BLOCKED', 'CONTACT_REQUIRED', 'OUTREACH_BASIS_REQUIRED', 'AUTONOMOUS_CONTACT_CHANGED',
  'FOLLOWUP_CONTEXT_REQUIRED', 'COMPANY_NOT_SELECTED', 'EVENT_ID_CONFLICT'];

async function handleStepFailure(context: SalesCompanyContext, record: AiManagementCompanyRecord, error: unknown, now: Date): Promise<StepResult> {
  const code = error instanceof AppError ? error.code : 'UNEXPECTED_ERROR';
  const message = error instanceof Error ? error.message : 'Unexpected AI Management error.';
  const action = record.nextActionKind ?? null;
  if (code === 'AUTONOMOUS_SEND_PAUSED' || code === 'AI_MANAGEMENT_BUSY') return { companyId: context.companyId, status: 'skipped', action, reason: message };
  if (code === 'CONTACT_OPTED_OUT') {
    await updateCompany(context.companyId, context.companyName, current => ({ ...transition(current, { management: 'COMPLETED', communication: 'UNSUBSCRIBED' }, SYSTEM_ACTOR, message, now),
      completedAt: now, nextActionAt: null, nextActionKind: null }), context.isSynthetic);
    await cancelOpenSchedules(context, 'opt_out');
    return { companyId: context.companyId, status: 'closed', action, reason: message };
  }
  if (code === 'FREQUENCY_LIMIT') {
    const at = new Date(+now + DAY);
    await updateCompany(context.companyId, context.companyName, current => ({ ...current, nextActionAt: at }), context.isSynthetic);
    return { companyId: context.companyId, status: 'rescheduled', action, reason: message };
  }
  const blocked = BLOCKING_CODES.includes(code);
  await appendActivity({ eventId: `outreach-blocked:${context.companyId}:${hash(code + String(record.nextActionAt) + record.activationId)}`, type: 'OUTREACH_BLOCKED',
    companyId: context.companyId, companyName: context.companyName, contactEmail: record.contactEmail, success: false, sourceIds: [],
    isSynthetic: context.isSynthetic ?? false, createdAt: new Date(), payload: { code, message, action, activationId: record.activationId,
      violations: (error as { violations?: string[] }).violations ?? [] } }).catch(() => undefined);
  await agentLog(context, `agent:ai-step-failed:${context.companyId}:${hash(code + String(record.nextActionAt))}`, false, { code, message, action });
  const providerFailure = code.startsWith('EMAIL_') || code === 'PROVIDER_RESULT_UNKNOWN' || code === 'PREVIEW_REAL_EMAIL_BLOCKED';
  await updateCompany(context.companyId, context.companyName, current => ({
    ...transition(current, blocked ? { management: 'HUMAN_ATTENTION_REQUIRED' } : { management: 'ERROR' }, SYSTEM_ACTOR, message, now),
    humanAttention: blocked, attentionReason: blocked ? message : current.attentionReason, lastError: message }), context.isSynthetic);
  await notify(record, {
    key: 'step:' + hash(code + String(record.nextActionAt) + record.activationId),
    type: blocked ? 'OUTREACH_BLOCKED' : providerFailure ? 'EMAIL_DELIVERY_FAILED' : action && action !== 'INITIAL_OUTREACH' ? 'FOLLOWUP_FAILED' : 'AI_MANAGEMENT_ERROR',
    priority: 'HIGH', requiresAction: true,
    title: (blocked ? 'Outreach not sent for ' : 'AI Management error for ') + record.companyName,
    summary: message, reason: code,
    recommendation: blocked ? 'Review the company intelligence, contact and draft. Edit or send manually, then resume AI Management.'
      : code === 'EMAIL_SEND_RECONCILIATION_REQUIRED' || code === 'EMAIL_SEND_RETRY_BLOCKED'
        ? 'Check the provider mailbox to confirm whether the message was sent before resuming, to avoid a duplicate email.'
        : 'Fix the configuration problem, then resume AI Management.',
  });
  return { companyId: context.companyId, status: blocked ? 'blocked' : 'failed', action, reason: message };
}

async function runCompanyStepUnderLease(context: SalesCompanyContext, now: Date): Promise<StepResult> {
  const record = await getCompanyManagement(context.companyId, context.companyName);
  const settings = await getAiManagementSettings();
  if (record.managementState !== 'ACTIVE') return { companyId: context.companyId, status: 'skipped', reason: 'AI Management is ' + record.managementState + '.' };
  if (!settings.globalOutboundEnabled) return { companyId: context.companyId, status: 'skipped', reason: 'Global outbound sending is stopped.' };
  if (!record.nextActionAt || !record.nextActionKind || +new Date(record.nextActionAt) > +now) {
    return { companyId: context.companyId, status: 'skipped', action: record.nextActionKind ?? null, reason: 'No action is due.' };
  }
  try {
    if (record.nextActionKind === 'INITIAL_OUTREACH') return await initialOutreach(context, record, settings, now);
    if (record.nextActionKind === 'NO_RESPONSE_CLOSE') return await closeNoResponse(context, record, now);
    return await followup(context, record, settings, now);
  } catch (error) {
    logger.warn('AI Management step did not complete', { companyId: context.companyId, action: record.nextActionKind,
      code: error instanceof AppError ? error.code : 'UNEXPECTED_ERROR' });
    return handleStepFailure(context, record, error, now);
  }
}

export async function processCompany(companyId: string, now = new Date()): Promise<StepResult> {
  const context = await resolveSalesContext(companyId);
  try {
    return await withCompanyLease(context.companyId, () => runCompanyStepUnderLease(context, now));
  } catch (error) {
    if (error instanceof AppError && error.code === 'AI_MANAGEMENT_BUSY') return { companyId, status: 'busy', reason: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Inbound replies
// ---------------------------------------------------------------------------------------------------------------

function addItems(list: MemoryItem[], texts: string[], sourceEventId: string, at: string, serviceIds?: (text: string) => string[]) {
  const known = new Set(list.map(item => item.text.toLowerCase()));
  const additions = texts.map(text => text.trim()).filter(text => text && !known.has(text.toLowerCase()))
    .map(text => ({ text: text.slice(0, 500), sourceEventId, at, ...(serviceIds ? { serviceIds: serviceIds(text) } : {}) }));
  return [...list, ...additions].slice(-100);
}

function closePending(memory: CompanyMemory | undefined, type: string, now: Date): CompanyMemory {
  const value = { ...emptyMemory(), ...(memory ?? {}) };
  return { ...value, pendingActions: value.pendingActions.map(item => item.type === type && item.status === 'OPEN' ? { ...item, status: 'DONE' as const, closedAt: now.toISOString() } : item) };
}

const PENDING_BY_INTENT: Record<string, string> = {
  MEETING_REQUEST: 'Customer requested a meeting — confirm availability (no meeting has been scheduled).',
  PROPOSAL_REQUEST: 'Customer requested a proposal — prepare and send it.',
  PRICING_REQUEST: 'Customer requested pricing — provide approved commercial information.',
  NEGOTIATION: 'Customer raised commercial terms — salesperson to respond.',
  TECHNICAL_QUESTION: 'Technical question needs internal confirmation.',
  REFERRAL: 'Customer referred another contact — verify the new contact before outreach.',
  FOLLOWUP_REQUESTED: 'Customer asked to be contacted later.',
  FUTURE_OPPORTUNITY: 'Customer indicated a future opportunity.',
};

function updateMemory(record: AiManagementCompanyRecord, analysis: ReplyAnalysis, reply: ISalesActivity, serviceIdsFor: (text: string) => string[],
  decision: ReplyDecision, now: Date, inboundCount: number, outboundCount: number): CompanyMemory {
  const at = now.toISOString();
  const memory = { ...emptyMemory(), ...(record.memory ?? {}) };
  const providerIntents = ['EXISTING_PROVIDER', 'PROVIDER_DISSATISFACTION', 'COMPETITOR_DISCUSSION'];
  const pendingType = analysis.intent === 'NEGOTIATION' ? 'PRICING_REQUEST' : analysis.intent;
  const pending: PendingAction[] = PENDING_BY_INTENT[analysis.intent] && !memory.pendingActions.some(item => item.type === pendingType && item.status === 'OPEN')
    ? [{ id: hash(reply.eventId + pendingType), type: pendingType === 'FUTURE_OPPORTUNITY' ? 'FOLLOW_UP_REQUESTED' : pendingType,
      description: PENDING_BY_INTENT[analysis.intent], sourceEventId: reply.eventId, status: 'OPEN', createdAt: at }] : [];
  const next: CompanyMemory = {
    ...memory,
    requirements: addItems(memory.requirements, analysis.requirements.map(item => item.text), reply.eventId, at, serviceIdsFor),
    questions: addItems(memory.questions, analysis.questionsAsked, reply.eventId, at),
    objections: addItems(memory.objections, analysis.objections, reply.eventId, at),
    buyingSignals: addItems(memory.buyingSignals, analysis.buyingSignals, reply.eventId, at),
    existingProviders: providerIntents.includes(analysis.intent) ? addItems(memory.existingProviders, [String(reply.body ?? '').slice(0, 300)], reply.eventId, at) : memory.existingProviders,
    preferences: decision.action === 'RESCHEDULE' ? addItems(memory.preferences, [decision.kind === 'CUSTOMER_REQUESTED_FOLLOWUP'
      ? 'Asked to be contacted around ' + decision.at.toISOString().slice(0, 10) : 'Out of office; contact after ' + decision.at.toISOString().slice(0, 10)], reply.eventId, at)
      : decision.action === 'SUPPRESS' ? addItems(memory.preferences, ['Do not contact (unsubscribed)'], reply.eventId, at) : memory.preferences,
    pendingActions: [...memory.pendingActions, ...pending].slice(-50),
  };
  const openPending = next.pendingActions.filter(item => item.status === 'OPEN').map(item => item.description);
  next.summary = [
    `${outboundCount} outbound and ${inboundCount} inbound message(s).`,
    `Latest customer intent: ${analysis.intent.replace(/_/g, ' ').toLowerCase()} (${analysis.sentiment.toLowerCase()} tone).`,
    next.requirements.length ? 'Customer-stated requirements: ' + next.requirements.slice(-5).map(item => item.text).join('; ') + '.' : '',
    next.existingProviders.length ? 'Existing provider mentioned.' : '',
    openPending.length ? 'Pending: ' + openPending.join(' ') : '',
  ].filter(Boolean).join(' ');
  return next;
}

/** Score changes require customer-stated evidence and are recorded with their reason; earlier scores are kept. */
function scoreChange(record: AiManagementCompanyRecord, analysis: ReplyAnalysis, newMappedRequirements: number, sourceEventId: string, now: Date) {
  if (record.opportunityScore == null) return null;
  const reasons: string[] = [];
  let delta = 0;
  if (newMappedRequirements) { delta += Math.min(15, newMappedRequirements * 5); reasons.push(`${newMappedRequirements} customer-stated requirement(s) matched to the Singtel catalogue (+${Math.min(15, newMappedRequirements * 5)})`); }
  if (['MEETING_REQUEST', 'PROPOSAL_REQUEST'].includes(analysis.intent)) { delta += 10; reasons.push('explicit ' + analysis.intent.replace('_', ' ').toLowerCase() + ' (+10)'); }
  else if (['INTERESTED', 'SERVICE_REQUEST', 'PROVIDER_DISSATISFACTION'].includes(analysis.intent)) { delta += 5; reasons.push('explicit customer interest (+5)'); }
  if (!delta) return null;
  // One email can move the score by at most 15 points; larger changes need further evidence over the conversation.
  if (delta > 15) { reasons.push(`capped at +15 for a single reply (from +${delta})`); delta = 15; }
  const score = Math.min(100, Math.round(record.opportunityScore + delta));
  if (score === record.opportunityScore) return null;
  return { at: now.toISOString(), previous: record.opportunityScore, score, reason: 'Customer reply: ' + reasons.join('; ') + '.', sourceEventId };
}

async function syncOutbound(context: SalesCompanyContext, record: AiManagementCompanyRecord, accepted: ISalesActivity) {
  if (!isNeo4jConnected()) return;
  try {
    await linkSalesConversation({ companyId: context.companyId, companyName: context.companyName, contactId: record.contactId, opportunityId: record.opportunityId,
      threadId: String(accepted.payload.providerThreadId ?? accepted.providerMessageId ?? accepted.eventId), messageId: accepted.eventId,
      direction: 'OUTBOUND', at: new Date(accepted.createdAt).toISOString(), requirements: [] });
  } catch (error) { logger.warn('Could not sync outbound interaction to Neo4j', { companyId: context.companyId, error: error instanceof Error ? error.message : 'unknown' }); }
}

export interface InboundInput {
  replyId: string; contactEmail: string; text: string; providerMessageId?: string; providerThreadId?: string; internetMessageId?: string;
  inReplyTo?: string; subject?: string; isSynthetic?: boolean; requireThreadMatch?: boolean;
}
export interface InboundResult {
  status: 'processed' | 'duplicate' | 'unmatched' | 'ambiguous' | 'busy'; managed: boolean; companyId?: string;
  decision?: ReplyDecision['action']; reason?: string; buyingIntent?: BuyingIntent; reply?: Awaited<ReturnType<typeof receiveReply>>;
}

function threadMatches(events: ISalesActivity[], email: string, input: InboundInput) {
  return events.some(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email && (
    (input.providerThreadId && (event.payload.providerThreadId === input.providerThreadId || event.providerMessageId === input.providerThreadId))
    || (input.inReplyTo && event.payload.internetMessageId === input.inReplyTo)));
}

/** Match an inbound email to exactly one company and route it to the managed or manual workflow. */
export async function handleInboundEmail(input: InboundInput, now = new Date()): Promise<InboundResult> {
  const email = lower(input.contactEmail);
  const enrolled = await findEnrolledByContactEmail(email);
  const withEvents = await Promise.all(enrolled.map(async record => ({ record, events: await findCompanyActivities(record.companyId) })));
  const threadMatched = withEvents.filter(item => threadMatches(item.events, email, input));
  let target = threadMatched.length === 1 ? threadMatched[0] : null;
  if (!target && threadMatched.length === 0 && !input.requireThreadMatch && withEvents.length === 1
    && withEvents[0].events.some(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email)) target = withEvents[0];
  if (threadMatched.length > 1 || (!target && withEvents.length > 1 && !input.requireThreadMatch)) return { status: 'ambiguous', managed: true, reason: 'Sender matches more than one AI-managed company.' };
  if (target) {
    const context = await resolveSalesContext(target.record.companyId);
    try {
      return await withCompanyLease(context.companyId, () => handleManagedInbound(context, { ...input, contactEmail: email,
        providerThreadId: threadMatched.length === 1 ? input.providerThreadId : undefined }, now));
    } catch (error) {
      if (error instanceof AppError && error.code === 'AI_MANAGEMENT_BUSY') return { status: 'busy', managed: true, companyId: context.companyId };
      throw error;
    }
  }
  // Not AI-managed: keep the existing manual workflow (analysis + drafts for human review), but only on an exact thread match.
  if (!input.providerThreadId) return { status: 'unmatched', managed: false };
  const sent = (await allActivityEvents()).filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === email
    && event.payload.providerThreadId === input.providerThreadId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!sent) return { status: 'unmatched', managed: false };
  const context = await resolveSalesContext(sent.companyId);
  const reply = await receiveReply(context, { replyId: input.replyId, contactEmail: email, text: input.text, providerMessageId: input.providerMessageId,
    providerThreadId: input.providerThreadId, internetMessageId: input.internetMessageId }, { isSynthetic: input.isSynthetic });
  return { status: 'processed', managed: false, companyId: context.companyId, reply };
}

async function handleManagedInbound(context: SalesCompanyContext, input: InboundInput, now: Date): Promise<InboundResult> {
  const doneId = 'agent:ai-inbound:' + input.replyId;
  if (await findActivityById(doneId)) return { status: 'duplicate', managed: true, companyId: context.companyId };
  const settings = await getAiManagementSettings();
  const record = await getCompanyManagement(context.companyId, context.companyName);
  const active = record.managementState === 'ACTIVE' && settings.globalOutboundEnabled;
  const reply = await receiveReply(context, { replyId: input.replyId, contactEmail: input.contactEmail, text: input.text,
    providerMessageId: input.providerMessageId, providerThreadId: input.providerThreadId, internetMessageId: input.internetMessageId },
  { autonomous: active, minimumAutoConfidence: settings.minimumAutoConfidence, autoRespondIntents: ROUTINE_INTENTS, isSynthetic: input.isSynthetic });
  const analysis = reply.analysis;
  const buyingIntent = buyingIntentLevel(analysis);
  let decision = decideReplyAction(analysis, { text: input.text, autoResponseEligible: reply.autonomousResponseEligible,
    minimumAutoConfidence: settings.minimumAutoConfidence, now });

  // Feedback loop: map customer-stated requirements to catalogue services and record the opportunity update.
  const knowledge = await businessKnowledgeStore.read();
  const serviceIdsFor = (text: string) => offeringsMentioned(text, knowledge).map(offering => offering.id);
  const knownRequirements = new Set((record.memory?.requirements ?? []).map(item => item.text.toLowerCase()));
  const newRequirements = analysis.requirements.filter(item => !knownRequirements.has(item.text.toLowerCase()));
  const mapped = newRequirements.map(item => ({ text: item.text, serviceIds: serviceIdsFor(item.text) }));
  const matchedServiceIds = [...new Set(mapped.flatMap(item => item.serviceIds))];
  if (newRequirements.length) {
    const eventId = 'opportunity-services:' + input.replyId;
    if (!await findActivityById(eventId)) await appendActivity({ eventId, type: 'OPPORTUNITY_UPDATED', companyId: context.companyId, companyName: context.companyName,
      opportunityId: record.opportunityId, contactId: record.contactId, sourceIds: [reply.received.eventId], isSynthetic: context.isSynthetic ?? false,
      createdAt: new Date(), service: context.service, payload: { change: 'singtel_services_reevaluated', requirements: mapped,
        matchedServiceIds, previousService: context.service ?? null, sourceMessageId: reply.received.eventId, previousHistoryPreserved: true,
        basis: 'Customer-stated requirement text matched to approved catalogue terms; hypotheses are not promoted to facts.' } });
  }
  const score = scoreChange(record, analysis, mapped.filter(item => item.serviceIds.length).length, reply.received.eventId, now);
  if (score) await appendActivity({ eventId: 'opportunity-score:' + input.replyId, type: 'OPPORTUNITY_UPDATED', companyId: context.companyId,
    companyName: context.companyName, opportunityId: record.opportunityId, sourceIds: [reply.received.eventId], isSynthetic: context.isSynthetic ?? false,
    createdAt: new Date(), payload: { change: 'opportunity_score_recalculated', ...score } }).catch(() => undefined);
  if (isNeo4jConnected()) {
    try {
      await linkSalesConversation({ companyId: context.companyId, companyName: context.companyName, contactId: record.contactId, opportunityId: record.opportunityId,
        threadId: String(reply.received.payload.providerThreadId ?? 'thread:' + context.companyId), messageId: reply.received.eventId, direction: 'INBOUND',
        at: new Date(reply.received.createdAt).toISOString(), intent: analysis.intent,
        requirements: mapped.map((item, index) => ({ requirementId: 'opportunity-update:' + input.replyId + ':' + index, text: item.text, serviceIds: item.serviceIds })) });
    } catch (error) { logger.warn('Could not sync conversation to Neo4j', { companyId: context.companyId, error: error instanceof Error ? error.message : 'unknown' }); }
  }

  // Act on the decision. Autonomous replies are only attempted while the company is ACTIVE and outbound is enabled.
  let autoSent: ISalesActivity | null = null;
  let autoFailure: string | null = null;
  if (decision.action === 'AUTO_RESPOND' && active && reply.responseDraft) {
    try {
      autoSent = await sendAutonomousEmail(context, String(reply.responseDraft.payload.draftId), { leaseHeld: true, minimumConfidence: settings.minimumAutoConfidence, proactive: false, now });
    } catch (error) {
      autoFailure = error instanceof Error ? error.message : 'Autonomous reply failed.';
      decision = { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'HIGH', reason: 'Autonomous reply was not sent: ' + autoFailure };
    }
  } else if (decision.action === 'AUTO_RESPOND') {
    decision = { action: 'ESCALATE', type: 'HUMAN_INTERVENTION', priority: 'MEDIUM', reason: 'Automation is not active, so the reply needs a person.' };
  }

  const events = await findCompanyActivities(context.companyId);
  const inboundCount = events.filter(event => event.type === 'REPLY_RECEIVED').length;
  const outboundCount = events.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED').length;
  const receivedAt = new Date(reply.received.createdAt);
  // The reply event is written after the poll started, so "handled" must not precede it.
  const handledAt = new Date(Math.max(+now, +receivedAt));
  const requirementTexts = analysis.requirements.map(item => item.text);
  const enrolledNotActive = record.managementState !== 'ACTIVE';

  const saved = await updateCompany(context.companyId, context.companyName, current => {
    let memory = updateMemory(current, analysis, reply.received, serviceIdsFor, decision, now, inboundCount, outboundCount);
    let next: AiManagementCompanyRecord = { ...current, lastInboundAt: receivedAt, lastMessageAt: autoSent ? new Date(autoSent.createdAt) : receivedAt,
      opportunityScore: score ? score.score : current.opportunityScore, scoreHistory: score ? [...(current.scoreHistory ?? []), score] : current.scoreHistory };
    if (decision.action === 'SUPPRESS') {
      return { ...transition(next, { management: current.managementState === 'OFF' ? 'OFF' : 'COMPLETED', communication: 'UNSUBSCRIBED' }, SYSTEM_ACTOR, 'Customer unsubscribed; all outreach stopped.', now),
        memory, completedAt: now, nextActionAt: null, nextActionKind: null, nextActionNote: null, humanAttention: false };
    }
    if (decision.action === 'CLOSE_NOT_INTERESTED' && !enrolledNotActive) {
      return { ...transition(next, { management: 'COMPLETED', communication: 'NOT_INTERESTED' }, SYSTEM_ACTOR, 'Customer declined; sales outreach stopped.', now),
        memory, completedAt: now, nextActionAt: null, nextActionKind: null, nextActionNote: null };
    }
    if (enrolledNotActive && current.managementState !== 'COMPLETED' && current.managementState !== 'OFF') {
      // Paused / escalated / handed over: record the reply, never act autonomously.
      return { ...transition(next, { communication: 'CUSTOMER_RESPONDED' }, SYSTEM_ACTOR, 'Customer replied while automation was ' + current.managementState + '.', now), memory };
    }
    if (current.managementState === 'COMPLETED' && analysis.intent !== 'NOT_INTERESTED') {
      return { ...transition(next, { management: 'HUMAN_ATTENTION_REQUIRED', communication: 'CUSTOMER_RESPONDED' }, SYSTEM_ACTOR,
        'A new reply arrived after the conversation was closed; a salesperson must review it.', now), memory,
        humanAttention: true, attentionReason: 'New customer reply after closure: ' + analysis.requestedNextAction,
        completedAt: undefined, lastHandledInboundAt: handledAt, nextActionAt: null, nextActionKind: null, nextActionNote: null };
    }
    if (current.managementState === 'COMPLETED' || current.managementState === 'OFF') {
      return { ...next, memory };
    }
    if (decision.action === 'RESCHEDULE') {
      return { ...transition(next, { communication: 'FOLLOW_UP_SCHEDULED' }, SYSTEM_ACTOR, decision.reason, now), memory, lastHandledInboundAt: handledAt,
        nextActionAt: decision.at, nextActionKind: decision.kind, nextActionNote: decision.reason,
        followupAttempts: decision.kind === 'CUSTOMER_REQUESTED_FOLLOWUP' ? 0 : current.followupAttempts };
    }
    if (decision.action === 'AUTO_RESPOND' && autoSent) {
      const sentAt = new Date(autoSent.createdAt);
      const step = nextNoReplyStep(settings, 0, sentAt);
      memory = { ...memory, answers: addItems(memory.answers, analysis.questionsAsked.length ? analysis.questionsAsked.map(question => 'Answered: ' + question) : ['Answered customer question'], autoSent.eventId, now.toISOString()) };
      next = transition(next, { communication: 'CUSTOMER_RESPONDED' }, SYSTEM_ACTOR, 'Customer asked a routine question.', now);
      return { ...transition(next, { communication: step.kind === 'NO_REPLY_FOLLOWUP' ? 'FOLLOW_UP_SCHEDULED' : 'WAITING_FOR_REPLY' }, SYSTEM_ACTOR,
        'Answered autonomously from approved information.', now), memory, lastHandledInboundAt: handledAt, lastOutboundAt: sentAt,
      followupAttempts: 0, nextActionAt: step.at, nextActionKind: step.kind, nextActionNote: 'No reply to the answer' };
    }
    // ESCALATE: pause sales progression for this company until a salesperson reviews it.
    const reason = decision.action === 'ESCALATE' ? decision.reason : 'Needs review.';
    return { ...transition(next, { management: 'HUMAN_ATTENTION_REQUIRED', communication: 'CUSTOMER_RESPONDED' }, SYSTEM_ACTOR, reason, now),
      memory, humanAttention: true, attentionReason: reason, nextActionAt: null, nextActionKind: null, nextActionNote: null };
  }, context.isSynthetic);

  if (decision.action === 'SUPPRESS' || decision.action === 'CLOSE_NOT_INTERESTED' || decision.action === 'ESCALATE') {
    await cancelOpenSchedules(context, decision.action === 'SUPPRESS' ? 'opt_out' : decision.action === 'CLOSE_NOT_INTERESTED' ? 'customer_declined' : 'human_attention');
  }
  if (decision.action === 'RESCHEDULE' && saved.nextActionAt && saved.managementState === 'ACTIVE') {
    await logSchedule(context, saved, decision.kind, decision.at, decision.reason);
  }
  if (autoSent) await syncOutbound(context, saved, autoSent);

  // Notifications: exception-based. Routine handling produces at most an informational item.
  const common = { eventId: reply.received.eventId, latestMessage: input.text, intent: analysis.intent, buyingIntent, sentiment: analysis.sentiment,
    buyingSignals: analysis.buyingSignals, requirements: requirementTexts };
  const label = analysis.intent.replace(/_/g, ' ').toLowerCase();
  if (decision.action === 'SUPPRESS') {
    await notify(saved, { ...common, key: input.replyId, type: 'UNSUBSCRIBED', priority: 'LOW', requiresAction: false,
      title: saved.companyName + ': contact unsubscribed', summary: 'The contact asked not to be emailed again. They are suppressed globally and all scheduled follow-ups were cancelled.' });
  } else if (enrolledNotActive) {
    const escalation = decision.action === 'ESCALATE' ? decision : null;
    await notify(saved, { ...common, key: input.replyId, type: 'REPLY_DURING_HANDOVER', priority: escalation?.priority === 'CRITICAL' ? 'CRITICAL' : buyingIntent === 'HIGH' ? 'HIGH' : 'MEDIUM',
      requiresAction: true, title: saved.companyName + ' replied (' + label + ')', reason: escalation?.reason ?? 'Reply received while AI Management is ' + record.managementState.toLowerCase().replace(/_/g, ' ') + '.',
      summary: 'Automation did not act because the company is ' + record.managementState.toLowerCase().replace(/_/g, ' ') + '. ' + analysis.requestedNextAction,
      recommendation: analysis.requestedNextAction });
  } else if (decision.action === 'ESCALATE') {
    await notify(saved, { ...common, key: input.replyId, type: decision.type, priority: decision.priority, requiresAction: true,
      title: (({ POSITIVE_REPLY: 'Positive reply from ', MEETING_REQUEST: 'Meeting requested by ', PROPOSAL_REQUEST: 'Proposal requested by ',
        PRICING_REQUEST: 'Pricing requested by ' } as Record<string, string>)[decision.type] ?? 'Human attention needed: ') + saved.companyName,
      summary: decision.reason + (requirementTexts.length ? ' Requirements: ' + requirementTexts.join('; ') + '.' : ''), reason: decision.reason,
      recommendation: analysis.requestedNextAction + ' Automation is paused for this company until you resume it or take over.' });
  } else if (decision.action === 'RESCHEDULE' && decision.notify) {
    await notify(saved, { ...common, key: input.replyId, type: decision.notify, priority: 'LOW', requiresAction: false,
      title: saved.companyName + ' asked to be contacted later', summary: decision.reason + ' Next contact: ' + decision.at.toISOString().slice(0, 10) + '.' });
  } else if (decision.action === 'CLOSE_NOT_INTERESTED') {
    await notify(saved, { ...common, key: input.replyId, type: 'NOT_INTERESTED', priority: 'LOW', requiresAction: false,
      title: saved.companyName + ' is not interested', summary: 'The customer declined. Sales outreach has stopped; the conversation history is retained.' });
  }
  if (newRequirements.length && decision.action !== 'ESCALATE') {
    await notify(saved, { ...common, key: 'req:' + input.replyId, type: 'NEW_REQUIREMENTS', priority: 'LOW', requiresAction: false,
      title: 'New requirements from ' + saved.companyName, summary: newRequirements.map(item => item.text).join('; ')
        + (matchedServiceIds.length ? ' — matched services: ' + matchedServiceIds.join(', ') : '') });
  }
  await agentLog(context, doneId, true, { decision: decision.action, reason: 'reason' in decision ? decision.reason : null, buyingIntent,
    sentiment: analysis.sentiment, intent: analysis.intent, autoReplyEventId: autoSent?.eventId ?? null, autoFailure,
    managementStateBefore: record.managementState, managementStateAfter: saved.managementState }, { intent: analysis.intent, confidence: analysis.confidence,
    sourceIds: [reply.received.eventId] });
  return { status: 'processed', managed: true, companyId: context.companyId, decision: decision.action, reason: 'reason' in decision ? decision.reason : undefined, buyingIntent, reply };
}

// ---------------------------------------------------------------------------------------------------------------
// Inbox monitoring and the background worker
// ---------------------------------------------------------------------------------------------------------------

export async function pollInbox(now = new Date(), force = false) {
  const settings = await getAiManagementSettings();
  const last = settings.lastEmailPollAt ? new Date(settings.lastEmailPollAt) : null;
  if (!force && last && +now - +last < settings.inboxPollIntervalMinutes * 60_000) return { status: 'skipped' as const, reason: 'Not due' };
  const owner = await acquireAiManagementLease('ai-inbox-poll', 2 * 60_000);
  if (!owner) return { status: 'skipped' as const, reason: 'Another worker is polling the inbox.' };
  try {
    const since = last ? new Date(+last - 10 * 60_000) : new Date(+now - DAY);
    const messages = (await getEmailProvider().listInbound(since)).sort((a, b) => +new Date(a.receivedAt) - +new Date(b.receivedAt));
    const results: (InboundResult & { providerMessageId: string })[] = [];
    const deferred: InboundEmail[] = [];
    for (const message of messages) {
      try {
        const result = await handleInboundEmail({ replyId: message.provider + ':' + message.providerMessageId, contactEmail: message.from, text: message.text,
          providerMessageId: message.providerMessageId, providerThreadId: message.providerThreadId, internetMessageId: message.internetMessageId,
          inReplyTo: message.inReplyTo, subject: message.subject, isSynthetic: message.isSynthetic }, now);
        if (result.status === 'busy') deferred.push(message);
        // Unmatched messages are not stored: they are not part of any sales conversation.
        results.push({ ...result, reply: undefined, providerMessageId: message.providerMessageId });
      } catch (error) {
        deferred.push(message);
        logger.error('Inbound email could not be processed', { providerMessageId: message.providerMessageId, error: error instanceof Error ? error.message : 'unknown' });
      }
    }
    for (const message of deferred) if (message.isSynthetic) enqueueSyntheticInbound(message);
    const cursor = deferred.length ? new Date(Math.min(...deferred.map(message => +new Date(message.receivedAt))) - 1000) : now;
    await patchOperationalSettings({ lastEmailPollAt: cursor });
    return { status: 'polled' as const, received: messages.length, processed: results.filter(item => item.status === 'processed').length,
      unmatched: results.filter(item => item.status === 'unmatched').length, deferred: deferred.length, results };
  } finally {
    await releaseAiManagementLease('ai-inbox-poll', owner);
  }
}

let workerRunning = false;
export async function runAiManagementWorkerTick(now = new Date(), options: { forcePoll?: boolean } = {}) {
  if (workerRunning) return { status: 'skipped' as const, reason: 'Worker tick already running in this process.' };
  workerRunning = true;
  try {
    let poll: unknown;
    try { poll = await pollInbox(now, options.forcePoll); }
    catch (error) { poll = { status: 'failed', error: error instanceof Error ? error.message : 'unknown' }; logger.error('Inbox polling failed', { error: (poll as { error: string }).error }); }
    const due = await listDueCompanies(now);
    const processed: StepResult[] = [];
    for (const record of due) {
      try { processed.push(await processCompany(record.companyId, now)); }
      catch (error) { processed.push({ companyId: record.companyId, status: 'failed', reason: error instanceof Error ? error.message : 'unknown' }); }
    }
    return { status: 'ran' as const, poll, processed };
  } finally { workerRunning = false; }
}

/** Preview only: queue a clearly labelled synthetic reply from the company's verified contact, then run the normal inbox path. */
export async function simulateCustomerReply(companyId: string, text: string, now = new Date()) {
  if (env.SALES_EMAIL_PROVIDER !== 'mock') throw new AppError('Reply simulation is only available with the synthetic preview provider.', 403, 'SIMULATION_DISABLED');
  const record = await requireRecord(companyId);
  if (!record.contactEmail) throw new AppError('This company has no activated contact.', 409, 'CONTACT_REQUIRED');
  const events = await findCompanyActivities(companyId);
  const last = [...events].reverse().find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && lower(event.contactEmail) === lower(record.contactEmail));
  if (!last) throw new AppError('No email has been sent to this contact yet, so there is nothing to reply to.', 409, 'NO_THREAD');
  const message = enqueueSyntheticInbound({ providerMessageId: 'synthetic-' + randomUUID(), providerThreadId: String(last.payload.providerThreadId ?? ''),
    internetMessageId: '<synthetic-' + randomUUID() + '@synthetic.invalid>', inReplyTo: String(last.payload.internetMessageId ?? ''),
    from: record.contactEmail, subject: 'Re: ' + (last.subject ?? ''), text, receivedAt: now.toISOString() });
  const poll = await pollInbox(now, true);
  const result = poll.status === 'polled' ? poll.results.find(item => item.providerMessageId === message.providerMessageId) : undefined;
  return { synthetic: true, message, result: result ?? null, poll: { ...poll, results: undefined } };
}

