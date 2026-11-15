import { AiManagementCompanyRecord } from '../models/AiManagement';
import { ISalesActivity } from '../models/SalesActivity';
import { allActivityEvents, findCompanyActivities } from '../salesStore';
import { buildCompanyBrief } from '../sales/agents/company-context.agent';
import { resolveSalesContext } from '../sales/context';
import { emailProviderStatus } from '../sales/email-provider';
import { AppError } from '../utils/errors';
import { assessReadiness } from './orchestrator';
import { AI_AUTHORIZATION_STATEMENT, AI_AUTHORIZATION_VERSION, buyingIntentLevel, OUTREACH_BASES } from './policy';
import { latestSelectedLeads } from './scheduler';
import { allAiNotifications, findCompanyManagement, getAiManagementSettings, listAiNotifications, listCompanyManagement, listDailyRankingRuns } from './store';

const lower = (value?: string | null) => (value ?? '').toLowerCase();

export interface CompanyListFilters {
  status?: string; industry?: string; country?: string; priority?: string; from?: string; to?: string; scope?: 'all' | 'managed' | 'queue'; search?: string;
}

/** The daily lead queue merged with every company's AI-management record. */
export async function listManagedCompanies(filters: CompanyListFilters = {}) {
  const [leads, records, notifications, events] = await Promise.all([latestSelectedLeads(), listCompanyManagement(),
    allAiNotifications(), allActivityEvents()]);
  const recordById = new Map(records.map(record => [record.companyId, record]));
  const ids = new Set([...leads.map(lead => lead.companyId), ...records.map(record => record.companyId)]);
  const servicesByCompany = new Map<string, Set<string>>();
  for (const event of events) if (event.type === 'QUALIFIED' && event.service) {
    servicesByCompany.set(event.companyId, (servicesByCompany.get(event.companyId) ?? new Set()).add(event.service));
  }
  const rows = [...ids].map(companyId => {
    const lead = leads.find(item => item.companyId === companyId);
    const record = recordById.get(companyId);
    const open = notifications.filter(item => item.companyId === companyId && item.requiresAction && item.status !== 'RESOLVED');
    return {
      companyId, companyName: record?.companyName ?? lead?.companyName ?? companyId,
      country: record?.country ?? lead?.country ?? null, industry: record?.industry ?? lead?.industry ?? null,
      priority: record?.priority ?? lead?.priority ?? null, leadScore: record?.leadScore ?? lead?.score ?? null,
      leadConfidence: record?.leadConfidence ?? lead?.confidence ?? null, rank: lead?.rank ?? null, queuedOn: lead?.localDate ?? null,
      opportunityId: record?.opportunityId ?? lead?.opportunityId ?? null, opportunitySummary: lead?.summary ?? lead?.nextAction ?? null,
      recommendedServices: [...new Set([...(lead?.product ? [lead.product] : []), ...(servicesByCompany.get(companyId) ?? [])])],
      opportunityScore: record?.opportunityScore ?? lead?.score ?? null,
      managementState: record?.managementState ?? 'OFF', communicationState: record?.communicationState ?? 'READY',
      humanAttention: !!record?.humanAttention || open.length > 0, attentionReason: record?.attentionReason ?? open[0]?.reason ?? null,
      openNotifications: open.length, contactName: record?.contactName ?? null, nextActionAt: record?.nextActionAt ?? null,
      nextActionKind: record?.nextActionKind ?? null, lastMessageAt: record?.lastMessageAt ?? null, activatedAt: record?.activatedAt ?? null,
      followupAttempts: record?.followupAttempts ?? 0, lastError: record?.lastError ?? null, inDailyQueue: !!lead,
    };
  });
  const from = filters.from ? +new Date(filters.from) : null;
  const to = filters.to ? +new Date(filters.to) : null;
  const search = lower(filters.search);
  return rows.filter(row => (!filters.status || row.managementState === filters.status || row.communicationState === filters.status
      || (filters.status === 'HUMAN_ATTENTION' && row.humanAttention))
    && (!filters.industry || lower(row.industry) === lower(filters.industry))
    && (!filters.country || lower(row.country) === lower(filters.country))
    && (!filters.priority || lower(row.priority) === lower(filters.priority))
    && (filters.scope !== 'managed' || row.managementState !== 'OFF' || !!row.activatedAt)
    && (filters.scope !== 'queue' || row.inDailyQueue)
    && (!search || lower(row.companyName).includes(search))
    && (from === null || +new Date(String(row.activatedAt ?? row.queuedOn ?? 0)) >= from)
    && (to === null || +new Date(String(row.activatedAt ?? row.queuedOn ?? 0)) <= to))
    .sort((a, b) => Number(b.humanAttention) - Number(a.humanAttention) || (a.rank ?? 9999) - (b.rank ?? 9999) || a.companyName.localeCompare(b.companyName));
}

