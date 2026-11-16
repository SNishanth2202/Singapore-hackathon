import { randomUUID, createHash } from 'node:crypto';
import { env } from '../config/env';
import { businessKnowledgeStore } from '../business/store';
import { AppError } from '../utils/errors';
import { acquireAiManagementLease, getAiManagementSettings, getCompanyManagement, releaseAiManagementLease } from '../ai-management/store';
import { INTERVENTION_REASONS, INTERVENTION_STATUSES, ISalesActivity, REPLY_INTENTS, SalesEventType } from '../models/SalesActivity';
import { appendActivity, claimActivity, findActivityById, findCompanyActivities, findEmailSuppression, allActivityEvents } from '../salesStore';
import { logger } from '../utils/logger';
import { buildCompanyBrief } from './agents/company-context.agent';
import { generatePersonalizedOutreach } from './agents/personalized-outreach.agent';
import { understandReply, classifyReply, ReplyAnalysis } from './agents/reply-understanding.agent';
import { generateContextualResponse } from './agents/contextual-response.agent';
import { assessFollowupEligibility, generateFollowupCopy } from './agents/follow-up.agent';
import { getEmailProvider } from './email-provider';
import { isNeo4jConnected } from '../integrations/neo4j/connection';
import { linkSalesRequirement } from '../integrations/neo4j/graphService';
import { outboundSafetyViolations, UNSUBSCRIBE_FOOTER } from '../ai-management/policy';
import { plainEmailBody } from './email-format';

export interface SalesCompanyContext {
  companyId: string; companyName: string; researchId?: string; country?: string; industry?: string;
  service?: string; website?: string | null; description?: string;
  sourceIds?: string[]; evidence?: { title: string; url: string; sourceId: string; publishedAt: string | null; excerpt?: string; kind?: string; verification?: string }[];
  isSynthetic?: boolean;
}

function makeEvent(context: SalesCompanyContext, type: SalesEventType, extra: Partial<ISalesActivity> & { eventId?: string } = {}): ISalesActivity {
  const { eventId = `${context.companyId}:${type}:${randomUUID()}`, ...fields } = extra;
  if (fields.body && ['EMAIL_DRAFTED', 'EMAIL_APPROVED', 'EMAIL_AUTONOMOUS_AUTHORIZED', 'EMAIL_PROVIDER_ACCEPTED'].includes(type)) fields.body = plainEmailBody(fields.body);
  return { eventId, type, companyId: context.companyId, companyName: context.companyName,
    researchId: context.researchId, country: context.country, industry: context.industry, service: context.service,
    sourceIds: context.sourceIds ?? [], payload: {}, isSynthetic: context.isSynthetic ?? false,
    createdAt: new Date(), ...fields };
}

async function log(context: SalesCompanyContext, type: SalesEventType, extra: Partial<ISalesActivity> & { eventId?: string } = {}) {
  return appendActivity(makeEvent(context, type, extra));
}

export interface DiscoveryCandidate { opportunityId: string; service: string; offeringId?: string; sourceIds?: string[]; reason?: string; question?: string }
export async function recordDiscoveryHandoff(input: SalesCompanyContext & { candidates: DiscoveryCandidate[] }) {
  const qualified = await Promise.all(input.candidates.map(({ opportunityId, service, offeringId, sourceIds, reason, question }) => log({ ...input, service }, 'QUALIFIED', {
    eventId: `qualified:${input.researchId}:${opportunityId}`, opportunityId,
    service, sourceIds: sourceIds ?? input.sourceIds ?? [],
    payload: { stage: 'evidence_qualified', qualification: 'service hypothesis supported; customer need unconfirmed',
      ...(offeringId ? { offeringId } : {}), ...(reason ? { reason } : {}), ...(question ? { discoveryQuestion: question } : {}) },
  })));
  await log(input, 'AGENT_EXECUTION', { eventId: `agent:discovery:${input.researchId}`, agent: 'Discovery & Qualification', success: true, executionMs: 0,
    payload: { qualifiedCandidates: qualified.length } });
  return { qualified };
}

export async function recordDiscoverySnapshot(input: SalesCompanyContext) {
  return log(input, 'DISCOVERED', { eventId: `discovery:${input.researchId}`,
    payload: { sourceCount: input.sourceIds?.length ?? 0, identity: input.companyId.startsWith('entity:public-name-') ? 'Public reported name; identity unverified' : input.companyId.startsWith('entity:LEI-') ? 'GLEIF legal entity ID' : 'Wikidata entity ID', duplicateKey: input.companyId } });
}

export async function getWorkflow(companyId: string) {
  const events = await findCompanyActivities(companyId);
  const localOptOuts = events.filter(e => e.type === 'REPLY_CLASSIFIED' && e.intent === 'UNSUBSCRIBE').map(e => (e.contactEmail ?? '').toLowerCase());
  const contactEmails = events.filter(e => e.type === 'CONTACT_IDENTIFIED' && e.contactEmail).map(e => e.contactEmail!.toLowerCase());
  const globalOptOuts = await Promise.all(contactEmails.map(async email => await findEmailSuppression(email) ? email : null));
  const optOuts = [...new Set([...localOptOuts, ...globalOptOuts.filter((email): email is string => !!email)])];
  return { companyId, events: events.map(event => event.body && event.type.startsWith('EMAIL_') ? { ...event, body: plainEmailBody(event.body) } : event),
    optedOutEmails: [...new Set(optOuts)], isSynthetic: events.some(e => e.isSynthetic) };
}

function needSelected(events: ISalesActivity[]) {
  if (!events.some(event => event.type === 'SELECTED')) throw new AppError('Select this company before continuing the sales workflow.', 409, 'COMPANY_NOT_SELECTED');
}
function newest(events: ISalesActivity[], type: SalesEventType) { return [...events].reverse().find(event => event.type === type); }

