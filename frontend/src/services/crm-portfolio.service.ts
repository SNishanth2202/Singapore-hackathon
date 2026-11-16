import api from './api'

export interface AccountAction {
  id: string; kind: 'service' | 'capacity' | 'optimisation' | 'engagement' | 'contract' | 'pipeline' | 'payment'
  title: string; reason: string; nextStep: string; priority: 'high' | 'medium' | 'normal'; recordIds: string[]
}
export interface PortfolioAccount {
  id: string; name: string; industry: string; country: string; owner: string; tier: string
  billedSgd: number; baseFeesSgd: number; openAnnualSgd: number; openOpportunities: number
  subscriptionCount: number; capacityCount: number; optimisationCount: number; serviceReview: boolean
  flaggedBreaches: number; latestSentiment: string | null; satisfaction: number | null
  lastInteraction: string | null; contractReviews: number; primaryAction: AccountAction | null
}
export interface CrmPortfolio {
  schemaVersion: 1; refreshedAt: string; evaluatedOn: string; reportingMonth: string; connection: 'saved' | 'connected'
  coverage: { from: string; through: string; months: number }
  source: { database: string; collectionCounts: Record<string, number>; totalRecords: number; datasetTags: string[]; operationalDataTypes: string[] }
  metrics: { accounts: number; billedSgd: number; billedSubscriptions: number; openOpportunities: number; openAnnualSgd: number; weightedOpenAnnualSgd: number; capacitySubscriptions: number; capacityAccounts: number; optimisationSubscriptions: number; serviceReviewAccounts: number; flaggedBreachAccounts: number; contractReviews: number; staleOpportunities: number; latestNegativeAccounts: number; billingChangePct: number | null }
  billingTrend: { period: string; billedSgd: number; subscriptions: number }[]
  pipeline: { type: string; count: number; annualSgd: number }[]
  serviceMix: { service: string; subscriptions: number; baseFeesSgd: number }[]
  quality: { availabilityFlagMismatches: number; overdueWithPaymentDate: number; missingInvoiceDueDates: number; duplicateIds: number; orphanReferences: number }
  accounts: PortfolioAccount[]
}
export interface PortfolioDetail {
  account: PortfolioAccount; actions: AccountAction[]; reportingMonth: string; refreshedAt: string; evaluatedOn: string; connection: 'saved' | 'connected'
  subscriptions: { id: string; service: string; plan: string; ends: string; status: string; recordedStatus: string; baseFeeSgd: number; includedGb: number; usedGb: number | null; utilisationPct: number | null; siteCount: number; autoRenewal: boolean }[]
  invoices: { id: string; subscriptionId: string; period: string; totalSgd: number; status: string; paymentDate: string | null }[]
  opportunities: { id: string; name: string; type: string; product: string; stage: string; status: string; annualSgd: number; probabilityPct: number; expectedClose: string; needsReview: boolean }[]
  interactions: { id: string; date: string; type: string; sentiment: string; satisfaction: number; topics: string[]; followupRequired: boolean }[]
  network: { id: string; service: string; availabilityPct: number; targetPct: number; flaggedBreach: boolean; belowTarget: boolean; flagMismatch: boolean }[]
  relationships: { id: string; accountId: string; name: string; type: string; direction: 'parent' | 'child'; recordedStatus: string }[]
  billingHistory: { period: string; billedSgd: number }[]
  provenance: { datasetTags: string[]; operationalDataType: string; identityOrigin: string; referenceIds: string[] }
}
export const crmPortfolioService = {
  async overview(signal?: AbortSignal, refresh = false): Promise<CrmPortfolio | null> {
    try {
      const response = await api.get('/api/v1/crm/portfolio', { signal, params: refresh ? { refresh: true } : undefined })
      if (!response.data?.data?.accounts || !response.data.data.metrics) throw new Error('Customer portfolio could not be read.')
      return response.data.data
    } catch (error) {
      if ((error as { response?: { data?: { code?: string } } }).response?.data?.code === 'CRM_SOURCE_NOT_CONFIGURED') return null
      throw error
    }
  },
  async account(id: string, signal?: AbortSignal, refresh = false): Promise<PortfolioDetail> {
    const response = await api.get('/api/v1/crm/portfolio/accounts/' + encodeURIComponent(id), { signal, params: refresh ? { refresh: true } : undefined })
    if (!response.data?.data?.account) throw new Error('Customer details could not be read.')
    return response.data.data
  },
}
export const crmMoney = (value: number, compact = false) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', currencyDisplay: 'code', maximumFractionDigits: compact ? 1 : 0, ...(compact ? { notation: 'compact' as const } : {}) }).format(value)
export const crmMonth = (value: string) => new Date(value + '-01T00:00:00Z').toLocaleDateString('en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' })