export async function companyDetail(companyId: string) {
  const context = await resolveSalesContext(companyId);
  const events = await findCompanyActivities(context.companyId);
  const [record, readiness, brief, lead, settings, notifications] = await Promise.all([
    findCompanyManagement(context.companyId), assessReadiness(context, events), buildCompanyBrief(context, events),
    latestSelectedLeads().then(rows => rows.find(row => row.companyId === context.companyId) ?? null), getAiManagementSettings(),
    listAiNotifications({ companyId: context.companyId, page: 1, limit: 50 }),
  ]);
  return {
    company: { companyId: context.companyId, companyName: context.companyName, country: record?.country ?? lead?.country ?? context.country ?? null,
      industry: record?.industry ?? lead?.industry ?? context.industry ?? null, website: context.website ?? null, description: context.description ?? null,
      isSynthetic: context.isSynthetic ?? false },
    management: record, readiness, brief, lead,
    opportunities: events.filter(event => event.type === 'QUALIFIED').map(event => ({ opportunityId: event.opportunityId, service: event.service, qualification: event.payload.qualification ?? null })),
    opportunityUpdates: events.filter(event => event.type === 'OPPORTUNITY_UPDATED').map(event => ({ eventId: event.eventId, createdAt: event.createdAt, ...event.payload })),
    notifications: notifications.data,
    activation: { statement: AI_AUTHORIZATION_STATEMENT, version: AI_AUTHORIZATION_VERSION, outreachBases: OUTREACH_BASES,
      consentOnlyJurisdictions: settings.consentOnlyJurisdictions, globalOutboundEnabled: settings.globalOutboundEnabled },
    emailProvider: emailProviderStatus(),
  };
}

function messageView(event: ISalesActivity, events: ISalesActivity[]) {
  if (event.type === 'REPLY_RECEIVED') {
    const classification = events.find(item => item.type === 'REPLY_CLASSIFIED' && item.sourceIds.includes(event.eventId));
    const analysis = classification?.payload.analysis as Parameters<typeof buyingIntentLevel>[0] & { requirements?: { text: string }[]; buyingSignals: string[]; requestedNextAction?: string; questionsAsked?: string[] } | undefined;
    const handled = events.find(item => item.type === 'AGENT_EXECUTION' && item.eventId === 'agent:ai-inbound:' + event.eventId.replace(/^reply:/, ''));
    return { id: event.eventId, direction: 'INBOUND' as const, at: event.createdAt, from: event.contactEmail, contactName: event.contactName, subject: event.subject,
      body: event.body, threadId: String(event.payload.providerThreadId ?? ''), channel: event.payload.channel,
      interpretation: classification ? { intent: classification.intent, sentiment: classification.sentiment, confidence: classification.confidence,
        buyingIntent: analysis ? buyingIntentLevel(analysis) : null, buyingSignals: analysis?.buyingSignals ?? [], requirements: (analysis?.requirements ?? []).map(item => item.text),
        questions: analysis?.questionsAsked ?? [], requestedNextAction: analysis?.requestedNextAction ?? null } : null,
      aiDecision: handled ? { decision: handled.payload.decision, reason: handled.payload.reason } : null };
  }
  return { id: event.eventId, direction: 'OUTBOUND' as const, at: event.createdAt, to: event.contactEmail, contactName: event.contactName, subject: event.subject,
    body: event.body, threadId: String(event.payload.providerThreadId ?? event.providerMessageId ?? ''), kind: event.payload.kind,
    followupKind: event.payload.followupKind ?? null, sentBy: event.payload.authorizationMode === 'AUTONOMOUS' ? 'AI' : 'SALESPERSON',
    provider: event.provider, providerMessageId: event.providerMessageId, deliveryStatus: 'PROVIDER_ACCEPTED',
    synthetic: event.provider === 'MOCK', generatedBy: event.payload.generatedBy ?? null, rationale: event.payload.rationale ?? null };
}