export async function selectCompany(context: SalesCompanyContext) {
  const events = await findCompanyActivities(context.companyId);
  if (!events.some(event => event.type === 'DISCOVERED')) throw new AppError('This company has not entered the sales workflow through Discovery.', 404, 'DISCOVERY_NOT_FOUND');
  const selected = events.find(event => event.type === 'SELECTED')
    ?? await log(context, 'SELECTED', { eventId: `selected:${context.companyId}`, payload: { selectedAt: new Date().toISOString() } });
  const briefId = `context:selected:${context.companyId}`;
  const savedBrief = await findActivityById(briefId);
  const brief = savedBrief?.payload.brief as Awaited<ReturnType<typeof buildCompanyBrief>> ?? await buildCompanyBrief(context, [...events, selected]);
  if (!savedBrief) {
    await log(context, 'COMPANY_CONTEXT_UPDATED', { eventId: briefId, agent: 'Company Context Intelligence', success: true,
      sourceIds: brief.evidenceSources.map(source => source.sourceId), confidence: brief.confidence, payload: { brief, eventId: selected.eventId } });
    await log(context, 'AGENT_EXECUTION', { eventId: `agent:company-context:selected:${context.companyId}`, agent: 'Company Context Intelligence',
      success: true, executionMs: 0, confidence: brief.confidence, sourceIds: brief.evidenceSources.map(source => source.sourceId), payload: { briefEventId: briefId } });
  }
  return { selection: selected, companyBrief: brief };
}

export async function identifyContact(context: SalesCompanyContext, contact: {
  name: string; email: string; role: string; source: string;
  outreachBasis: 'RECORDED_CONSENT' | 'EXISTING_BUSINESS_RELATIONSHIP' | 'ASSESSED_LEGITIMATE_INTEREST' | 'INBOUND_REQUEST';
}) {
  const events = await findCompanyActivities(context.companyId); needSelected(events);
  const email = contact.email.trim().toLowerCase();
  if (await findEmailSuppression(email)) throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  if (events.some(event => event.type === 'REPLY_CLASSIFIED' && event.intent === 'UNSUBSCRIBE' && event.contactEmail?.toLowerCase() === email)) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  const contactId = `contact-${createHash('sha256').update(email).digest('hex').slice(0, 12)}`;
  const latest = [...events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && event.contactEmail?.toLowerCase() === email);
  const role = contact.role.trim();
  if (latest && latest.contactName === contact.name.trim() && latest.payload.role === role
      && latest.payload.outreachBasis === contact.outreachBasis && latest.payload.source === contact.source.trim()) return latest;
  return log(context, 'CONTACT_IDENTIFIED', { eventId: latest ? `contact-update:${context.companyId}:${email}:${randomUUID()}` : `contact:${context.companyId}:${email}`,
    contactId, contactName: contact.name.trim(), contactEmail: email,
    payload: { role, source: contact.source.trim(), outreachBasis: contact.outreachBasis, reviewedBySalesperson: true, origin: context.isSynthetic ? 'synthetic_demo' : 'user_supplied' } });
}

export async function draftEmail(context: SalesCompanyContext, input?: { contactId?: string; subject?: string; body?: string; kind?: 'initial' | 'reply' | 'followup'; inReplyTo?: string; draftId?: string; aiManaged?: boolean }) {
  if (input?.draftId) {
    const existing = await findActivityById('draft:' + input.draftId);
    if (existing) return existing; // deterministic AI drafts are generated once per action
  }
  const events = await findCompanyActivities(context.companyId); needSelected(events);
  const contact = input?.contactId ? [...events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && event.contactId === input.contactId) : newest(events, 'CONTACT_IDENTIFIED');
  if (!contact?.contactEmail) throw new AppError('Identify a decision maker before drafting an email.', 409, 'CONTACT_REQUIRED');
  if (!context.isSynthetic && !contact.payload.outreachBasis) throw new AppError('Record the reviewed outreach basis and contact source before drafting.', 409, 'OUTREACH_BASIS_REQUIRED');
  if (await findEmailSuppression(contact.contactEmail)) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  const kind = input?.kind ?? 'initial';
  const sentBefore = kind === 'initial' && events.some(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === contact.contactEmail!.toLowerCase());
  if (sentBefore) throw new AppError('This contact already has an accepted first-touch email. Duplicate outreach was prevented.', 409, 'DUPLICATE_OUTREACH');
  const knowledge = await businessKnowledgeStore.read();
  const brief = await buildCompanyBrief(context, events);
  const role = String(contact.payload.role ?? 'Decision maker');
  const generated = await generatePersonalizedOutreach(context, brief, { name: contact.contactName ?? 'there', role }, knowledge);
  const draftId = input?.draftId ?? randomUUID();
  const aiManaged = input?.aiManaged === true;
  const subject = input?.subject?.trim() || generated.subject;
  const body = input?.body?.trim() || generated.body;
  const event = await log(context, 'EMAIL_DRAFTED', { eventId: `draft:${draftId}`, contactId: contact.contactId, contactName: contact.contactName,
    contactEmail: contact.contactEmail, subject, body, sourceIds: generated.usedSourceIds, opportunityId: events.find(item => item.type === 'QUALIFIED')?.opportunityId,
    payload: { draftId, kind, editable: !aiManaged, requiresApproval: !aiManaged, aiManaged, rationale: generated.rationale, serviceIds: generated.serviceIds,
      callToAction: generated.callToAction, confidence: generated.confidence, generatedBy: generated.generatedBy, companyBrief: brief, inReplyTo: input?.inReplyTo } });
  await log(context, 'AGENT_EXECUTION', { eventId: `agent:outreach:${draftId}`, agent: kind === 'initial' ? 'Personalised Outreach' : kind === 'reply' ? 'Contextual Response' : 'Intelligent Follow-up',
    success: true, executionMs: 0, confidence: generated.confidence, sourceIds: generated.usedSourceIds, payload: { draftId, requiresHumanApproval: !aiManaged, aiManaged, generatedBy: generated.generatedBy } });
  return event;
}

