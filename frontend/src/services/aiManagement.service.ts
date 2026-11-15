import axios from 'axios'
import api from './api'

export type ManagementState = 'OFF' | 'ACTIVATING' | 'ACTIVE' | 'PAUSED' | 'HUMAN_ATTENTION_REQUIRED' | 'HUMAN_HANDOVER' | 'COMPLETED' | 'ERROR'
export type CommunicationState = 'READY' | 'OUTREACH_SENT' | 'WAITING_FOR_REPLY' | 'FOLLOW_UP_SCHEDULED' | 'CUSTOMER_RESPONDED'
  | 'NO_RESPONSE' | 'NOT_INTERESTED' | 'UNSUBSCRIBED' | 'COMPLETED' | 'ERROR'
export const OUTREACH_BASIS_LABELS: Record<string, string> = {
  RECORDED_CONSENT: 'Recorded consent',
  EXISTING_BUSINESS_RELATIONSHIP: 'Existing business relationship',
  INBOUND_REQUEST: 'Customer requested contact',
  ASSESSED_LEGITIMATE_INTEREST: 'Legitimate interest assessed',
}

export interface EmailProviderStatus { provider: string; configured: boolean; synthetic: boolean; sendsRealEmail: boolean; inboundMode: string; note: string }

export interface AiSettings {
  version: number; dailyRankingEnabled: boolean; dailyTarget: number; preferredTime: string; timezone: string
  minimumScore: number; minimumConfidence: number; globalOutboundEnabled: boolean; followupIntervalsDays: number[]
  maxFollowups: number; noResponseCloseDays: number; minimumAutoConfidence: number; minimumOutreachConfidence: number
  maxProactiveEmailsPer7Days: number; minimumHoursBetweenProactiveEmails: number; consentOnlyJurisdictions: string[]
  inboxPollIntervalMinutes: number; lastEmailPollAt?: string | null; outboundStoppedAt?: string | null; outboundStopReason?: string | null
  nextScheduledRunAt: string | null; lastRankingRunAt: string | null; emailProvider: EmailProviderStatus; previewSeedingAvailable?: boolean
  lastRun: null | { runId: string; status: string; trigger: string | null; startedAt: string; completedAt: string | null; target: number | null
    discovered: number; ranked: number; selected: number; rejected: number; skipped: number; error: string | null }
}
export const EDITABLE_SETTINGS = ['dailyRankingEnabled', 'dailyTarget', 'preferredTime', 'timezone', 'minimumScore', 'minimumConfidence',
  'globalOutboundEnabled', 'followupIntervalsDays', 'maxFollowups', 'noResponseCloseDays', 'minimumAutoConfidence', 'minimumOutreachConfidence',
  'maxProactiveEmailsPer7Days', 'minimumHoursBetweenProactiveEmails', 'consentOnlyJurisdictions', 'inboxPollIntervalMinutes'] as const

export interface CompanyRow {
  companyId: string; companyName: string; country: string | null; industry: string | null; priority: string | null
  leadScore: number | null; leadConfidence: number | null; rank: number | null; queuedOn: string | null; opportunityId: string | null
  opportunitySummary: string | null; recommendedServices: string[]; opportunityScore: number | null
  managementState: ManagementState; communicationState: CommunicationState; humanAttention: boolean; attentionReason: string | null
  openNotifications: number; contactName: string | null; nextActionAt: string | null; nextActionKind: string | null
  lastMessageAt: string | null; activatedAt: string | null; followupAttempts: number; lastError: string | null; inDailyQueue: boolean
}

export interface MemoryItem { text: string; sourceEventId: string; at: string; serviceIds?: string[] }
export interface ManagementRecord {
  companyId: string; companyName: string; managementState: ManagementState; communicationState: CommunicationState
  contactName?: string; contactEmail?: string; contactRole?: string; jurisdiction?: string; outreachBasis?: string
  activatedAt?: string; activatedBy?: string; humanOwner?: string; humanAttention?: boolean; attentionReason?: string
  nextActionAt?: string | null; nextActionKind?: string | null; nextActionNote?: string | null; followupAttempts: number; lastError?: string | null
  opportunityScore?: number | null; leadScore?: number | null; priority?: string; product?: string
  scoreHistory?: { at: string; previous: number | null; score: number; reason: string; sourceEventId: string }[]
  history?: { at: string; actor: string; reason: string; fromManagement: string; toManagement: string; fromCommunication: string; toCommunication: string }[]
  memory?: { summary: string; requirements: MemoryItem[]; preferences: MemoryItem[]; questions: MemoryItem[]; answers: MemoryItem[]; objections: MemoryItem[]
    existingProviders: MemoryItem[]; buyingSignals: MemoryItem[]; promises: MemoryItem[]
    pendingActions: { id: string; type: string; description: string; status: string; createdAt: string }[] }
  authorization?: { statement: string; acknowledgedBy: string; acknowledgedAt: string; jurisdiction: string; outreachBasis: string }
}