export async function companyConversations(companyId: string) {
  const events = await findCompanyActivities(companyId);
  if (!events.length) throw new AppError('Company is not in the sales workflow.', 404, 'WORKFLOW_COMPANY_NOT_FOUND');
  const messages = events.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' || event.type === 'REPLY_RECEIVED').map(event => messageView(event, events));
  const threads = new Map<string, typeof messages>();
  for (const message of messages) threads.set(message.threadId || 'unthreaded', [...(threads.get(message.threadId || 'unthreaded') ?? []), message]);
  return {
    companyId, messages,
    threads: [...threads.entries()].map(([threadId, items]) => ({ threadId, messageCount: items.length, lastMessageAt: items.at(-1)?.at, subject: items[0]?.subject })),
    pendingDrafts: events.filter(event => event.type === 'EMAIL_DRAFTED' && event.payload.requiresApproval === true
      && !events.some(other => ['EMAIL_APPROVED', 'EMAIL_REJECTED'].includes(other.type) && other.payload.draftId === event.payload.draftId))
      .map(event => ({ draftId: event.payload.draftId, kind: event.payload.kind, subject: event.subject, body: event.body, createdAt: event.createdAt })),
  };
}

export async function companyTimeline(companyId: string) {
  const [events, record, notifications] = await Promise.all([findCompanyActivities(companyId), findCompanyManagement(companyId),
    listAiNotifications({ companyId, page: 1, limit: 100 })]);
  if (!events.length) throw new AppError('Company is not in the sales workflow.', 404, 'WORKFLOW_COMPANY_NOT_FOUND');
  const describe = (event: ISalesActivity): string => {
    switch (event.type) {
      case 'EMAIL_PROVIDER_ACCEPTED': return (event.payload.authorizationMode === 'AUTONOMOUS' ? 'AI sent ' : 'Salesperson sent ') + String(event.payload.kind ?? 'email') + ': ' + (event.subject ?? '');
      case 'REPLY_RECEIVED': return 'Customer replied: ' + String(event.body ?? '').slice(0, 160);
      case 'REPLY_CLASSIFIED': return 'Interpreted as ' + String(event.intent ?? '').replace(/_/g, ' ').toLowerCase() + ' (' + String(event.sentiment ?? '').toLowerCase() + ' tone)';
      case 'AI_MANAGEMENT_STATE_CHANGED': return `${event.payload.fromManagement} → ${event.payload.toManagement} · ${event.payload.fromCommunication} → ${event.payload.toCommunication}: ${event.payload.reason}`;
      case 'FOLLOWUP_SCHEDULED': return 'Follow-up scheduled for ' + String(event.payload.scheduledAt ?? '').slice(0, 16).replace('T', ' ') + (event.payload.reason ? ' (' + event.payload.reason + ')' : '');
      case 'FOLLOWUP_CANCELLED': return 'Scheduled follow-up cancelled (' + String(event.payload.reason ?? '') + ')';
      case 'OPPORTUNITY_UPDATED': return event.payload.change === 'opportunity_score_recalculated' ? `Opportunity score ${event.payload.previous} → ${event.payload.score}: ${event.payload.reason}`
        : event.payload.change === 'singtel_services_reevaluated' ? 'Singtel services re-evaluated: ' + ((event.payload.matchedServiceIds as string[] | undefined)?.join(', ') || 'no catalogue match')
          : 'Requirement added: ' + String(event.payload.requirement ?? '');
      case 'SUPPRESSION_ADDED': return 'Contact suppressed: ' + String(event.payload.reason ?? '');
      case 'OUTREACH_BLOCKED': return 'Outreach blocked: ' + String(event.payload.message ?? '');
      case 'AGENT_EXECUTION': return (event.agent ?? 'Agent') + (event.success === false ? ' failed' : ' ran') + (event.payload.decision ? ': ' + event.payload.decision : '');
      case 'INTERVENTION_CREATED': return 'Intervention created: ' + String(event.reason ?? '').replace(/_/g, ' ').toLowerCase();
      default: return event.type.replace(/_/g, ' ').toLowerCase();
    }
  };
  return {
    companyId, management: record,
    events: [...events].reverse().map(event => ({ eventId: event.eventId, type: event.type, at: event.createdAt, agent: event.agent ?? null,
      success: event.success ?? null, summary: describe(event), intent: event.intent ?? null, isSynthetic: event.isSynthetic })),
    stateHistory: record?.history ?? [], scoreHistory: record?.scoreHistory ?? [], memory: record?.memory ?? null,
    agentExecutions: events.filter(event => event.type === 'AGENT_EXECUTION').reverse().slice(0, 100)
      .map(event => ({ eventId: event.eventId, agent: event.agent, success: event.success, at: event.createdAt, confidence: event.confidence ?? null, payload: event.payload })),
    notifications: notifications.data,
  };
}