export async function approveEmail(context: SalesCompanyContext, draftId: string, input?: { editedSubject?: string; editedBody?: string; approvedBy?: string }) {
  const draft = await findActivityById(`draft:${draftId}`);
  if (!draft || draft.type !== 'EMAIL_DRAFTED' || draft.companyId !== context.companyId) throw new AppError('Email draft was not found for this company.', 404, 'DRAFT_NOT_FOUND');
  const events = await findCompanyActivities(context.companyId);
  if (await findEmailSuppression(draft.contactEmail ?? '')) throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  if (events.some(event => event.type === 'EMAIL_REJECTED' && event.payload.draftId === draftId)) throw new AppError('This email draft was rejected and cannot be approved.', 409, 'DRAFT_REJECTED');
  const prior = await findActivityById(`approval:${draftId}`);
  if (prior) return prior;
  return log(context, 'EMAIL_APPROVED', { eventId: `approval:${draftId}`, contactId: draft.contactId, contactName: draft.contactName,
    contactEmail: draft.contactEmail, subject: input?.editedSubject?.trim() || draft.subject, body: input?.editedBody?.trim() || draft.body,
    opportunityId: draft.opportunityId, sourceIds: draft.sourceIds,
    payload: { ...draft.payload, draftId, approvedBy: input?.approvedBy?.trim() || 'local_sales_user', humanApprovedAt: new Date().toISOString() } });
}

export async function rejectEmail(context: SalesCompanyContext, draftId: string, reason?: string) {
  const draft = await findActivityById(`draft:${draftId}`);
  if (!draft || draft.companyId !== context.companyId) throw new AppError('Email draft was not found for this company.', 404, 'DRAFT_NOT_FOUND');
  if (await findActivityById(`approval:${draftId}`)) throw new AppError('An approved email cannot be rejected; create a new draft instead.', 409, 'DRAFT_ALREADY_APPROVED');
  return log(context, 'EMAIL_REJECTED', { eventId: `rejected:${draftId}`, contactId: draft.contactId, contactName: draft.contactName,
    contactEmail: draft.contactEmail, subject: draft.subject, sourceIds: draft.sourceIds, payload: { draftId, reason: reason?.trim() || null } });
}

/** Single delivery seam; every provider acceptance is recorded separately from inbox delivery. */
export async function sendApprovedEmail(context: SalesCompanyContext, draftId: string) {
  if (context.isSynthetic && env.SALES_EMAIL_PROVIDER !== 'mock') throw new AppError('Illustrative accounts can only use the test email provider.', 409, 'SAMPLE_OUTREACH_DISABLED');
  const id = `provider-accepted:${draftId}`;
  const existing = await findActivityById(id); if (existing) return existing;
  const humanApproval = await findActivityById('approval:' + draftId);
  const autonomousAuthorization = await findActivityById('autonomous-authorization:' + draftId);
  const approval = humanApproval ?? autonomousAuthorization;
  const autonomous = !humanApproval && !!autonomousAuthorization;
  if (!approval || approval.companyId !== context.companyId) throw new AppError('A human must approve this email before sending.', 409, 'APPROVAL_REQUIRED');
  if (autonomous) {
    const management = await getCompanyManagement(context.companyId, context.companyName);
    const settings = await getAiManagementSettings();
    if (management.managementState !== 'ACTIVE' || !settings.globalOutboundEnabled) {
      throw new AppError('Autonomous sending is paused for this company or globally.', 409, 'AUTONOMOUS_SEND_PAUSED');
    }
  }
  const events = await findCompanyActivities(context.companyId);
  if (await findEmailSuppression(approval.contactEmail ?? '')) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  if (env.NODE_ENV === 'production' && !(env.HOSTED_PREVIEW && env.STORAGE_MODE === 'memory' && env.LOCAL_DEMO_MODE) && env.SALES_EMAIL_PROVIDER === 'mock') {
    throw new AppError('Configure a real email provider before sending from production.', 503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }
  if (approval.payload.kind === 'initial' && events.some(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === approval.contactEmail?.toLowerCase())) {
    throw new AppError('An initial email was already accepted for this contact.', 409, 'DUPLICATE_OUTREACH');
  }
  // Autonomous follow-ups are checked by the AI Management orchestrator under the company lease, using the configured policy.
  if (approval.payload.kind === 'followup' && !autonomous) {
    const eligibility = assessFollowupEligibility(events, approval.contactEmail ?? '', new Date(), env.SALES_MAX_FOLLOWUPS);
    if (!eligibility.eligible) throw new AppError('Follow-up is no longer eligible: ' + eligibility.reason, 409, 'FOLLOWUP_BLOCKED');
  }
  let ownedAttempt: ISalesActivity | undefined;
  try {
    const priorAttempt = [...events].reverse().find(event => event.type === 'EMAIL_SENDING' && event.payload.draftId === draftId);
    if (priorAttempt) {
      const priorFailure = events.find(event => event.type === 'EMAIL_FAILED' && event.payload.attemptEventId === priorAttempt.eventId);
      if (!priorFailure) throw new AppError('A previous send attempt has no final provider result. Reconcile its status before retrying to avoid duplicate delivery.', 409, 'EMAIL_SEND_RECONCILIATION_REQUIRED');
      if (priorFailure.payload.retryable !== true) throw new AppError('The previous send result is ambiguous or unsafe to retry. Reconcile with the provider first.', 409, 'EMAIL_SEND_RETRY_BLOCKED');
    }
    const attemptNumber = events.filter(event => event.type === 'EMAIL_SENDING' && event.payload.draftId === draftId).length + 1;
    const attemptEvent = makeEvent(context, 'EMAIL_SENDING', { eventId: `email-sending:${draftId}:${attemptNumber}`, contactId: approval.contactId,
      contactEmail: approval.contactEmail, subject: approval.subject, payload: { draftId, attempt: attemptNumber, authorizationEventId: approval.eventId, authorizationMode: autonomous ? 'AUTONOMOUS' : 'HUMAN_APPROVED' } });
    const claim = await claimActivity(attemptEvent);
    if (!claim.claimed) throw new AppError('Another worker is processing this approved email. Refresh the conversation before retrying.', 409, 'EMAIL_SEND_IN_PROGRESS');
    ownedAttempt = attemptEvent;
    const providerResult = await getEmailProvider().send({ to: approval.contactEmail ?? '', subject: approval.subject ?? '',
      body: plainEmailBody(approval.body ?? ''), threadId: typeof approval.payload.providerThreadId === 'string' ? approval.payload.providerThreadId : undefined,
      providerMessageId: typeof approval.payload.inboundProviderMessageId === 'string' ? approval.payload.inboundProviderMessageId
        : approval.payload.kind === 'followup' && typeof approval.payload.inReplyTo === 'string' ? approval.payload.inReplyTo : undefined,
      inReplyTo: typeof approval.payload.internetMessageId === 'string' ? approval.payload.internetMessageId
        : typeof approval.payload.inReplyTo === 'string' ? approval.payload.inReplyTo : undefined,
      idempotencyKey: draftId });
    const accepted = await log(context, 'EMAIL_PROVIDER_ACCEPTED', { eventId: id, contactId: approval.contactId, contactName: approval.contactName,
      contactEmail: approval.contactEmail, subject: approval.subject, body: approval.body, provider: providerResult.provider, providerMessageId: providerResult.messageId,
      opportunityId: approval.opportunityId, sourceIds: approval.sourceIds, payload: { ...approval.payload, draftId, provider: providerResult.provider,
        providerThreadId: providerResult.threadId ?? approval.payload.providerThreadId, internetMessageId: providerResult.internetMessageId,
        acceptedAt: providerResult.acceptedAt, inboxDelivery: 'unknown' } });
    await log(context, 'AGENT_EXECUTION', { eventId: `agent:email-send:${draftId}`, agent: 'Controlled Email Delivery', success: true, executionMs: 0,
      payload: { accepted: true, provider: providerResult.provider, deliveryConfirmed: false } });
    const acceptedEvents = [...events, accepted];
    const followupCount = acceptedEvents.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === approval.contactEmail?.toLowerCase()
      && event.payload.kind === 'followup').length;
    if (!autonomous && ((approval.payload.kind === 'initial' && env.SALES_MAX_FOLLOWUPS > 0)
      || (approval.payload.kind === 'followup' && followupCount < env.SALES_MAX_FOLLOWUPS))) {
      const scheduledAt = new Date(Date.now() + env.SALES_FOLLOWUP_DELAY_DAYS * 86400000).toISOString();
      if (!await findActivityById(`followup-scheduled:${draftId}`)) await log(context, 'FOLLOWUP_SCHEDULED', { eventId: `followup-scheduled:${draftId}`, contactId: approval.contactId, contactName: approval.contactName,
        contactEmail: approval.contactEmail, opportunityId: approval.opportunityId, payload: { scheduledAt, kind: 'no_reply', basedOnMessageId: providerResult.messageId } });
    }
    return accepted;
  } catch (error) {
    if (ownedAttempt && !await findActivityById(id)) await log(context, 'EMAIL_FAILED', { eventId: `provider-failed:${draftId}:${ownedAttempt.payload.attempt}`, contactId: approval.contactId,
      contactEmail: approval.contactEmail, success: false, payload: { draftId, attemptEventId: ownedAttempt.eventId,
        retryable: error instanceof AppError && ['EMAIL_AUTH_FAILED', 'EMAIL_PROVIDER_NOT_CONFIGURED'].includes(error.code),
        failureCode: error instanceof AppError ? error.code : 'PROVIDER_RESULT_UNKNOWN' } });
    throw error;
  }
}

