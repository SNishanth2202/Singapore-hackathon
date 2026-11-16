import { env } from '../config/env';
import { SalesActivity, ISalesActivity, REPLY_INTENTS, INTERVENTION_REASONS } from '../models/SalesActivity';
import { requireCloudMongo } from '../models/CloudStorage';
import { findInterventions } from '../salesStore';

export interface AnalyticsFilters {
  startDate: Date; endDate: Date; country?: string; industry?: string; service?: string; agent?: string; status?: string;
  page: number; limit: number;
}

type Counts = { count: number; companies: string[] };
function asSetCount(row: Counts | undefined) { return new Set(row?.companies ?? []).size; }
function percent(numerator: number, denominator: number) { return denominator ? Math.round(numerator / denominator * 1000) / 10 : 0; }
const emptyCounts = () => ({ count: 0, companies: [] as string[] });

function filtered(events: ISalesActivity[], filters: AnalyticsFilters) {
  return events.filter(event => new Date(event.createdAt) >= filters.startDate && new Date(event.createdAt) <= filters.endDate
    && (!filters.country || event.country === filters.country) && (!filters.industry || event.industry === filters.industry)
    && (!filters.service || event.service === filters.service) && (!filters.agent || event.agent === filters.agent)
    && (!filters.status || event.status === filters.status));
}