export interface Readiness {
  ready: boolean; problems: string[]
  intelligence: { discovered: boolean; qualifiedOpportunities: number; evidenceSources: number; researchSnapshot: boolean }
  contact: { contactId?: string; name?: string; email?: string; role?: string; source?: string; outreachBasis?: string; suppressed: boolean } | null
}

export interface AiNotification {
  notificationId: string; companyId: string; companyName: string; type: string; priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  title: string; summary: string; latestMessage?: string; contactName?: string; reason?: string; intent?: string
  buyingIntent?: string; sentiment?: string; buyingSignals: string[]; requirements: string[]; recommendation?: string
  opportunityScore?: number | null; requiresAction: boolean; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; owner?: string
  unread: boolean; createdAt: string; resolvedAt?: string; resolution?: string
}

export interface CompanyDetail {
  company: { companyId: string; companyName: string; country: string | null; industry: string | null; website: string | null; description: string | null; isSynthetic: boolean }
  management: ManagementRecord | null; readiness: Readiness
  brief: { companySummary: string; requirements: { text: string; status: string; sourceIds: string[] }[]; services: { id: string; name: string; fit: string }[]
    evidenceSources: { sourceId: string; title: string; url: string; verification: string }[]; confidence: number; missingInformation: string[] }
  lead: { rank: number; score: number; priority: string; product: string; summary?: string | null; localDate: string } | null
  opportunities: { opportunityId?: string; service?: string }[]
  opportunityUpdates: ({ eventId: string; createdAt: string; change?: string } & Record<string, unknown>)[]
  notifications: AiNotification[]
  activation: { statement: string; version: string; outreachBases: string[]; consentOnlyJurisdictions: string[]; globalOutboundEnabled: boolean }
  emailProvider: EmailProviderStatus
}

export interface ConversationMessage {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; at: string; subject?: string; body?: string; threadId: string; contactName?: string
  kind?: string; followupKind?: string | null; sentBy?: 'AI' | 'SALESPERSON'; provider?: string; synthetic?: boolean; generatedBy?: string | null; rationale?: string | null
  channel?: string
  interpretation?: { intent?: string; sentiment?: string; confidence?: number; buyingIntent?: string | null; buyingSignals: string[]; requirements: string[]; questions: string[]; requestedNextAction: string | null } | null
  aiDecision?: { decision?: string; reason?: string } | null
}

export interface Analytics {
  leadRanking: { dailyTarget: number; scheduledRankingEnabled: boolean; runs: number; companiesRanked: number; companiesQueued: number
    latestRun: null | { localDate: string; completedAt: string; target: number; discovered: number; ranked: number; selected: number; rejected: number; skipped: number } }
  companies: Record<string, number> & { managementStates: Record<string, number>; communicationStates: Record<string, number> }
  emails: { providerAccepted: number; uniqueCompaniesContacted: number; initialOutreach: number; followups: number; aiReplies: number; sentByAi: number
    sentBySalesperson: number; synthetic: number; confirmedDelivered: number | null; deliveryNote: string; failures: number; blocked: number }
  replies: { incoming: number; uniqueCompaniesReplied: number; positiveIntent: number; positiveSentiment: number; meetingRequests: number
    meetingsScheduled: number; proposalRequests: number; pricingRequests: number; unsubscribes: number; byIntent: Record<string, number> }
  outcomes: { opportunitiesWithNewRequirements: number; closedDeals: number; conversationsCompleted: number }
  notifications: { humanInterventions: number; openHumanInterventions: number; unread: number; byType: Record<string, number> }
  agentErrors: number; globalOutboundEnabled: boolean; emailProvider: EmailProviderStatus
}

export interface FollowUp { companyId: string; companyName: string; contactName: string | null; managementState: ManagementState; communicationState: CommunicationState
  nextActionKind: string; nextActionAt: string; note: string | null; followupAttempts: number; willRun: boolean }

const base = '/api/v1/ai-management'
const company = (id: string) => base + '/companies/' + encodeURIComponent(id)
export const ACTOR = 'local_sales_user'