export interface AutonomousSendOptions {
  /** The caller already holds the company lease (the AI Management orchestrator). */
  leaseHeld?: boolean;
  /** Confidence threshold for this kind of message; defaults to the reply threshold. */
  minimumConfidence?: number;
  /** Proactive messages (outreach and follow-ups) are subject to frequency limits; answers to customer questions are not. */
  proactive?: boolean;
  now?: Date;
}

/** Every autonomous message passes these checks immediately before the provider call, regardless of how it was generated. */
async function sendAutonomousUnderLease(context: SalesCompanyContext, draftId: string, options: AutonomousSendOptions) {
  const now = options.now ?? new Date();
  const management = await getCompanyManagement(context.companyId, context.companyName);
  const settings = await getAiManagementSettings();
  if (management.managementState !== 'ACTIVE' || !settings.globalOutboundEnabled) {
    throw new AppError('Autonomous sending is paused for this company or globally.', 409, 'AUTONOMOUS_SEND_PAUSED');
  }
  const draft = await findActivityById('draft:' + draftId);
  if (!draft || draft.type !== 'EMAIL_DRAFTED' || draft.companyId !== context.companyId || !draft.contactEmail) {
    throw new AppError('AI-managed email draft was not found for this company.', 404, 'DRAFT_NOT_FOUND');
  }
  if (management.contactEmail?.toLowerCase() !== draft.contactEmail.toLowerCase()) {
    throw new AppError('The draft contact no longer matches the activated contact.', 409, 'AUTONOMOUS_CONTACT_CHANGED');
  }
  const threshold = options.minimumConfidence ?? settings.minimumAutoConfidence;
  if (Number(draft.payload.confidence ?? 0) < threshold) {
    throw new AppError('Draft confidence is below the configured autonomous-send threshold.', 409, 'AUTONOMOUS_CONFIDENCE_LOW');
  }
  if ((context.isSynthetic || env.HOSTED_PREVIEW) && env.SALES_EMAIL_PROVIDER !== 'mock') {
    throw new AppError('Synthetic and hosted preview workflows cannot send real email.', 403, 'PREVIEW_REAL_EMAIL_BLOCKED');
  }
  if (await findEmailSuppression(draft.contactEmail)) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  const violations = outboundSafetyViolations({ subject: draft.subject ?? '', body: draft.body ?? '' }, [draft.contactEmail]);
  if (violations.length) throw Object.assign(new AppError('Autonomous message blocked by safety policy: ' + violations.join(' '), 409, 'OUTBOUND_SAFETY_BLOCKED'), { violations });
  const eventId = 'autonomous-authorization:' + draftId;
  if (!await findActivityById(eventId)) {
    if (options.proactive) {
      const events = await findCompanyActivities(context.companyId);
      const proactive = events.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === draft.contactEmail!.toLowerCase()
        && ['initial', 'followup'].includes(String(event.payload.kind)));
      const lastWeek = proactive.filter(event => +new Date(event.createdAt) > +now - 7 * 86_400_000);
      if (lastWeek.length >= settings.maxProactiveEmailsPer7Days) {
        throw new AppError('The proactive email frequency limit for this contact has been reached.', 409, 'FREQUENCY_LIMIT');
      }
      const latest = proactive.at(-1);
      if (latest && +new Date(latest.createdAt) > +now - settings.minimumHoursBetweenProactiveEmails * 3_600_000) {
        throw new AppError('The minimum interval between proactive emails has not passed.', 409, 'FREQUENCY_LIMIT');
      }
    }
    const body = (draft.body ?? '').includes('reply "unsubscribe"') ? draft.body! : (draft.body ?? '').trimEnd() + '\n\n' + UNSUBSCRIBE_FOOTER;
    const authorization = makeEvent(context, 'EMAIL_AUTONOMOUS_AUTHORIZED', {
      eventId, contactId: draft.contactId, contactName: draft.contactName, contactEmail: draft.contactEmail,
      subject: draft.subject, body, opportunityId: draft.opportunityId, sourceIds: draft.sourceIds,
      payload: { ...draft.payload, draftId, authorizationMode: 'AUTONOMOUS', consentVersion: management.consentVersion,
        activationId: management.activationId, authorizedAt: now.toISOString(), requiresHumanApproval: false, aiManaged: true,
        safetyChecks: ['confidence', 'suppression', 'content_policy', ...(options.proactive ? ['frequency'] : [])] },
    });
    const claim = await claimActivity(authorization);
    if (!claim.claimed && claim.event.companyId !== context.companyId) {
      throw new AppError('Autonomous email authorization conflicts with another company.', 409, 'AUTONOMOUS_AUTHORIZATION_CONFLICT');
    }
  }
  return await sendApprovedEmail(context, draftId);
}

