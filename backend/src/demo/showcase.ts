import { createHash } from 'node:crypto';
import accounts from '../fixtures/showcase-accounts.json';
import { getSeedKnowledge } from '../business/store';
import { ISalesActivity } from '../models/SalesActivity';
import { AiManagementCompanyRecord, AiManagementNotificationRecord, DailyRankingRunRecord } from '../models/AiManagement';
import { emptyMemory, findCompanyManagement, saveCompanyManagement, createAiNotification, getDailyRankingRun, saveDailyRankingRun } from '../ai-management/store';
import { appendActivity, findActivityById } from '../salesStore';
import { saveResearch, ResearchRecord } from '../integrations/research/store';
import { env } from '../config/env';
import { ResearchSnapshot } from '../models/CloudStorage';
import { Company } from '../models/Company';
import { IntelligenceSignal } from '../models/IntelligenceSignal';
import { Opportunity } from '../models/Opportunity';
import { registerShowcaseRecords } from './companies';

export const SHOWCASE_DATASET = 'singtel-scout-showcase-v2';
const hash = (value: string) => createHash('sha256').update(SHOWCASE_DATASET + ':' + value).digest('hex');
const DAY = 86400000;

/** Build an inspectable dataset without calling AI, sending email, or touching storage. */
export function buildShowcaseData(now = new Date()) {
  const knowledge = getSeedKnowledge();
  const events: ISalesActivity[] = [], research: ResearchRecord[] = [], profiles: any[] = [], opportunities: any[] = [];
  const management: AiManagementCompanyRecord[] = [], notifications: AiManagementNotificationRecord[] = [];
  const leads: DailyRankingRunRecord['selectedLeads'] = [];
  for (const [index, account] of accounts.entries()) {
    const offer = knowledge.offerings.find(item => item.id === account.offeringId);
    if (!offer) throw new Error('Unknown offering in the showcase data: ' + account.offeringId);
    const companyId = 'synthetic:showcase-' + account.slug, prefix = SHOWCASE_DATASET + ':' + account.slug;
    const fingerprint = hash(account.slug), objectId = fingerprint.slice(0, 24);
    const researchId = 'research-' + fingerprint.slice(0, 8) + '-' + fingerprint.slice(8, 12) + '-' + fingerprint.slice(12, 16) + '-' + fingerprint.slice(16, 20) + '-' + fingerprint.slice(20, 32);
    const sourceId = 'sample-source-' + account.slug, contactEmail = account.slug + '@showcase.invalid';
    const at = (step: number) => new Date(+now - 6 * DAY + (index * 6 + step) * 3600000);
    const eventId = (step: string) => prefix + ':' + step;
    const contactId = 'sample-contact-' + account.slug, opportunityId = prefix + ':opportunity';
    const context = { companyId, companyName: account.name, country: account.country, industry: account.industry, service: offer.name,
      researchId, opportunityId, sourceIds: [sourceId], isSynthetic: true };
    const add = (type: ISalesActivity['type'], step: string, hour: number, fields: Partial<ISalesActivity> = {}) => {
      const event: ISalesActivity = { ...context, eventId: eventId(step), type, createdAt: at(hour), ...fields,
        payload: { ...(fields.payload ?? {}), datasetTag: SHOWCASE_DATASET, provenance: 'illustrative_crm' } };
      events.push(event); return event;
    };
    const source = { id: sourceId, kind: 'news_headline' as const, title: 'Illustrative account requirement: ' + account.name,
      url: 'https://example.invalid/showcase/' + account.slug, publisher: 'Singtel Scout sample CRM',
      excerpt: 'Illustrative CRM scenario, not a public news report. ' + account.requirement,
      publishedAt: at(0).toISOString(), retrievedAt: now.toISOString(), contentHash: hash(account.requirement), verification: 'headline_only' as const };
    research.push({ id: researchId, company: { entityId: 'showcase-' + account.slug, name: account.name,
      description: 'Illustrative ' + account.industry.toLowerCase() + ' account in ' + account.country + '.', website: null,
      wikipediaTitle: null, aliases: [], identitySource: source.url }, sources: [source],
      warnings: ['Illustrative account, commercial values and conversation. Not an actual Singtel customer record.'], createdAt: at(0).toISOString() });
    const signal = { _id: hash(account.slug + ':signal').slice(0, 24), companyId: objectId, signalType: 'TECH_ADOPTION',
      description: account.requirement, source: 'Illustrative CRM scenario · ' + SHOWCASE_DATASET, sourceUrl: source.url,
      detectedAt: at(0), publishedAt: at(0), confidenceScore: 0.8, isSynthetic: true, datasetTag: SHOWCASE_DATASET };
    profiles.push({ _id: objectId, companyName: account.name, country: account.country, industry: account.industry, headquarters: account.country,
      companyStage: 'Established', employeeCount: 180 + index * 60, description: research[research.length - 1].company.description,
      website: undefined, sourceReferences: [{ sourceName: 'Illustrative CRM scenario', sourceUrl: source.url, fetchedAt: at(0) }],
      isSynthetic: true, datasetTag: SHOWCASE_DATASET, salesCompanyId: companyId, isMockData: true, createdAt: at(0), updatedAt: at(1), signals: [signal] });
    opportunities.push({ _id: hash(account.slug + ':opportunity').slice(0, 24), companyId: objectId, companyName: account.name,
      opportunityType: 'Illustrative enterprise service requirement', potentialService: offer.name, reasoning: account.requirement,
      priority: account.score >= 75 ? 'HIGH' : 'MEDIUM', confidenceScore: 0.8, status: account.scenario === 'converted' ? 'CLOSED' : 'OPEN',
      datasetTag: SHOWCASE_DATASET, isSynthetic: true, createdAt: at(1), updatedAt: at(1) });
    add('DISCOVERED', 'discovered', 0, { payload: { sourceCount: 1 } });
    add('QUALIFIED', 'qualified', 1, { payload: { offeringId: offer.id, qualification: 'Illustrative customer scenario', reason: account.requirement, score: account.score } });
    add('AGENT_EXECUTION', 'discovery-agent', 1, { agent: 'Discovery & Qualification', success: true, executionMs: 1200 + index * 50, confidence: 0.8, payload: {} });
    leads!.push({ companyId, companyName: account.name, opportunityId, rank: index + 1, score: account.score, confidence: 80,
      status: 'Pursue', priority: account.score >= 75 ? 'Urgent' : 'Normal priority', product: offer.name, country: account.country,
      industry: account.industry, nextAction: 'Review the recorded account requirement with the customer.', sourceIds: [sourceId], summary: account.requirement });
    if (account.scenario === 'qualified') continue;
    add('SELECTED', 'selected', 2);
    add('CONTACT_IDENTIFIED', 'contact', 2, { contactId, contactName: account.contact, contactEmail,
      payload: { role: account.role, source: 'Illustrative CRM contact', outreachBasis: 'RECORDED_CONSENT', reviewedBySalesperson: true } });
    const draftId = eventId('draft'), providerMessageId = eventId('provider-message'), threadId = eventId('thread');
    const copy = { contactId, contactName: account.contact, contactEmail, subject: 'Reviewing ' + offer.name + ' requirements',
      body: ['Hi ' + account.contact + ',', account.requirement, 'Could we arrange a discovery discussion?', 'Singtel Enterprise Team'].join('\n\n') };
    add('EMAIL_DRAFTED', 'draft', 3, { ...copy, payload: { draftId, kind: 'initial', generatedBy: 'illustrative_crm', confidence: 0.8 } });
    add('EMAIL_APPROVED', 'approved', 4, { ...copy, payload: { draftId, humanApprovedAt: at(4).toISOString(), approvedBy: 'Sample sales reviewer' } });
    if (account.scenario === 'delivery-error') add('EMAIL_FAILED', 'failed', 5, { ...copy, provider: 'MOCK', payload: { draftId, code: 'SAMPLE_TRANSIENT_FAILURE' } });
    add('EMAIL_PROVIDER_ACCEPTED', 'accepted', 6, { ...copy, provider: 'MOCK', providerMessageId,
      payload: { draftId, kind: 'initial', authorizationMode: 'HUMAN_APPROVED', providerThreadId: threadId, deliveryConfirmed: false } });
    const memory = emptyMemory();
    const record: AiManagementCompanyRecord = { companyId, companyName: account.name, country: account.country, industry: account.industry,
      researchId, opportunityId, product: offer.name, leadScore: account.score, opportunityScore: account.score, leadConfidence: 80,
      priority: account.score >= 75 ? 'Urgent' : 'Normal priority', contactId, contactName: account.contact, contactEmail, contactRole: account.role,
      jurisdiction: account.country === 'India' ? 'IN' : account.country === 'Malaysia' ? 'MY' : 'SG', outreachBasis: 'RECORDED_CONSENT',
      managementState: 'ACTIVE', communicationState: 'FOLLOW_UP_SCHEDULED', activatedAt: at(2), activatedBy: 'sample-import',
      followupAttempts: 0, version: 0, memory, nextActionKind: 'NO_REPLY_FOLLOWUP', nextActionAt: new Date(+now + 2 * DAY),
      nextActionNote: 'Illustrative follow-up; messages can use the test provider only.', lastMessageAt: at(6), lastOutboundAt: at(6),
      scoreHistory: [{ at: at(1).toISOString(), previous: null, score: account.score, reason: 'Illustrative account qualification', sourceEventId: eventId('qualified') }] };
    if (['waiting', 'no-response'].includes(account.scenario)) {
      add('EMAIL_PROVIDER_ACCEPTED', 'followup-accepted', 48, { ...copy, provider: 'MOCK', providerMessageId: providerMessageId + ':followup',
        payload: { draftId: draftId + ':followup', kind: 'followup', isFollowup: true, providerThreadId: threadId, authorizationMode: 'HUMAN_APPROVED' } });
      record.followupAttempts = 1;
      if (account.scenario === 'no-response') Object.assign(record, { managementState: 'COMPLETED', communicationState: 'NO_RESPONSE', nextActionAt: null, nextActionKind: null });
      else add('FOLLOWUP_SCHEDULED', 'followup-scheduled', 49, { contactEmail, payload: { scheduledAt: record.nextActionAt!.toISOString(), aiManaged: true } });
    }
    if (account.reply) {
      const intent = account.scenario === 'converted' || account.scenario === 'meeting' ? 'MEETING_REQUEST' : account.scenario === 'pricing' ? 'PRICING_REQUEST'
        : account.scenario === 'proposal' ? 'PROPOSAL_REQUEST' : account.scenario === 'complaint' ? 'COMPLAINT' : account.scenario === 'declined' ? 'NOT_INTERESTED'
          : account.scenario === 'unsubscribed' ? 'UNSUBSCRIBE' : 'INTERESTED';
      const confirmsRequirement = !['NOT_INTERESTED', 'COMPLAINT', 'UNSUBSCRIBE'].includes(intent);
      const replyText = account.reply + (confirmsRequirement ? '\n\n' + account.requirement : '');
      const replyEvent = add('REPLY_RECEIVED', 'reply', 20, { ...copy, body: replyText, provider: 'MOCK', payload: { channel: 'synthetic_simulation', providerThreadId: threadId } });
      add('REPLY_CLASSIFIED', 'classified', 21, { contactEmail, intent, sentiment: ['NOT_INTERESTED', 'COMPLAINT', 'UNSUBSCRIBE'].includes(intent) ? 'NEGATIVE' : 'POSITIVE',
        confidence: 0.9, sourceIds: [replyEvent.eventId], payload: { analysis: { intent, requiresHuman: true, confidence: 0.9, buyingSignals: [account.reply], questionsAsked: [],
          requirements: confirmsRequirement ? [{ text: account.requirement, evidenceText: account.requirement }] : [], requestedNextAction: 'Review the recorded customer reply.' } } });
      add('AGENT_EXECUTION', 'reply-agent', 21, { agent: 'Intelligent Reply Understanding', success: true, executionMs: 340, confidence: 0.9, payload: { requiresHuman: !['NOT_INTERESTED', 'UNSUBSCRIBE'].includes(intent) } });
      if (confirmsRequirement) {
        add('FEEDBACK_CAPTURED', 'feedback', 21, { contactEmail, intent, sourceIds: [replyEvent.eventId], payload: { requirement: account.requirement, verifiedByCustomer: true } });
        add('OPPORTUNITY_UPDATED', 'requirement', 22, { sourceIds: [replyEvent.eventId], payload: { change: 'customer_confirmed_requirement_added', requirement: account.requirement, sourceMessageId: replyEvent.eventId } });
      }
      memory.summary = 'Illustrative account conversation: ' + account.reply;
      memory.requirements = confirmsRequirement ? [{ text: account.requirement, sourceEventId: replyEvent.eventId, at: at(21).toISOString(), serviceIds: [offer.id] }] : [];
      Object.assign(record, { communicationState: 'CUSTOMER_RESPONDED', lastMessageAt: at(20), lastInboundAt: at(20), lastHandledInboundAt: at(21), nextActionAt: null, nextActionKind: null });
      if (['NOT_INTERESTED', 'UNSUBSCRIBE'].includes(intent)) {
        Object.assign(record, { managementState: 'COMPLETED', communicationState: intent === 'UNSUBSCRIBE' ? 'UNSUBSCRIBED' : 'NOT_INTERESTED' });
        if (intent === 'UNSUBSCRIBE') add('SUPPRESSION_ADDED', 'suppression', 22, { contactEmail, payload: { reason: 'Illustrative opt-out' } });
      } else {
        const resolved = account.scenario === 'converted';
        Object.assign(record, { managementState: resolved ? 'COMPLETED' : 'HUMAN_ATTENTION_REQUIRED', humanAttention: !resolved, attentionReason: resolved ? undefined : account.reply });
        const reason = intent === 'COMPLAINT' ? 'COMPLAINT_HANDLING' : intent === 'MEETING_REQUEST' ? 'MEETING_COORDINATION' : intent === 'PRICING_REQUEST' || intent === 'PROPOSAL_REQUEST' ? 'PRICING_APPROVAL' : 'HIGH_VALUE_OPPORTUNITY';
        add('INTERVENTION_CREATED', 'intervention', 22, { contactEmail, contactName: account.contact, reason, priority: intent === 'COMPLAINT' ? 'CRITICAL' : 'HIGH',
          status: resolved ? 'RESOLVED' : 'PENDING', assignedTo: 'Sample account team', payload: { interventionId: eventId('intervention'), replyEventId: replyEvent.eventId, ...(resolved ? { resolutionMs: 3600000 } : {}) } });
        notifications.push({ notificationId: eventId('notification'), eventId: replyEvent.eventId, companyId, companyName: account.name,
          contactName: account.contact, contactEmail, type: intent === 'INTERESTED' ? 'POSITIVE_REPLY' : intent === 'COMPLAINT' ? 'HUMAN_INTERVENTION' : intent,
          priority: intent === 'COMPLAINT' ? 'CRITICAL' : 'HIGH', title: account.name + ': ' + intent.toLowerCase().replace(/_/g, ' '),
          summary: account.reply, latestMessage: account.reply, reason: account.reply, intent, requirements: [account.requirement], buyingSignals: [account.reply],
          requiresAction: true, status: resolved ? 'RESOLVED' : 'OPEN', unread: !resolved, createdAt: at(22) });
      }
      if (intent === 'MEETING_REQUEST') {
        add('MEETING_REQUESTED', 'meeting-requested', 22);
        add('MEETING_SCHEDULED', 'meeting-scheduled', 23, { payload: { scheduledAt: new Date(+now + DAY).toISOString() } });
      }
      if (account.scenario === 'converted') add('CONVERTED', 'converted', 30, { payload: { valueSgd: account.valueSgd, signedOrder: 'Illustrative order', confirmedBy: 'Sample account team' } });
    }
    management.push(record);
  }
  const run: DailyRankingRunRecord = { runId: SHOWCASE_DATASET + ':queue', localDate: now.toISOString().slice(0, 10), status: 'COMPLETED', trigger: 'MANUAL',
    startedAt: now, completedAt: now, target: accounts.length, discovered: accounts.length, ranked: accounts.length, selected: accounts.length,
    rejected: 0, skipped: 0, companyIds: leads!.map(lead => lead.companyId), selectedLeads: leads, queueVersion: SHOWCASE_DATASET };
  return { datasetTag: SHOWCASE_DATASET, events, research, profiles, opportunities, management, notifications, run };
}