export async function listFollowUps() {
  const records = await listCompanyManagement();
  return records.filter(record => record.nextActionAt && record.nextActionKind && record.managementState !== 'OFF')
    .map(record => ({ companyId: record.companyId, companyName: record.companyName, contactName: record.contactName ?? null,
      managementState: record.managementState, communicationState: record.communicationState, nextActionKind: record.nextActionKind,
      nextActionAt: record.nextActionAt, note: record.nextActionNote ?? null, followupAttempts: record.followupAttempts,
      willRun: record.managementState === 'ACTIVE' }))
    .sort((a, b) => +new Date(a.nextActionAt!) - +new Date(b.nextActionAt!));
}

/** Real aggregates. Counts distinguish unique companies from messages and provider acceptance from confirmed delivery. */
export async function aiManagementAnalytics(range: { from?: string; to?: string } = {}) {
  const from = range.from ? +new Date(range.from) : 0;
  const to = range.to ? +new Date(range.to) : Number.MAX_SAFE_INTEGER;
  const inRange = (value: unknown) => { const at = +new Date(String(value)); return at >= from && at <= to; };
  const [records, runs, notifications, allEvents, settings] = await Promise.all([listCompanyManagement(), listDailyRankingRuns(365),
    allAiNotifications(), allActivityEvents(), getAiManagementSettings()]);
  const managedIds = new Set(records.filter(record => record.activatedAt).map(record => record.companyId));
  const events = allEvents.filter(event => managedIds.has(event.companyId) && inRange(event.createdAt));
  const accepted = events.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED');
  const replies = events.filter(event => event.type === 'REPLY_RECEIVED');
  const classified = events.filter(event => event.type === 'REPLY_CLASSIFIED');
  const unique = (list: ISalesActivity[]) => new Set(list.map(event => event.companyId)).size;
  const count = (state: (record: AiManagementCompanyRecord) => boolean) => records.filter(state).length;
  const positiveIntents = ['INTERESTED', 'MEETING_REQUEST', 'PROPOSAL_REQUEST', 'SERVICE_REQUEST', 'PROVIDER_DISSATISFACTION'];
  const completedRuns = runs.filter(run => run.status === 'COMPLETED' && inRange(run.startedAt));
  const latestRun = runs.find(run => run.status === 'COMPLETED') ?? null;
  const intentCounts = classified.reduce<Record<string, number>>((acc, event) => { acc[event.intent ?? 'UNKNOWN'] = (acc[event.intent ?? 'UNKNOWN'] ?? 0) + 1; return acc; }, {});
  const managementStates = records.reduce<Record<string, number>>((acc, record) => { acc[record.managementState] = (acc[record.managementState] ?? 0) + 1; return acc; }, {});
  const communicationStates = records.filter(record => record.activatedAt).reduce<Record<string, number>>((acc, record) => { acc[record.communicationState] = (acc[record.communicationState] ?? 0) + 1; return acc; }, {});
  const aiNotifications = notifications.filter(item => item.companyId !== 'global' && inRange(item.createdAt));
  return {
    range: { from: range.from ?? null, to: range.to ?? null },
    leadRanking: { dailyTarget: settings.dailyTarget, scheduledRankingEnabled: settings.dailyRankingEnabled, runs: completedRuns.length,
      companiesRanked: completedRuns.reduce((sum, run) => sum + run.ranked, 0), companiesQueued: completedRuns.reduce((sum, run) => sum + run.selected, 0),
      latestRun: latestRun ? { runId: latestRun.runId, localDate: latestRun.localDate, completedAt: latestRun.completedAt, target: latestRun.target ?? settings.dailyTarget,
        discovered: latestRun.discovered, ranked: latestRun.ranked, selected: latestRun.selected, rejected: latestRun.rejected, skipped: latestRun.skipped } : null },
    companies: {
      selectedForAiManagement: managedIds.size,
      currentlyManaged: count(record => ['ACTIVE', 'PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'ERROR', 'ACTIVATING'].includes(record.managementState)),
      active: count(record => record.managementState === 'ACTIVE'),
      waitingForReply: count(record => record.managementState === 'ACTIVE' && ['WAITING_FOR_REPLY', 'FOLLOW_UP_SCHEDULED', 'OUTREACH_SENT'].includes(record.communicationState)),
      followupsScheduled: count(record => record.managementState === 'ACTIVE' && !!record.nextActionAt && record.nextActionKind !== 'INITIAL_OUTREACH'),
      humanAttention: count(record => record.managementState === 'HUMAN_ATTENTION_REQUIRED'),
      humanHandover: count(record => record.managementState === 'HUMAN_HANDOVER'),
      paused: count(record => record.managementState === 'PAUSED'),
      errors: count(record => record.managementState === 'ERROR'),
      completed: count(record => record.managementState === 'COMPLETED'),
      noResponse: count(record => record.communicationState === 'NO_RESPONSE'),
      notInterested: count(record => record.communicationState === 'NOT_INTERESTED'),
      unsubscribed: count(record => record.communicationState === 'UNSUBSCRIBED'),
      withNewRequirements: unique(events.filter(event => event.type === 'OPPORTUNITY_UPDATED' && event.payload.change === 'customer_confirmed_requirement_added')),
      managementStates, communicationStates,
    },
    emails: {
      providerAccepted: accepted.length, uniqueCompaniesContacted: unique(accepted),
      initialOutreach: accepted.filter(event => event.payload.kind === 'initial').length,
      followups: accepted.filter(event => event.payload.kind === 'followup').length,
      aiReplies: accepted.filter(event => event.payload.kind === 'reply' && event.payload.authorizationMode === 'AUTONOMOUS').length,
      sentByAi: accepted.filter(event => event.payload.authorizationMode === 'AUTONOMOUS').length,
      sentBySalesperson: accepted.filter(event => event.payload.authorizationMode !== 'AUTONOMOUS').length,
      synthetic: accepted.filter(event => event.provider === 'MOCK').length,
      confirmedDelivered: null as number | null,
      deliveryNote: 'Providers report acceptance only; inbox delivery is not confirmed by the integrations.',
      failures: events.filter(event => event.type === 'EMAIL_FAILED').length,
      blocked: events.filter(event => event.type === 'OUTREACH_BLOCKED').length,
    },
    replies: {
      incoming: replies.length, uniqueCompaniesReplied: unique(replies),
      positiveIntent: classified.filter(event => positiveIntents.includes(event.intent ?? '')).length,
      positiveSentiment: classified.filter(event => event.sentiment === 'POSITIVE').length,
      meetingRequests: classified.filter(event => event.intent === 'MEETING_REQUEST').length,
      meetingsScheduled: events.filter(event => event.type === 'MEETING_SCHEDULED').length,
      proposalRequests: classified.filter(event => event.intent === 'PROPOSAL_REQUEST').length,
      pricingRequests: classified.filter(event => event.intent === 'PRICING_REQUEST' || event.intent === 'NEGOTIATION').length,
      unsubscribes: classified.filter(event => event.intent === 'UNSUBSCRIBE').length,
      byIntent: intentCounts,
    },
    outcomes: {
      opportunitiesWithNewRequirements: unique(events.filter(event => event.type === 'OPPORTUNITY_UPDATED')),
      closedDeals: events.filter(event => event.type === 'CONVERTED').length,
      conversationsCompleted: count(record => record.managementState === 'COMPLETED'),
    },
    notifications: {
      humanInterventions: aiNotifications.filter(item => item.requiresAction).length,
      openHumanInterventions: aiNotifications.filter(item => item.requiresAction && item.status !== 'RESOLVED').length,
      unread: aiNotifications.filter(item => item.unread).length,
      byType: aiNotifications.reduce<Record<string, number>>((acc, item) => { acc[item.type] = (acc[item.type] ?? 0) + 1; return acc; }, {}),
    },
    agentErrors: events.filter(event => event.type === 'AGENT_EXECUTION' && event.success === false).length + count(record => record.managementState === 'ERROR'),
    globalOutboundEnabled: settings.globalOutboundEnabled,
    emailProvider: emailProviderStatus(),
  };
}