export async function sendAutonomousEmail(context: SalesCompanyContext, draftId: string, options: AutonomousSendOptions = {}) {
  if (context.isSynthetic && env.SALES_EMAIL_PROVIDER !== 'mock') throw new AppError('Illustrative accounts can only use the test email provider.', 409, 'SAMPLE_OUTREACH_DISABLED');
  if (options.leaseHeld) return sendAutonomousUnderLease(context, draftId, options);
  const leaseKey = 'ai-company:' + context.companyId;
  const owner = await acquireAiManagementLease(leaseKey, 5 * 60_000);
  if (!owner) throw new AppError('Another AI Management action is running for this company.', 409, 'AI_MANAGEMENT_BUSY');
  try {
    return await sendAutonomousUnderLease(context, draftId, options);
  } finally {
    await releaseAiManagementLease(leaseKey, owner);
  }
}
function reasonForReply(analysis: ReplyAnalysis): typeof INTERVENTION_REASONS[number] {
  if (analysis.intent === 'COMPLAINT') return 'COMPLAINT_HANDLING';
  if (['PRICING_REQUEST', 'NEGOTIATION', 'PROPOSAL_REQUEST'].includes(analysis.intent)) return 'PRICING_APPROVAL';
  if (analysis.intent === 'MEETING_REQUEST') return 'MEETING_COORDINATION';
  if (['INTERESTED', 'SERVICE_REQUEST', 'PROVIDER_DISSATISFACTION'].includes(analysis.intent) || analysis.buyingSignals.length) return 'HIGH_VALUE_OPPORTUNITY';
  if (analysis.promptInjectionDetected || analysis.confidence < 0.7 || analysis.intent === 'AMBIGUOUS') return 'LOW_AI_CONFIDENCE';
  if (/legal|contract/i.test(analysis.requestedNextAction)) return 'LEGAL_REVIEW';
  if (analysis.intent === 'COMPETITOR_DISCUSSION') return 'COMPLEX_NEGOTIATION';
  if (['SERVICE_QUESTION', 'TECHNICAL_QUESTION'].includes(analysis.intent)) return 'TECHNICAL_CLARIFICATION';
  return 'OTHER';
}