/** Insert only this dataset's stable IDs. Never delete, overwrite user activity, call AI, or send mail. */
export async function seedShowcaseData(now = new Date()) {
  const data = buildShowcaseData(now);
  for (const record of data.research) {
    if (env.STORAGE_MODE === 'memory' || !await ResearchSnapshot.exists({ _id: record.id })) await saveResearch(record);
  }
  for (const event of data.events) if (!await findActivityById(event.eventId)) await appendActivity(event);
  for (const record of data.management) if (!await findCompanyManagement(record.companyId)) await saveCompanyManagement(record);
  for (const notification of data.notifications) await createAiNotification(notification);
  if (!await getDailyRankingRun(data.run.runId)) await saveDailyRankingRun(data.run);
  if (env.STORAGE_MODE === 'memory') registerShowcaseRecords(data.profiles, data.opportunities);
  else for (const profile of data.profiles) {
    const { signals, isMockData: _label, ...company } = profile;
    await Company.updateOne({ _id: company._id }, { $setOnInsert: company }, { upsert: true });
    for (const signal of signals) await IntelligenceSignal.updateOne({ _id: signal._id }, { $setOnInsert: signal }, { upsert: true });
    const opportunity = data.opportunities.find(item => item.companyId === company._id)!;
    await Opportunity.updateOne({ _id: opportunity._id }, { $setOnInsert: opportunity }, { upsert: true });
  }
  return { datasetTag: data.datasetTag, companies: data.profiles.length, salesEvents: data.events.length,
    researchSnapshots: data.research.length, aiConversations: data.management.length, notifications: data.notifications.length };
}