export function apiError(error: unknown, fallback = 'The request failed.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; details?: { message: string }[] } | undefined
    if (data?.details?.length) return data.details.map(item => item.message).join(' ')
    return data?.message ?? (error.response ? fallback : 'Cannot reach the backend. Check that it is running.')
  }
  return error instanceof Error ? error.message : fallback
}

export const aiManagementService = {
  async settings() { return (await api.get(base + '/settings')).data.data as AiSettings },
  async saveSettings(settings: AiSettings) {
    const body: Record<string, unknown> = { version: settings.version }
    for (const key of EDITABLE_SETTINGS) body[key] = settings[key]
    return (await api.put(base + '/settings', body)).data.data as AiSettings
  },
  async runDailyRanking() { return (await api.post(base + '/daily-runs/run', {}, { timeout: 180000 })).data.data },
  async companies(params: Record<string, string> = {}) { return (await api.get(base + '/companies', { params })).data.data as CompanyRow[] },
  async company(id: string) { return (await api.get(company(id))).data.data as CompanyDetail },
  async enable(id: string, body: { jurisdiction: string; contact?: { name: string; email: string; role: string; source: string; outreachBasis: string } }) {
    return (await api.post(company(id) + '/enable', { actor: ACTOR, authorizationAcknowledged: true, complianceReviewed: true, ...body }, { timeout: 180000 })).data.data as
      { company: ManagementRecord; step: { status: string; reason?: string }; warnings: string[] }
  },
  async disable(id: string) { return (await api.post(company(id) + '/disable', { actor: ACTOR })).data.data as ManagementRecord },
  async pause(id: string, reason?: string) { return (await api.post(company(id) + '/pause', { actor: ACTOR, ...(reason ? { reason } : {}) })).data.data as ManagementRecord },
  async resume(id: string) { return (await api.post(company(id) + '/resume', { actor: ACTOR })).data.data as ManagementRecord },
  async takeover(id: string, owner = 'Sales team') { return (await api.post(company(id) + '/takeover', { owner })).data.data as ManagementRecord },
  async process(id: string) { return (await api.post(company(id) + '/process', {}, { timeout: 180000 })).data.data },
  async conversations(id: string) { return (await api.get(company(id) + '/conversations')).data.data as { messages: ConversationMessage[]; threads: { threadId: string; messageCount: number }[]; pendingDrafts: { draftId: string; kind: string; subject: string; body: string; createdAt: string }[] } },
  async timeline(id: string) {
    return (await api.get(company(id) + '/timeline')).data.data as { events: { eventId: string; type: string; at: string; summary: string; agent: string | null; success: boolean | null; isSynthetic: boolean }[]
      agentExecutions: { eventId: string; agent: string; success: boolean; at: string; confidence: number | null; payload: Record<string, unknown> }[] }
  },
  async simulateReply(id: string, text: string) { return (await api.post(company(id) + '/simulate-reply', { text }, { timeout: 180000 })).data.data },
  async notifications(params: Record<string, string> = {}) {
    const response = await api.get(base + '/notifications', { params: { limit: '50', ...params } })
    return { data: response.data.data as AiNotification[], unreadCount: response.data.meta.unreadCount as number, openActionCount: response.data.meta.openActionCount as number }
  },
  async markRead(id: string) { await api.post(base + '/notifications/' + encodeURIComponent(id) + '/read', {}) },
  async markAllRead() { await api.post(base + '/notifications/read-all', {}) },
  async acknowledge(id: string, owner = 'Sales team') { await api.post(base + '/notifications/' + encodeURIComponent(id) + '/acknowledge', { owner }) },
  async resolve(id: string, resumeAi = false) { return (await api.post(base + '/notifications/' + encodeURIComponent(id) + '/resolve', { actor: ACTOR, resumeAi })).data.data },
  async followUps() { return (await api.get(base + '/follow-ups')).data.data as FollowUp[] },
  async analytics() { return (await api.get(base + '/analytics')).data.data as Analytics },
  async emergencyStop(reason?: string) { return (await api.post(base + '/emergency-stop', { actor: ACTOR, ...(reason ? { reason } : {}) })).data.data as AiSettings },
  async emergencyResume() { return (await api.post(base + '/emergency-resume', { actor: ACTOR })).data.data as AiSettings },
  async seedPreview() { return (await api.post(base + '/demo/seed', {})).data.data as { created: string[]; queued: string[]; note: string } },
  async runWorker() { return (await api.post(base + '/worker/run', {}, { timeout: 180000 })).data.data },
}

export const label = (value?: string | null) => (value ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
export const when = (value?: string | null) => value ? new Date(value).toLocaleString() : '—'