export async function receiveReply(context: SalesCompanyContext, input: {
  replyId: string; contactEmail: string; text: string; providerMessageId?: string; providerThreadId?: string; internetMessageId?: string;
}, options: { autonomous?: boolean; minimumAutoConfidence?: number; autoRespondIntents?: readonly string[]; isSynthetic?: boolean } = {}) {
  const email = input.contactEmail.trim().toLowerCase();
  const eventsBefore = await findCompanyActivities(context.companyId);
  const sent = [...eventsBefore].reverse().find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED'
    && event.contactEmail?.toLowerCase() === email
    && (!input.providerThreadId || event.payload.providerThreadId === input.providerThreadId || event.providerMessageId === input.providerThreadId));
  if (!sent) throw new AppError('Reply does not match a provider-accepted message for this company and contact.', 409, 'REPLY_THREAD_UNMATCHED');
  const replyEventId = 'reply:' + input.replyId;
  const received = await findActivityById(replyEventId) ?? await log(context, 'REPLY_RECEIVED', {
    eventId: replyEventId, contactId: sent.contactId, contactName: sent.contactName, contactEmail: email,
    body: input.text, subject: 'Re: ' + (sent.subject ?? ''), opportunityId: sent.opportunityId, provider: sent.provider,
    providerMessageId: input.providerMessageId, sourceIds: sent.sourceIds,
    payload: { inReplyTo: sent.providerMessageId, providerThreadId: input.providerThreadId ?? sent.payload.providerThreadId,
      internetMessageId: input.internetMessageId, receivedAt: new Date().toISOString(),
      channel: context.isSynthetic || options.isSynthetic ? 'synthetic_simulation' : 'provider_inbound' },
  });
  const latestEvents = await findCompanyActivities(context.companyId);
  const priorClassification = await findActivityById('classified:' + input.replyId);
  const brief = await buildCompanyBrief(context, latestEvents);
  const analysis = priorClassification?.payload.analysis as ReplyAnalysis | undefined
    ?? await understandReply({ text: input.text, companyContext: brief, thread: latestEvents });
  const classification = priorClassification ?? await log(context, 'REPLY_CLASSIFIED', {
    eventId: 'classified:' + input.replyId, contactId: sent.contactId, contactName: sent.contactName, contactEmail: email,
    opportunityId: sent.opportunityId, intent: analysis.intent, sentiment: analysis.sentiment, confidence: analysis.confidence,
    sourceIds: [received.eventId], payload: { analysis, evidence: analysis.requirements.map(item => item.evidenceText).concat(analysis.questionsAsked).slice(0, 20),
      requestedNextAction: analysis.requestedNextAction, threadId: input.providerThreadId ?? sent.payload.providerThreadId ?? sent.providerMessageId },
  });
  await log(context, 'AGENT_EXECUTION', { eventId: 'agent:reply:' + input.replyId, agent: 'Intelligent Reply Understanding',
    success: true, executionMs: 0, intent: analysis.intent, confidence: analysis.confidence, sourceIds: [received.eventId],
    payload: { requiresHuman: analysis.requiresHuman, promptInjectionDetected: analysis.promptInjectionDetected } });

  const schedules = latestEvents.filter(event => event.type === 'FOLLOWUP_SCHEDULED' && event.contactEmail?.toLowerCase() === email);
  for (const schedule of schedules) {
    const cancelId = 'followup-cancelled:' + schedule.eventId;
    if (!await findActivityById(cancelId)) await log(context, 'FOLLOWUP_CANCELLED', { eventId: cancelId, contactId: sent.contactId,
      contactEmail: email, payload: { scheduleEventId: schedule.eventId, reason: analysis.intent === 'UNSUBSCRIBE' ? 'opt_out' : 'customer_replied' } });
  }

  if (analysis.requirements.length || ['EXISTING_PROVIDER', 'REFERRAL', 'PROVIDER_DISSATISFACTION', 'COMPETITOR_DISCUSSION'].includes(analysis.intent)) {
    const feedbackId = 'feedback:' + input.replyId;
    await log(context, 'FEEDBACK_CAPTURED', { eventId: feedbackId, contactId: sent.contactId, contactEmail: email,
      opportunityId: sent.opportunityId, intent: analysis.intent, sourceIds: [received.eventId],
      payload: { requirement: analysis.requirements[0]?.text ?? null,
        requirements: analysis.requirements.map(item => ({ ...item, sourceMessageId: received.eventId })),
        existingProviderMentioned: ['EXISTING_PROVIDER', 'PROVIDER_DISSATISFACTION', 'COMPETITOR_DISCUSSION'].includes(analysis.intent), referralMentioned: analysis.intent === 'REFERRAL',
        providerDissatisfaction: analysis.intent === 'PROVIDER_DISSATISFACTION',
        verifiedByCustomer: analysis.requirements.length > 0, customerMessageId: input.providerMessageId ?? received.eventId } });
    for (const [index, requirement] of analysis.requirements.entries()) {
      const updateId = 'opportunity-update:' + input.replyId + ':' + index;
      await log(context, 'OPPORTUNITY_UPDATED', { eventId: updateId, opportunityId: sent.opportunityId, contactId: sent.contactId,
        sourceIds: [received.eventId], service: sent.service, payload: { change: 'customer_confirmed_requirement_added',
          requirement: requirement.text, evidenceText: requirement.evidenceText, sourceMessageId: received.eventId,
          previousHistoryPreserved: true, requiresQualificationReassessment: true } });
      if (isNeo4jConnected()) {
        try { await linkSalesRequirement({ companyId: context.companyId, companyName: context.companyName, opportunityId: sent.opportunityId,
          requirementId: updateId, text: requirement.text, sourceMessageId: received.eventId }); }
        catch (error) { logger.warn('Could not sync verified customer requirement to Neo4j', { companyId: context.companyId, error: error instanceof Error ? error.message : 'unknown error' }); }
      }
    }
    await log(context, 'AGENT_EXECUTION', { eventId: 'agent:opportunity-feedback:' + input.replyId, agent: 'Opportunity Intelligence and Feedback',
      success: true, executionMs: 0, confidence: analysis.confidence, sourceIds: [received.eventId],
      payload: { newRequirements: analysis.requirements.length, scoreRecalculation: 'not_applied_without_qualification_review' } });
  }

  if (analysis.intent === 'UNSUBSCRIBE') {
    const priorSuppression = await findEmailSuppression(email);
    if (!priorSuppression) await log(context, 'SUPPRESSION_ADDED', {
      eventId: 'suppression:' + createHash('sha256').update(email).digest('hex') + ':' +
        createHash('sha256').update(context.companyId + ':' + input.replyId).digest('hex').slice(0, 12),
      contactId: sent.contactId, contactName: sent.contactName, contactEmail: email, sourceIds: [received.eventId],
      payload: { reason: 'customer_unsubscribe', effectiveAt: new Date().toISOString(), scope: 'global_email_address' } });
    return { received, classification, analysis, responseDraft: null, autonomousResponseEligible: false, escalationCreated: false, suppressed: true };
  }

  if (analysis.intent === 'MEETING_REQUEST') await log(context, 'MEETING_REQUESTED', {
    eventId: 'meeting-request:' + input.replyId, contactId: sent.contactId, contactEmail: email, opportunityId: sent.opportunityId,
    sourceIds: [received.eventId], intent: analysis.intent, payload: { confirmedMeeting: false, requestedNextAction: analysis.requestedNextAction } });

  const currentBrief = await buildCompanyBrief(context, await findCompanyActivities(context.companyId));
  const knowledge = await businessKnowledgeStore.read();
  const response = await generateContextualResponse({ context: { ...context, service: sent.service ?? context.service }, brief: currentBrief,
    analysis, replyText: input.text, replyEvent: received, thread: await findCompanyActivities(context.companyId), catalogue: knowledge });
  const autoResponseEligible = !!response && options.autonomous === true
    && (options.autoRespondIntents ?? ['REQUEST_FOR_INFORMATION', 'SERVICE_QUESTION']).includes(analysis.intent)
    && !analysis.requiresHuman && !analysis.promptInjectionDetected
    && analysis.confidence >= (options.minimumAutoConfidence ?? 0.72)
    && response.confidence >= (options.minimumAutoConfidence ?? 0.72)
    && (response.generatedBy === 'configured_llm' || response.generatedBy === 'approved_catalogue');
  let responseDraft: ISalesActivity | null = null;
  if (response) {
    const priorDraft = await findActivityById('response-drafted:' + input.replyId);
    if (priorDraft) responseDraft = await findActivityById('draft:' + String(priorDraft.payload.draftId));
    else {
      const draftId = createHash('sha256').update('reply-draft:' + input.replyId).digest('hex').slice(0, 32);
      responseDraft = await log(context, 'EMAIL_DRAFTED', { eventId: 'draft:' + draftId, contactId: sent.contactId, contactName: sent.contactName,
        contactEmail: email, opportunityId: sent.opportunityId, subject: response.subject, body: response.body, sourceIds: response.sourceIds,
        provider: sent.provider, payload: { draftId, kind: 'reply', replyEventId: received.eventId,
          providerThreadId: input.providerThreadId ?? sent.payload.providerThreadId,
          inboundProviderMessageId: input.providerMessageId,
          internetMessageId: input.internetMessageId,
          inReplyTo: input.internetMessageId ?? sent.payload.internetMessageId ?? sent.providerMessageId,
          rationale: response.rationale, serviceIds: response.serviceIds, confidence: response.confidence,
          generatedBy: response.generatedBy, requiresApproval: !autoResponseEligible, requiresHumanApproval: !autoResponseEligible,
          aiManaged: autoResponseEligible, analysisIntent: analysis.intent } });
      await log(context, 'RESPONSE_DRAFTED', { eventId: 'response-drafted:' + input.replyId, contactId: sent.contactId,
        contactEmail: email, opportunityId: sent.opportunityId, sourceIds: response.sourceIds,
        payload: { draftId, replyEventId: received.eventId, requiresHumanApproval: !autoResponseEligible } });
      await log(context, 'AGENT_EXECUTION', { eventId: 'agent:response:' + input.replyId, agent: 'Contextual Response Generation',
        success: true, executionMs: 0, confidence: response.confidence, sourceIds: response.sourceIds, payload: { draftId, requiresHumanApproval: !autoResponseEligible } });
    }
  }
  const shouldEscalate = !autoResponseEligible && (analysis.requiresHuman || ['MEETING_REQUEST', 'INTERESTED', 'SERVICE_REQUEST', 'PROVIDER_DISSATISFACTION'].includes(analysis.intent)
    || analysis.buyingSignals.length > 0 || analysis.promptInjectionDetected);
  if (shouldEscalate && !await findActivityById('intervention:' + input.replyId)) {
    const reason = reasonForReply(analysis);
    await log(context, 'INTERVENTION_CREATED', { eventId: 'intervention:' + input.replyId, contactId: sent.contactId, contactName: sent.contactName,
      contactEmail: email, reason, priority: analysis.intent === 'COMPLAINT' ? 'CRITICAL' : ['PRICING_REQUEST', 'NEGOTIATION', 'MEETING_REQUEST'].includes(analysis.intent) ? 'HIGH' : 'MEDIUM',
      status: 'PENDING', assignedTo: 'Unassigned', opportunityId: sent.opportunityId, sourceIds: [received.eventId],
      payload: { interventionId: input.replyId, escalationReason: reason, recommendation: analysis.requestedNextAction,
        latestMessage: input.text, replyEventId: received.eventId, replyIntent: analysis.intent, suggestedDraftId: responseDraft?.payload.draftId } });
  }
  return { received, classification, analysis, responseDraft, autonomousResponseEligible: autoResponseEligible, escalationCreated: shouldEscalate, suppressed: false };
}