async function aggregateDatabase(filters: AnalyticsFilters) {
  requireCloudMongo();
  const match: Record<string, unknown> = { createdAt: { $gte: filters.startDate, $lte: filters.endDate } };
  for (const key of ['country', 'industry', 'service', 'agent', 'status'] as const) if (filters[key]) match[key] = filters[key];
  const pipeline: any[] = [{ $match: match }, { $facet: {
    byType: [{ $group: { _id: '$type', count: { $sum: 1 }, companies: { $addToSet: '$companyId' }, isSynthetic: { $max: '$isSynthetic' }, followups: { $sum: { $cond: [{ $or: ['$payload.isFollowup', { $eq: ['$payload.kind', 'followup'] }] }, 1, 0] } } } }],
    timeline: [{ $match: { type: { $in: ['EMAIL_PROVIDER_ACCEPTED', 'EMAIL_FAILED', 'REPLY_RECEIVED'] } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, type: '$type' }, count: { $sum: 1 } } }, { $sort: { '_id.day': 1 } }],
    replies: [{ $match: { type: 'REPLY_CLASSIFIED' } }, { $group: { _id: { intent: '$intent', sentiment: '$sentiment' }, count: { $sum: 1 }, companies: { $addToSet: '$companyId' }, averageConfidence: { $avg: '$confidence' } } }],
    interventions: [{ $match: { type: { $in: ['INTERVENTION_CREATED', 'INTERVENTION_UPDATED'] } } }, { $sort: { createdAt: 1 } },
      { $group: { _id: '$payload.interventionId', event: { $last: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$event' } },
      { $group: { _id: { reason: '$reason', priority: '$priority', status: '$status' }, count: { $sum: 1 }, resolutionMs: { $avg: '$payload.resolutionMs' } } }],
    breakdowns: [{ $match: { type: { $in: ['DISCOVERED', 'QUALIFIED', 'FEEDBACK_CAPTURED'] } } },
      { $group: { _id: { type: '$type', country: '$country', industry: '$industry', service: '$service' }, companies: { $addToSet: '$companyId' }, count: { $sum: 1 }, maxScore: { $max: '$payload.score' } } }],
    agents: [{ $match: { type: 'AGENT_EXECUTION' } }, { $group: { _id: '$agent', total: { $sum: 1 }, succeeded: { $sum: { $cond: ['$success', 1, 0] } }, failed: { $sum: { $cond: ['$success', 0, 1] } }, averageMs: { $avg: '$executionMs' }, lowConfidence: { $sum: { $cond: [{ $lt: ['$confidence', 0.65] }, 1, 0] } }, escalated: { $sum: { $cond: [{ $or: [{ $eq: ['$payload.decision', 'ESCALATE'] }, { $eq: ['$payload.requiresHuman', true] }] }, 1, 0] } } } }],
    responseTimes: [{ $match: { type: { $in: ['EMAIL_PROVIDER_ACCEPTED', 'REPLY_RECEIVED'] } } },
      { $group: { _id: '$companyId', sent: { $min: { $cond: [{ $eq: ['$type', 'EMAIL_PROVIDER_ACCEPTED'] }, '$createdAt', null] } }, replied: { $min: { $cond: [{ $eq: ['$type', 'REPLY_RECEIVED'] }, '$createdAt', null] } } } },
      { $match: { sent: { $ne: null }, replied: { $ne: null } } }, { $project: { timeMs: { $subtract: ['$replied', '$sent'] } } }, { $group: { _id: null, averageMs: { $avg: '$timeMs' } } }],
    drafts: [{ $match: { type: { $in: ['EMAIL_DRAFTED', 'EMAIL_APPROVED'] } } }, { $sort: { createdAt: 1 } },
      { $group: { _id: '$payload.draftId', lastType: { $last: '$type' } } }, { $match: { lastType: 'EMAIL_DRAFTED' } }, { $count: 'count' }],
  } }];
  const [result] = await SalesActivity.aggregate(pipeline);
  return result ?? {};
}

export function aggregateMemory(events: ISalesActivity[], filters: AnalyticsFilters) {
  const rows = filtered(events, filters);
  const group = (key: (event: ISalesActivity) => string) => {
    const map = new Map<string, { count: number; companies: Set<string> }>();
    for (const event of rows) { const id = key(event); const value = map.get(id) ?? { count: 0, companies: new Set<string>() }; value.count++; value.companies.add(event.companyId); map.set(id, value); }
    return [...map].map(([_id, v]) => ({ _id, count: v.count, companies: [...v.companies] }));
  };
  const byType = group(event => event.type).map(row => ({ ...row,
    isSynthetic: rows.some(event => event.type === row._id && event.isSynthetic),
    followups: rows.filter(event => event.type === row._id && (event.payload.isFollowup || event.payload.kind === 'followup')).length }));
  const timelineMap = new Map<string, number>();
  for (const event of rows.filter(event => ['EMAIL_PROVIDER_ACCEPTED', 'EMAIL_FAILED', 'REPLY_RECEIVED'].includes(event.type))) {
    const day = new Date(event.createdAt).toISOString().slice(0, 10), key = `${day}|${event.type}`; timelineMap.set(key, (timelineMap.get(key) ?? 0) + 1);
  }
  const replies = group(event => event.type === 'REPLY_CLASSIFIED' ? `${event.intent ?? 'OTHER'}|${event.sentiment ?? 'NEUTRAL'}` : '');
  const activeInterventions = new Map<string, ISalesActivity>();
  for (const event of rows) if (['INTERVENTION_CREATED', 'INTERVENTION_UPDATED'].includes(event.type)) activeInterventions.set(String(event.payload.interventionId), event);
  const interventionGroups = new Map<string, { count: number; resolutionMs: number[] }>();
  for (const event of activeInterventions.values()) { const key = `${event.reason}|${event.priority}|${event.status}`; const value = interventionGroups.get(key) ?? { count: 0, resolutionMs: [] }; value.count++; if (typeof event.payload.resolutionMs === 'number') value.resolutionMs.push(event.payload.resolutionMs); interventionGroups.set(key, value); }
  const breakdowns = group(event => ['DISCOVERED', 'QUALIFIED', 'FEEDBACK_CAPTURED'].includes(event.type)
    ? JSON.stringify({ type: event.type, country: event.country ?? null, industry: event.industry ?? null, service: event.service ?? null }) : '')
    .filter(row => row._id).map(row => ({ ...row, _id: JSON.parse(row._id) }));
  const agentsMap = new Map<string, ISalesActivity[]>();
  for (const event of rows.filter(event => event.type === 'AGENT_EXECUTION')) agentsMap.set(event.agent ?? 'Unknown agent', [...(agentsMap.get(event.agent ?? 'Unknown agent') ?? []), event]);
  const byCompany = new Map<string, { sent: number[]; replied: number[] }>();
  for (const event of rows.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' || event.type === 'REPLY_RECEIVED')) { const value = byCompany.get(event.companyId) ?? { sent: [], replied: [] }; value[event.type === 'EMAIL_PROVIDER_ACCEPTED' ? 'sent' : 'replied'].push(+new Date(event.createdAt)); byCompany.set(event.companyId, value); }
  const times = [...byCompany.values()].filter(value => value.sent.length && value.replied.length).map(value => Math.min(...value.replied) - Math.min(...value.sent));
  const drafts = new Map<string, string>();
  for (const event of rows.filter(event => event.type === 'EMAIL_DRAFTED' || event.type === 'EMAIL_APPROVED')) drafts.set(String(event.payload.draftId), event.type);
  return {
    byType,
    timeline: [...timelineMap].map(([key, count]) => { const [day, type] = key.split('|'); return { _id: { day, type }, count }; }),
    replies: [...new Set(replies.map(x => x._id).filter(Boolean))].map(key => { const [intent, sentiment] = key.split('|'); const match = replies.find(x => x._id === key)!; return { _id: { intent, sentiment }, count: match.count, companies: match.companies }; }),
    interventions: [...interventionGroups].map(([key, v]) => { const [reason, priority, status] = key.split('|'); return { _id: { reason, priority, status }, count: v.count, resolutionMs: v.resolutionMs.length ? v.resolutionMs.reduce((a, b) => a + b, 0) / v.resolutionMs.length : null }; }),
    breakdowns,
    agents: [...agentsMap].map(([_id, list]) => ({ _id, total: list.length, succeeded: list.filter(e => e.success).length, failed: list.filter(e => !e.success).length, averageMs: list.length ? list.reduce((sum, e) => sum + (e.executionMs ?? 0), 0) / list.length : 0, lowConfidence: list.filter(e => (e.confidence ?? 1) < 0.65).length,
      escalated: list.filter(event => event.payload.decision === 'ESCALATE' || event.payload.requiresHuman === true).length })),
    responseTimes: times.length ? [{ averageMs: times.reduce((a, b) => a + b, 0) / times.length }] : [],
    drafts: [{ count: [...drafts.values()].filter(type => type === 'EMAIL_DRAFTED').length }],
  };
}

export async function getSalesAnalytics(filters: AnalyticsFilters) {
  const current = env.STORAGE_MODE === 'memory' ? aggregateMemory(await import('../salesStore').then(m => m.allActivityEvents()), filters) : await aggregateDatabase(filters);
  const range = filters.endDate.getTime() - filters.startDate.getTime();
  const previousFilters = { ...filters, endDate: new Date(filters.startDate.getTime() - 1), startDate: new Date(filters.startDate.getTime() - range - 1) };
  const previous = env.STORAGE_MODE === 'memory' ? aggregateMemory(await import('../salesStore').then(m => m.allActivityEvents()), previousFilters) : await aggregateDatabase(previousFilters);
  const eventCounts = new Map<string, Counts>();
  for (const row of current.byType ?? []) eventCounts.set(String(row._id), { count: row.count ?? 0, companies: row.companies ?? [] });
  const previousCounts = new Map<string, Counts>();
  for (const row of previous.byType ?? []) previousCounts.set(String(row._id), { count: row.count ?? 0, companies: row.companies ?? [] });
  const unique = (type: string, source = eventCounts) => asSetCount(source.get(type));
  const count = (type: string, source = eventCounts) => source.get(type)?.count ?? 0;
  const replies = current.replies ?? [];
  const intent = (value: string) => replies.filter((row: any) => row._id?.intent === value).reduce((sum: number, row: any) => sum + (row.count ?? 0), 0);
  const companiesForIntent = (value: string) => new Set(replies.filter((row: any) => row._id?.intent === value).flatMap((row: any) => row.companies ?? [])).size;
  const interventionRows = current.interventions ?? [];
  const interventions = (status?: string, priority?: string) => interventionRows.filter((row: any) => (!status || row._id?.status === status) && (!priority || row._id?.priority === priority)).reduce((sum: number, row: any) => sum + (row.count ?? 0), 0);
  const contacted = unique('EMAIL_PROVIDER_ACCEPTED');
  const replied = unique('REPLY_RECEIVED');
  const positiveIntents = new Set(['INTERESTED', 'MEETING_REQUEST', 'PROPOSAL_REQUEST', 'SERVICE_REQUEST', 'PRICING_REQUEST', 'PROVIDER_DISSATISFACTION']);
  const positiveCompanies = (aggregation: any) => new Set<string>((aggregation.replies ?? []).filter((row: any) => positiveIntents.has(row._id?.intent)).flatMap((row: any) => row.companies ?? []));
  const funnelStages = [
    ['Companies Discovered', 'DISCOVERED'], ['Companies Qualified', 'QUALIFIED'], ['Companies Selected', 'SELECTED'],
    ['Outreach Authorised', 'EMAIL_APPROVED'], ['Emails Sent (provider accepted)', 'EMAIL_PROVIDER_ACCEPTED'], ['Companies Responded', 'REPLY_RECEIVED'],
    ['Interested Companies', 'INTERESTED'], ['Meetings Requested', 'MEETING_REQUESTED'], ['Meetings Scheduled', 'MEETING_SCHEDULED'], ['Converted Opportunities', 'CONVERTED'],
  ] as const;
  const cohorts = (aggregation: any) => {
    let cohort: Set<string> | undefined;
    return funnelStages.map(([, key]) => {
      const eligible = key === 'INTERESTED' ? positiveCompanies(aggregation) : new Set<string>((aggregation.byType ?? [])
        .filter((row: any) => row._id === key || (key === 'EMAIL_APPROVED' && row._id === 'EMAIL_AUTONOMOUS_AUTHORIZED'))
        .flatMap((row: any) => row.companies ?? []));
      cohort = cohort ? new Set([...cohort].filter(id => eligible.has(id))) : eligible;
      return cohort.size;
    });
  };
  const currentCohorts = cohorts(current), previousCohorts = cohorts(previous);
  const funnel = funnelStages.map(([name], index) => {
    const value = currentCohorts[index], before = currentCohorts[Math.max(0, index - 1)];
    return { name, companies: value, conversionPct: index ? percent(value, before) : 100,
      dropoffPct: index ? percent(before - value, before) : 0, previousPeriodCompanies: previousCohorts[index] };
  });
  const metrics = {
    totalCompaniesDiscovered: unique('DISCOVERED'), newCompaniesDiscovered: unique('DISCOVERED'), qualifiedCompanies: unique('QUALIFIED'),
    companiesSelected: unique('SELECTED'), awaitingQualification: Math.max(0, unique('DISCOVERED') - unique('QUALIFIED')),
    totalOutreachEmailsSent: count('EMAIL_PROVIDER_ACCEPTED'), emailsAwaitingApproval: current.drafts?.[0]?.count ?? 0,
    emailsAcceptedByProvider: count('EMAIL_PROVIDER_ACCEPTED'), failedEmailAttempts: count('EMAIL_FAILED'), uniqueCompaniesContacted: contacted,
    totalFollowupsSent: count('EMAIL_PROVIDER_ACCEPTED') ? current.byType?.find((row: any) => row._id === 'EMAIL_PROVIDER_ACCEPTED')?.followups ?? 0 : 0,
    totalRepliesReceived: count('REPLY_RECEIVED'), uniqueCompaniesThatReplied: replied,
    positiveResponses: intent('INTERESTED') + intent('MEETING_REQUEST') + intent('REQUEST_FOR_INFORMATION') + intent('REFERRAL'),
    negativeResponses: intent('NOT_INTERESTED') + intent('COMPLAINT'), meetingRequests: intent('MEETING_REQUEST'), informationRequests: intent('REQUEST_FOR_INFORMATION'), unsubscribeRequests: intent('UNSUBSCRIBE'),
    totalInterventionsRequired: interventions(), pendingInterventions: interventionRows.filter((row: any) => !['RESOLVED', 'CLOSED'].includes(row._id?.status)).reduce((sum: number, row: any) => sum + row.count, 0),
    highPriorityInterventions: interventionRows.filter((row: any) => !['RESOLVED', 'CLOSED'].includes(row._id?.status) && ['HIGH', 'CRITICAL'].includes(row._id?.priority)).reduce((sum: number, row: any) => sum + row.count, 0),
    interventionsInProgress: interventions('IN_PROGRESS'), resolvedInterventions: interventions('RESOLVED'),
    averageInterventionResolutionMs: (() => { const resolved = interventionRows.filter((row: any) => row._id?.status === 'RESOLVED' && typeof row.resolutionMs === 'number'); return resolved.length ? Math.round(resolved.reduce((sum: number, row: any) => sum + row.resolutionMs * row.count, 0) / resolved.reduce((sum: number, row: any) => sum + row.count, 0)) : null; })(),
    interestedCompanies: positiveCompanies(current).size, meetingsRequested: unique('MEETING_REQUESTED'), meetingsScheduled: unique('MEETING_SCHEDULED'),
    qualifiedSalesOpportunities: unique('QUALIFIED'), convertedOpportunities: unique('CONVERTED'), lostOrDisqualifiedCompanies: unique('DISQUALIFIED'),
    responseRatePct: percent(new Set((eventCounts.get('REPLY_RECEIVED')?.companies ?? []).filter(id => eventCounts.get('EMAIL_PROVIDER_ACCEPTED')?.companies.includes(id))).size, contacted),
    positiveResponseRatePct: percent([...positiveCompanies(current)].filter(id => eventCounts.get('EMAIL_PROVIDER_ACCEPTED')?.companies.includes(id)).length, contacted),
    failedEmailRatePct: percent(count('EMAIL_FAILED'), count('EMAIL_PROVIDER_ACCEPTED') + count('EMAIL_FAILED')),
    averageTimeToFirstReplyMs: current.responseTimes?.[0]?.averageMs ? Math.round(current.responseTimes[0].averageMs) : null,
  };
  const timeline = (current.timeline ?? []).map((row: any) => ({ date: row._id.day, type: row._id.type, count: row.count }));
  const intentDistribution = REPLY_INTENTS.map(value => ({ intent: value, count: intent(value), companies: companiesForIntent(value) }));
  const sentimentDistribution = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'].map(sentiment => ({ sentiment, count: replies.filter((row: any) => row._id?.sentiment === sentiment).reduce((sum: number, row: any) => sum + row.count, 0) }));
  const groupBreakdown = (field: 'country' | 'industry' | 'service', type: string) => {
    const groups = new Map<string, Set<string>>();
    for (const row of current.breakdowns ?? []) {
      if (row._id?.type !== type || !row._id[field]) continue;
      const value = String(row._id[field]), ids = groups.get(value) ?? new Set<string>();
      for (const id of row.companies ?? []) ids.add(id);
      groups.set(value, ids);
    }
    return [...groups].map(([value, ids]) => ({ [field]: value, count: ids.size }));
  };
  const latestInterventions = await findInterventions({ page: filters.page, limit: filters.limit, status: filters.status, assignedTo: undefined, priority: undefined, reason: undefined });
  const agentPerformance = (current.agents ?? []).map((row: any) => ({ agent: row._id, runs: row.total, succeeded: row.succeeded, failed: row.failed, averageExecutionMs: Math.round(row.averageMs ?? 0), lowConfidenceClassifications: row.lowConfidence, automationRatePct: percent(row.succeeded, row.total), humanEscalationRatePct: percent(row.escalated ?? 0, row.total) }));
  const insights = [] as { insight: string; supportingMetric: string; period: string; recommendedAction: string; confidence: number }[];
  if (metrics.pendingInterventions > 0) insights.push({ insight: `${metrics.pendingInterventions} human intervention(s) are pending.`, supportingMetric: 'pendingInterventions', period: `${filters.startDate.toISOString()} to ${filters.endDate.toISOString()}`, recommendedAction: 'Review the intervention queue and assign an owner.', confidence: 1 });
  if (metrics.emailsAcceptedByProvider > 0) insights.push({ insight: `${metrics.responseRatePct}% of contacted companies have replied.`, supportingMetric: 'responseRatePct', period: `${filters.startDate.toISOString()} to ${filters.endDate.toISOString()}`, recommendedAction: 'Review reply intent and follow up through the approved sales workflow.', confidence: 1 });
  if (!insights.length) insights.push({ insight: 'No sales activity is recorded for this reporting period.', supportingMetric: 'totalCompaniesDiscovered', period: `${filters.startDate.toISOString()} to ${filters.endDate.toISOString()}`, recommendedAction: 'Run company discovery or the labelled synthetic demo to populate the worklist.', confidence: 1 });
  return { generatedAt: new Date().toISOString(), period: { startDate: filters.startDate.toISOString(), endDate: filters.endDate.toISOString(), timezone: 'UTC' }, filters: { country: filters.country ?? null, industry: filters.industry ?? null, service: filters.service ?? null, agent: filters.agent ?? null, status: filters.status ?? null },
    dataMode: env.STORAGE_MODE === 'memory' ? 'memory_preview' : 'mongodb', containsSyntheticData: (current.byType ?? []).some((row: any) => row.isSynthetic), metrics, funnel,
    funnelDenominator: 'One nested cohort of companies discovered in this period. Each stage contains only companies recorded at all preceding stages. Outreach authorisation includes human approval and explicit autonomous authorisation. Positive interest includes meeting, proposal, pricing and service requests. Email counts are reported separately.',
    timeline, intentDistribution, sentimentDistribution,
    interventions: { total: metrics.totalInterventionsRequired, pending: metrics.pendingInterventions, highPriority: metrics.highPriorityInterventions, inProgress: metrics.interventionsInProgress, resolved: metrics.resolvedInterventions, averageResolutionMs: metrics.averageInterventionResolutionMs,
      byReason: INTERVENTION_REASONS.map(reason => ({ reason, count: interventionRows.filter((row: any) => row._id?.reason === reason).reduce((sum: number, row: any) => sum + row.count, 0) })),
      byPriority: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(priority => ({ priority, count: interventions(undefined, priority) })),
      byAssignee: [], items: latestInterventions.data, pagination: { page: filters.page, limit: filters.limit, total: latestInterventions.total } },
    opportunities: { byCountry: groupBreakdown('country', 'QUALIFIED'), byIndustry: groupBreakdown('industry', 'QUALIFIED'), byService: groupBreakdown('service', 'QUALIFIED'),
      highestScoring: [], newRequirements: groupBreakdown('service', 'FEEDBACK_CAPTURED'), lifecycle: funnel },
    geography: groupBreakdown('country', 'DISCOVERED'), agentPerformance, insights,
    definitions: { providerAccepted: 'Email provider accepted the request for processing; delivery to a recipient inbox is not confirmed.', uniqueCompanyReply: 'Distinct companyId with at least one REPLY_RECEIVED event in the period.', sentiment: 'Positive/neutral/negative tone, separate from reply intent.', meeting: 'Meeting request and meeting scheduled are separate events.' } };
}
