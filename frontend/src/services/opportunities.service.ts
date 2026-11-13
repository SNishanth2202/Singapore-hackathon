import api from './api'

export interface Opportunity {
  _id: string
  companyId: string
  companyName?: string
  opportunityType?: string
  potentialService?: string
  reasoning?: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  confidenceScore: number
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
  createdAt: string
  updatedAt: string
}

export interface PaginatedOpportunities {
  data: Opportunity[]
  total: number
  page: number
  limit: number
  isMockData?: boolean
}

export interface OpportunityFilters {
  status?: string
  priority?: string
  page?: number
  limit?: number
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_OPPORTUNITIES: Opportunity[] = [
  {
    _id: 'opp-001',
    companyId: 'mock-001',
    companyName: 'TechVision Pte Ltd',
    opportunityType: 'Network Expansion',
    potentialService: 'SD-WAN',
    reasoning: 'Company expanding regionally; needs robust WAN infrastructure.',
    priority: 'HIGH',
    confidenceScore: 0.87,
    status: 'OPEN',
    createdAt: '2024-10-20T00:00:00.000Z',
    updatedAt: '2024-10-20T00:00:00.000Z',
  },
  {
    _id: 'opp-002',
    companyId: 'mock-002',
    companyName: 'FinBridge Malaysia',
    opportunityType: 'Cloud Migration',
    potentialService: 'Managed Cloud Services',
    reasoning: 'Legacy infrastructure upgrade to cloud; Singtel cloud-ready.',
    priority: 'HIGH',
    confidenceScore: 0.91,
    status: 'IN_PROGRESS',
    createdAt: '2024-09-15T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    _id: 'opp-003',
    companyId: 'mock-003',
    companyName: 'HealthLink Indonesia',
    opportunityType: 'Connectivity',
    potentialService: 'Mobile Broadband IoT',
    reasoning: 'Rural health data upload requires reliable mobile connectivity.',
    priority: 'MEDIUM',
    confidenceScore: 0.74,
    status: 'OPEN',
    createdAt: '2024-10-01T00:00:00.000Z',
    updatedAt: '2024-10-01T00:00:00.000Z',
  },
  {
    _id: 'opp-004',
    companyId: 'mock-004',
    companyName: 'LogiTech Thailand',
    opportunityType: 'IoT Platform',
    potentialService: 'Singtel Smart IoT',
    reasoning: 'Fleet tracking and sensor data needs enterprise IoT platform.',
    priority: 'MEDIUM',
    confidenceScore: 0.68,
    status: 'OPEN',
    createdAt: '2024-11-01T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    _id: 'opp-005',
    companyId: 'mock-005',
    companyName: 'EduSpark Philippines',
    opportunityType: 'Video Streaming',
    potentialService: 'CDN Services',
    reasoning: 'High-quality video delivery for e-learning content.',
    priority: 'LOW',
    confidenceScore: 0.55,
    status: 'CLOSED',
    createdAt: '2024-08-20T00:00:00.000Z',
    updatedAt: '2024-10-10T00:00:00.000Z',
  },
]

// ─── Service ─────────────────────────────────────────────────────────────────

export const opportunitiesService = {
  async getOpportunities(filters: OpportunityFilters = {}): Promise<PaginatedOpportunities> {
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))

      const response = await api.get('/api/v1/opportunities', { params })
      const resData = response.data
      if (resData && Array.isArray(resData.data)) {
        return {
          data: resData.data,
          total: resData.meta?.total ?? resData.data.length,
          page: resData.meta?.page ?? filters.page ?? 1,
          limit: resData.meta?.limit ?? filters.limit ?? 25,
          isMockData: false,
        }
      }
      return resData
    } catch {
      const mockFiltered = MOCK_OPPORTUNITIES.filter((o) => {
        if (filters.status && o.status !== filters.status) return false
        if (filters.priority && o.priority !== filters.priority) return false
        return true
      })
      const page = filters.page ?? 1
      const limit = filters.limit ?? 25
      const start = (page - 1) * limit
      return {
        data: mockFiltered.slice(start, start + limit),
        total: mockFiltered.length,
        page,
        limit,
        isMockData: true,
      }
    }
  },
}