export async function scheduleFollowup(context: SalesCompanyContext, input: { contactEmail: string; scheduledAt: string; requestId: string; reason?: string }) {
  const events = await findCompanyActivities(context.companyId); needSelected(events);
  const email = input.contactEmail.trim().toLowerCase();
  if (await findEmailSuppression(email)) throw new AppError('This contact is suppressed and cannot be scheduled for follow-up.', 409, 'CONTACT_OPTED_OUT');
  const requestedAt = new Date(input.scheduledAt);
  if (!Number.isFinite(+requestedAt) || +requestedAt <= Date.now() || +requestedAt > Date.now() + 365 * 86400000) {
    throw new AppError('Follow-up time must be in the future and within the next 365 days.', 400, 'INVALID_FOLLOWUP_TIME');
  }
  const contact = [...events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && event.contactEmail?.toLowerCase() === email);
  const lastSent = [...events].reverse().find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === email);
  if (!contact || !lastSent) throw new AppError('A known contact with an accepted email is required to schedule a follow-up.', 409, 'FOLLOWUP_CONTEXT_REQUIRED');
  return log(context, 'FOLLOWUP_SCHEDULED', { eventId: 'followup-scheduled:manual:' + input.requestId, contactId: contact.contactId,
    contactName: contact.contactName, contactEmail: email, opportunityId: lastSent.opportunityId, sourceIds: lastSent.sourceIds,
    payload: { scheduledAt: requestedAt.toISOString(), kind: 'salesperson_requested', reason: input.reason?.trim() || null } });
}

