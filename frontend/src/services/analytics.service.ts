import api from './api'

export interface CountryCount {
  country: string
  count: number
}

export interface IndustryCount {
  industry: string
  count: number
}

export interface AnalyticsOverview {
  totalCompanies: number
  newThisWeek: number
  openOpportunities: number
  highPriorityOpportunities: number
  companiesByCountry: CountryCount[]
  companiesByIndustry: IndustryCount[]
  isMockData?: boolean
}

export interface HealthStatus {
  storageMode?: string
  status: 'healthy' | 'degraded' | 'down'
  timestamp: string
  services: {
    mongodb: { status: string; latencyMs?: number }
    neo4j: { status: string; latencyMs?: number }
  }
  isMockData?: boolean
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_OVERVIEW: AnalyticsOverview = {
  totalCompanies: 247,
  newThisWeek: 12,
  openOpportunities: 38,
  highPriorityOpportunities: 9,
  companiesByCountry: [
    { country: 'Singapore', count: 82 },
    { country: 'Malaysia', count: 55 },
    { country: 'Indonesia', count: 48 },
    { country: 'Thailand', count: 31 },
    { country: 'Philippines', count: 21 },
    { country: 'Vietnam', count: 10 },
  ],
  companiesByIndustry: [
    { industry: 'Technology', count: 71 },
    { industry: 'Finance', count: 44 },
    { industry: 'Healthcare', count: 36 },
    { industry: 'Logistics', count: 28 },
    { industry: 'Retail', count: 25 },
    { industry: 'Manufacturing', count: 22 },
    { industry: 'Education', count: 21 },
  ],
  isMockData: true,
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const analyticsService = {
  async getOverview(): Promise<AnalyticsOverview> {
    try {
      const response = await api.get('/api/v1/analytics/overview')
      const resData = response.data
      return (resData.data ?? resData) as AnalyticsOverview
    } catch {
      return MOCK_OVERVIEW
    }
  },

  async getHealth(): Promise<HealthStatus> {
    try {
      const response = await api.get('/api/v1/health')
      const resData = response.data
      const rawServices = resData.services ?? {}
      return {
        status: resData.status ?? (resData.success ? 'healthy' : 'down'),
        timestamp: resData.timestamp ?? new Date().toISOString(),
        storageMode: resData.storageMode,
        services: {
          mongodb:
            typeof rawServices.mongodb === 'object'
              ? rawServices.mongodb
              : { status: rawServices.mongodb === 'up' ? 'healthy' : 'down' },
          neo4j:
            typeof rawServices.neo4j === 'object'
              ? rawServices.neo4j
              : { status: rawServices.neo4j === 'up' ? 'healthy' : 'down' },
        },
        isMockData: false,
      }
    } catch {
      return {
        status: 'down',
        timestamp: new Date().toISOString(),
        services: {
          mongodb: { status: 'unknown' },
          neo4j: { status: 'unknown' },
        },
        isMockData: true,
      }
    }
  },
}
