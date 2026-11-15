import { randomUUID, createHash } from 'node:crypto';
import { AppError } from '../utils/errors';
import { INTERVENTION_REASONS, INTERVENTION_STATUSES, ISalesActivity, REPLY_INTENTS, SalesEventType } from '../models/SalesActivity';
import { appendActivity, findActivityById, findCompanyActivities } from '../salesStore';
import { logger } from '../utils/logger';

export interface SalesCompanyContext {
  companyId: string; companyName: string; researchId?: string; country?: string; industry?: string;
  service?: string; sourceIds?: string[]; evidence?: { title: string; url: string; sourceId: string; publishedAt: string | null }[];
  isSynthetic?: boolean;
}

function makeEvent(context: SalesCompanyContext, type: SalesEventType, extra: Partial<ISalesActivity> & { eventId?: string } = {}): ISalesActivity {
  const { eventId = `${context.companyId}:${type}:${randomUUID()}`, ...fields } = extra;
  return { eventId, type, companyId: context.companyId, companyName: context.companyName,
    researchId: context.researchId, country: context.country, industry: context.industry, service: context.service,
    sourceIds: context.sourceIds ?? [], payload: {}, isSynthetic: context.isSynthetic ?? false,
    createdAt: new Date(), ...fields };
}

async function log(context: SalesCompanyContext, type: SalesEventType, extra: Partial<ISalesActivity> & { eventId?: string } = {}) {
  return appendActivity(makeEvent(context, type, extra));
}

export async function recordDiscoveryHandoff(input: SalesCompanyContext & { candidates: { opportunityId: string; service: string }[] }) {
  const qualified = await Promise.all(input.candidates.map(({ opportunityId, service }) => log({ ...input, service }, 'QUALIFIED', {
    eventId: `qualified:${input.researchId}:${opportunityId}`, opportunityId,
    service, payload: { stage: 'evidence_qualified', qualification: 'service hypothesis supported; customer need unconfirmed' },
  })));
  await log(input, 'AGENT_EXECUTION', { eventId: `agent:discovery:${input.researchId}`, agent: 'Discovery & Qualification', success: true, executionMs: 0,
    payload: { qualifiedCandidates: qualified.length } });
  return { qualified };
}

export async function recordDiscoverySnapshot(input: SalesCompanyContext) {
  return log(input, 'DISCOVERED', { eventId: `discovery:${input.researchId}`,
    payload: { sourceCount: input.sourceIds?.length ?? 0, identity: 'Wikidata entity ID', duplicateKey: input.companyId } });
}

export async function getWorkflow(companyId: string) {
  const events = await findCompanyActivities(companyId);
  const optOuts = events.filter(e => e.type === 'REPLY_CLASSIFIED' && e.intent === 'UNSUBSCRIBE').map(e => (e.contactEmail ?? '').toLowerCase());
  return { companyId, events, optedOutEmails: [...new Set(optOuts)], isSynthetic: events.some(e => e.isSynthetic) };
}

function needSelected(events: ISalesActivity[]) {
  if (!events.some(event => event.type === 'SELECTED')) throw new AppError('Select this company before continuing the sales workflow.', 409, 'COMPANY_NOT_SELECTED');
}
function newest(events: ISalesActivity[], type: SalesEventType) { return [...events].reverse().find(event => event.type === type); }

export async function selectCompany(context: SalesCompanyContext) {
  const events = await findCompanyActivities(context.companyId);
  if (!events.some(event => event.type === 'DISCOVERED')) throw new AppError('This company has not entered the sales workflow through Discovery.', 404, 'DISCOVERY_NOT_FOUND');
  return log(context, 'SELECTED', { eventId: `selected:${context.companyId}`, payload: { selectedAt: new Date().toISOString() } });
}

export async function identifyContact(context: SalesCompanyContext, contact: { name: string; email: string; role: string }) {
  const events = await findCompanyActivities(context.companyId); needSelected(events);
  const email = contact.email.trim().toLowerCase();
  if (events.some(event => event.type === 'REPLY_CLASSIFIED' && event.intent === 'UNSUBSCRIBE' && event.contactEmail?.toLowerCase() === email)) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  return log(context, 'CONTACT_IDENTIFIED', { eventId: `contact:${context.companyId}:${email}`, contactId: `contact-${createHash('sha256').update(email).digest('hex').slice(0, 12)}`,
    contactName: contact.name.trim(), contactEmail: email, payload: { role: contact.role.trim(), origin: context.isSynthetic ? 'synthetic_demo' : 'user_supplied' } });
}