export async function runDueFollowups(resolveContext: (companyId: string) => Promise<SalesCompanyContext>, now = new Date()) {
  const events = await allActivityEvents();
  const schedules = events.filter(event => event.type === 'FOLLOWUP_SCHEDULED' && event.payload.aiManaged !== true && Number.isFinite(+new Date(String(event.payload.scheduledAt)))
    && +new Date(String(event.payload.scheduledAt)) <= +now);
  const results: { scheduleId: string; status: 'drafted' | 'skipped'; reason?: string; draftId?: string }[] = [];
  for (const schedule of schedules) {
    if (!schedule.contactEmail) continue;
    const thread = await findCompanyActivities(schedule.companyId);
    const newestSchedule = [...thread].reverse().find(event => event.type === 'FOLLOWUP_SCHEDULED' && event.contactEmail?.toLowerCase() === schedule.contactEmail!.toLowerCase());
    if (newestSchedule?.eventId !== schedule.eventId) { results.push({ scheduleId: schedule.eventId, status: 'skipped', reason: 'A newer follow-up schedule superseded it.' }); continue; }
    const draftId = createHash('sha256').update(schedule.eventId).digest('hex').slice(0, 32);
    if (await findActivityById('followup-due:' + schedule.eventId) && await findActivityById('draft:' + draftId)) {
      results.push({ scheduleId: schedule.eventId, status: 'skipped', reason: 'This scheduled follow-up was already processed.' }); continue;
    }
    const eligibility = assessFollowupEligibility(thread, schedule.contactEmail, now, env.SALES_MAX_FOLLOWUPS);
    if (!eligibility.eligible) { results.push({ scheduleId: schedule.eventId, status: 'skipped', reason: eligibility.reason }); continue; }
    const contact = [...thread].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && event.contactEmail?.toLowerCase() === schedule.contactEmail!.toLowerCase());
    if (!contact) { results.push({ scheduleId: schedule.eventId, status: 'skipped', reason: 'Contact record no longer exists.' }); continue; }
    const context = await resolveContext(schedule.companyId);
    const brief = await buildCompanyBrief(context, thread);
    const copy = await generateFollowupCopy(context, brief, thread, contact);
    await log(context, 'FOLLOWUP_DUE', { eventId: 'followup-due:' + schedule.eventId, contactId: contact.contactId, contactName: contact.contactName,
      contactEmail: schedule.contactEmail, opportunityId: eligibility.lastAcceptedMessage?.opportunityId, sourceIds: schedule.sourceIds,
      payload: { scheduleEventId: schedule.eventId, requiresHumanApproval: true } });
    await log(context, 'EMAIL_DRAFTED', { eventId: 'draft:' + draftId, contactId: contact.contactId, contactName: contact.contactName,
      contactEmail: schedule.contactEmail, opportunityId: eligibility.lastAcceptedMessage?.opportunityId, subject: copy.subject, body: copy.body,
      sourceIds: schedule.sourceIds, payload: { draftId, kind: 'followup', scheduleEventId: schedule.eventId, editable: true, requiresApproval: true,
        providerThreadId: eligibility.lastAcceptedMessage?.payload.providerThreadId,
        inboundProviderMessageId: eligibility.lastAcceptedMessage?.providerMessageId,
        internetMessageId: eligibility.lastAcceptedMessage?.payload.internetMessageId,
        rationale: copy.rationale, confidence: copy.confidence, generatedBy: copy.generatedBy,
        inReplyTo: eligibility.lastAcceptedMessage?.payload.internetMessageId ?? eligibility.lastAcceptedMessage?.providerMessageId } });
    await log(context, 'AGENT_EXECUTION', { eventId: 'agent:followup:' + schedule.eventId, agent: 'Intelligent Follow-up',
      success: true, executionMs: 0, confidence: copy.confidence, sourceIds: schedule.sourceIds, payload: { draftId, requiresHumanApproval: true } });
    results.push({ scheduleId: schedule.eventId, status: 'drafted', draftId });
  }
  return results;
}

export async function updateIntervention(context: SalesCompanyContext, interventionId: string, input: { status: typeof INTERVENTION_STATUSES[number]; assignedTo?: string }) {
  const events = await findCompanyActivities(context.companyId);
  const previous = [...events].reverse().find(event => (event.type === 'INTERVENTION_CREATED' || event.type === 'INTERVENTION_UPDATED') && event.payload.interventionId === interventionId);
  if (!previous) throw new AppError('Intervention was not found for this company.', 404, 'INTERVENTION_NOT_FOUND');
  if (!(INTERVENTION_STATUSES as readonly string[]).includes(input.status) || !(INTERVENTION_REASONS as readonly string[]).includes(previous.reason ?? 'OTHER')) throw new AppError('Invalid intervention status.', 400, 'VALIDATION_ERROR');
  const contextEvent = makeEvent(context, 'INTERVENTION_UPDATED', { eventId: `intervention-update:${interventionId}:${randomUUID()}`,
    contactId: previous.contactId, contactName: previous.contactName, contactEmail: previous.contactEmail, reason: previous.reason,
    priority: previous.priority, assignedTo: input.assignedTo?.trim() || previous.assignedTo, status: input.status,
    opportunityId: previous.opportunityId, payload: { ...previous.payload, interventionId, previousStatus: previous.status,
      updatedAt: new Date().toISOString(), ...(input.status === 'RESOLVED' ? { resolutionMs: Date.now() - new Date(previous.createdAt).getTime() } : {}) } });
  const updated = await appendActivity(contextEvent);
  logger.info('Sales intervention updated', { interventionId, status: input.status });
  return updated;
}

export async function workflowEvent(context: SalesCompanyContext, type: SalesEventType, input: Record<string, unknown> = {}) {
  if (type === 'SELECTED') return selectCompany(context);
  if (type === 'EMAIL_DRAFTED') return draftEmail(context, input as { contactId?: string; subject?: string; body?: string });
  throw new AppError('Unsupported sales workflow action.', 400, 'UNSUPPORTED_WORKFLOW_ACTION');
}

export { classifyReply, REPLY_INTENTS, INTERVENTION_STATUSES };