export async function draftEmail(context: SalesCompanyContext, input?: { contactId?: string; subject?: string; body?: string }) {
  const events = await findCompanyActivities(context.companyId); needSelected(events);
  const contact = input?.contactId ? [...events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED' && event.contactId === input.contactId) : newest(events, 'CONTACT_IDENTIFIED');
  if (!contact?.contactEmail) throw new AppError('Identify a decision maker before drafting an email.', 409, 'CONTACT_REQUIRED');
  if (events.some(event => event.type === 'REPLY_CLASSIFIED' && event.intent === 'UNSUBSCRIBE' && event.contactEmail?.toLowerCase() === contact.contactEmail!.toLowerCase())) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  const sentBefore = events.some(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === contact.contactEmail!.toLowerCase());
  if (sentBefore) throw new AppError('This contact already has an accepted first-touch email. Duplicate outreach was prevented.', 409, 'DUPLICATE_OUTREACH');
  const evidence = context.evidence?.find(item => context.sourceIds?.includes(item.sourceId));
  const subject = input?.subject?.trim() || `A question about ${context.companyName}'s recent plans`;
  const body = input?.body?.trim() || `Hi ${contact.contactName},\n\nI saw the public report${evidence ? ` “${evidence.title}”` : ` about ${context.companyName}`} and wanted to ask whether it is relevant to your team.\n\nIf useful, Singtel could explore ${context.service || 'relevant connectivity and digital services'} with you. Would a short conversation make sense? This is only an initial question; I do not want to assume a requirement.\n\nRegards,\nSingtel Enterprise Team${evidence ? `\n\nSource: ${evidence.url}` : ''}`;
  const draftId = randomUUID();
  const event = await log(context, 'EMAIL_DRAFTED', { eventId: `draft:${draftId}`, contactId: contact.contactId, contactName: contact.contactName,
    contactEmail: contact.contactEmail, subject, body, sourceIds: evidence ? [evidence.sourceId] : [], payload: { draftId, editable: true, requiresApproval: true, generatedBy: 'grounded_template' } });
  await log(context, 'AGENT_EXECUTION', { eventId: `agent:email:${draftId}`, agent: 'Email Generation', success: true, executionMs: 0, payload: { draftId } });
  return event;
}

export async function approveEmail(context: SalesCompanyContext, draftId: string, editedBody?: string) {
  const draft = await findActivityById(`draft:${draftId}`);
  if (!draft || draft.type !== 'EMAIL_DRAFTED' || draft.companyId !== context.companyId) throw new AppError('Email draft was not found for this company.', 404, 'DRAFT_NOT_FOUND');
  const prior = await findActivityById(`approval:${draftId}`);
  if (prior) return prior;
  return log(context, 'EMAIL_APPROVED', { eventId: `approval:${draftId}`, contactId: draft.contactId, contactName: draft.contactName,
    contactEmail: draft.contactEmail, subject: draft.subject, body: editedBody?.trim() || draft.body,
    sourceIds: draft.sourceIds, payload: { draftId, approvedBy: 'local_sales_user', humanApprovedAt: new Date().toISOString() } });
}

/** Mock provider confirms acceptance for processing only; it makes no inbox-delivery claim. */
export async function sendApprovedEmail(context: SalesCompanyContext, draftId: string) {
  const id = `provider-accepted:${draftId}`;
  const existing = await findActivityById(id); if (existing) return existing;
  const approval = await findActivityById(`approval:${draftId}`);
  if (!approval || approval.companyId !== context.companyId) throw new AppError('A human must approve this email before sending.', 409, 'APPROVAL_REQUIRED');
  const events = await findCompanyActivities(context.companyId);
  if (events.some(event => event.type === 'REPLY_CLASSIFIED' && event.intent === 'UNSUBSCRIBE' && event.contactEmail?.toLowerCase() === approval.contactEmail?.toLowerCase())) {
    throw new AppError('This contact has opted out of further outreach.', 409, 'CONTACT_OPTED_OUT');
  }
  try {
    const accepted = await log(context, 'EMAIL_PROVIDER_ACCEPTED', { eventId: id, contactId: approval.contactId, contactName: approval.contactName,
      contactEmail: approval.contactEmail, subject: approval.subject, body: approval.body, provider: 'MOCK', providerMessageId: `mock-${draftId}`,
      sourceIds: approval.sourceIds, payload: { provider: 'mock_email', acceptedAt: new Date().toISOString(), inboxDelivery: 'unknown' } });
    await log(context, 'AGENT_EXECUTION', { eventId: `agent:email-send:${draftId}`, agent: 'Mock Email Provider', success: true, executionMs: 0,
      payload: { accepted: true, deliveryConfirmed: false } });
    return accepted;
  } catch (error) {
    await log(context, 'EMAIL_FAILED', { eventId: `provider-failed:${draftId}`, contactId: approval.contactId, contactEmail: approval.contactEmail,
      provider: 'MOCK', success: false, payload: { draftId, failure: (error as Error).message } });
    throw error;
  }
}

export function classifyReply(text: string) {
  const rules: [typeof REPLY_INTENTS[number], RegExp, 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'][] = [
    ['UNSUBSCRIBE', /\b(unsubscribe|remove me|stop emailing|do not contact)\b/i, 'NEGATIVE'],
    ['COMPLAINT', /\b(complaint|unacceptable|poor service|disappointed|breach of)\b/i, 'NEGATIVE'],
    ['NEGOTIATION', /\b(discount|pricing|price|negotiate|commercial terms)\b/i, 'NEUTRAL'],
    ['MEETING_REQUEST', /\b(meet|meeting|call|schedule|calendar)\b/i, 'POSITIVE'],
    ['REQUEST_FOR_INFORMATION', /\b(more information|send (?:me )?(?:details|information)|datasheet|proposal)\b/i, 'POSITIVE'],
    ['EXISTING_PROVIDER', /\b(current provider|existing provider|already use|incumbent)\b/i, 'NEUTRAL'],
    ['REFERRAL', /\b(speak to|contact|refer|colleague|responsible for)\b/i, 'POSITIVE'],
    ['OUT_OF_OFFICE', /\b(out of office|on leave|back on|away until)\b/i, 'NEUTRAL'],
    ['NOT_INTERESTED', /\b(not interested|no thanks|not looking|decline)\b/i, 'NEGATIVE'],
    ['INTERESTED', /\b(interested|sounds good|yes,? let's|let us discuss|please proceed)\b/i, 'POSITIVE'],
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  const intent = match?.[0] ?? 'OTHER';
  const evidence = match ? text.match(match[1])?.[0] : undefined;
  const confidence = match ? 0.86 : 0.42;
  const sentiment = match?.[2] ?? 'NEUTRAL';
  const needsHuman = ['UNSUBSCRIBE', 'COMPLAINT', 'NEGOTIATION', 'MEETING_REQUEST'].includes(intent) || confidence < 0.65 || /\b(legal|contract|architecture|security|integration|discount|pricing)\b/i.test(text);
  const reason: typeof INTERVENTION_REASONS[number] = intent === 'UNSUBSCRIBE' ? 'OTHER' : intent === 'COMPLAINT' ? 'COMPLAINT_HANDLING' : intent === 'NEGOTIATION' ? 'COMPLEX_NEGOTIATION' : intent === 'MEETING_REQUEST' ? 'MEETING_COORDINATION' : confidence < 0.65 ? 'LOW_AI_CONFIDENCE' : /\b(legal|contract)\b/i.test(text) ? 'LEGAL_REVIEW' : /\b(technical|architecture|security|integration)\b/i.test(text) ? 'TECHNICAL_CLARIFICATION' : 'OTHER';
  return { intent, sentiment, confidence, evidence: evidence ?? text.trim().slice(0, 180), needsHuman, reason };
}

export async function receiveReply(context: SalesCompanyContext, input: { replyId: string; contactEmail: string; text: string }) {
  const existing = await findActivityById(`reply:${input.replyId}`); if (existing) return { received: existing, classification: await findActivityById(`classified:${input.replyId}`) };
  const events = await findCompanyActivities(context.companyId);
  const sent = [...events].reverse().find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.contactEmail?.toLowerCase() === input.contactEmail.toLowerCase());
  if (!sent) throw new AppError('Reply does not match a provider-accepted message for this company and contact.', 409, 'REPLY_THREAD_UNMATCHED');
  const received = await log(context, 'REPLY_RECEIVED', { eventId: `reply:${input.replyId}`, contactId: sent.contactId, contactName: sent.contactName,
    contactEmail: input.contactEmail.toLowerCase(), body: input.text, subject: `Re: ${sent.subject}`, payload: { inReplyTo: sent.providerMessageId, receivedAt: new Date().toISOString(), channel: 'synthetic_webhook' } });
  const result = classifyReply(input.text);
  const classification = await log(context, 'REPLY_CLASSIFIED', { eventId: `classified:${input.replyId}`, contactId: sent.contactId, contactName: sent.contactName,
    contactEmail: input.contactEmail.toLowerCase(), intent: result.intent, sentiment: result.sentiment, confidence: result.confidence,
    payload: { evidence: result.evidence, suggestedResponse: result.intent === 'UNSUBSCRIBE' ? null : 'Thank you for your reply. A Singtel representative will follow up with the information you requested.', threadId: sent.providerMessageId } });
  await log(context, 'AGENT_EXECUTION', { eventId: `agent:reply:${input.replyId}`, agent: 'Reply Intelligence', success: true, executionMs: 0,
    intent: result.intent, confidence: result.confidence, payload: { intent: result.intent, evidence: result.evidence } });
  if (result.intent === 'MEETING_REQUEST') await log(context, 'MEETING_REQUESTED', { eventId: `meeting-request:${input.replyId}`, contactId: sent.contactId, contactEmail: input.contactEmail.toLowerCase(), intent: result.intent, payload: { confirmedMeeting: false } });
  if (result.intent === 'UNSUBSCRIBE') await log(context, 'FEEDBACK_CAPTURED', { eventId: `optout:${input.contactEmail.toLowerCase()}`, contactId: sent.contactId,
    contactEmail: input.contactEmail.toLowerCase(), payload: { optedOut: true, requirement: null } });
  const requirement = /\b(?:need|looking for|require|interested in)\b[^.!?]{0,180}/i.exec(input.text)?.[0];
  if (requirement || result.intent === 'EXISTING_PROVIDER' || result.intent === 'REFERRAL') {
    await log(context, 'FEEDBACK_CAPTURED', { eventId: `feedback:${input.replyId}`, contactId: sent.contactId, contactEmail: input.contactEmail.toLowerCase(),
      intent: result.intent, sourceIds: [received.eventId], payload: { requirement: requirement ?? null,
        existingProviderMentioned: result.intent === 'EXISTING_PROVIDER', referralMentioned: result.intent === 'REFERRAL', verifiedByCustomer: true } });
  }
  if (result.needsHuman && result.intent !== 'UNSUBSCRIBE') {
    const interventionId = `intervention:${input.replyId}`;
    await log(context, 'INTERVENTION_CREATED', { eventId: interventionId, contactId: sent.contactId, contactName: sent.contactName,
      contactEmail: input.contactEmail.toLowerCase(), reason: result.reason, priority: result.intent === 'COMPLAINT' ? 'CRITICAL' : result.intent === 'NEGOTIATION' ? 'HIGH' : 'MEDIUM',
      status: 'PENDING', assignedTo: 'Unassigned', opportunityId: sent.opportunityId, sourceIds: [received.eventId],
      payload: { interventionId: input.replyId, escalationReason: result.reason, recommendation: classification.payload.suggestedResponse, replyEventId: received.eventId } });
  }
  return { received, classification, escalationCreated: result.needsHuman && result.intent !== 'UNSUBSCRIBE' };
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

export { REPLY_INTENTS, INTERVENTION_STATUSES };
