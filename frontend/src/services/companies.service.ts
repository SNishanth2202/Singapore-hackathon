import api from './api'

export interface SourceReference {
  sourceName: string
  sourceUrl: string
  fetchedAt: string
}

export interface Company {
  _id: string
  companyName: string
  registrationNumber?: string
  website?: string
  description?: string
  industry?: string
  country?: string
  headquarters?: string
  foundedDate?: string
  employeeCount?: number
  companyStage?: string
  sourceReferences?: SourceReference[]
  neo4jNodeId?: string
  createdAt: string
  updatedAt: string
}

export interface IntelligenceSignal {
  _id: string
  companyId: string
  signalType: string
  description: string
  source?: string
  sourceUrl?: string
  detectedAt: string
  confidenceScore: number
}

export interface CompanyWithSignals extends Company {
  signals?: IntelligenceSignal[]
  opportunities?: CompanyOpportunity[]
}

export interface CompanyOpportunity {
  _id: string
  opportunityType?: string
  potentialService?: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  confidenceScore: number
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
  createdAt: string
}

export interface PaginatedCompanies {
  data: Company[]
  total: number
  page: number
  limit: number
  isMockData?: boolean
}

export interface CompanyFilters {
  country?: string
  industry?: string
  stage?: string
  search?: string
  page?: number
  limit?: number
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_COMPANIES: Company[] = [
  {
    _id: 'mock-001',
    companyName: 'TechVision Pte Ltd',
    industry: 'Technology',
    country: 'Singapore',
    headquarters: 'Singapore',
    foundedDate: '2018-03-15T00:00:00.000Z',
    employeeCount: 120,
    companyStage: 'Series B',
    website: 'https://techvision.sg',
    description: 'AI-driven enterprise software solutions for Southeast Asia.',
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-11-01T00:00:00.000Z',
  },
  {
    _id: 'mock-002',
    companyName: 'FinBridge Malaysia',
    industry: 'Finance',
    country: 'Malaysia',
    headquarters: 'Kuala Lumpur',
    foundedDate: '2015-06-01T00:00:00.000Z',
    employeeCount: 350,
    companyStage: 'Growth',
    website: 'https://finbridge.my',
    description: 'Cross-border payments and financial services platform.',
    createdAt: '2024-02-05T00:00:00.000Z',
    updatedAt: '2024-10-20T00:00:00.000Z',
  },
  {
    _id: 'mock-003',
    companyName: 'HealthLink Indonesia',
    industry: 'Healthcare',
    country: 'Indonesia',
    headquarters: 'Jakarta',
    foundedDate: '2020-01-10T00:00:00.000Z',
    employeeCount: 75,
    companyStage: 'Series A',
    website: 'https://healthlink.id',
    description: 'Telemedicine and digital health records for rural Indonesia.',
    createdAt: '2024-03-12T00:00:00.000Z',
    updatedAt: '2024-11-05T00:00:00.000Z',
  },
  {
    _id: 'mock-004',
    companyName: 'LogiTech Thailand',
    industry: 'Logistics',
    country: 'Thailand',
    headquarters: 'Bangkok',
    foundedDate: '2017-09-22T00:00:00.000Z',
    employeeCount: 500,
    companyStage: 'Private',
    website: 'https://logitech.th',
    description: 'Last-mile delivery optimisation using IoT sensors.',
    createdAt: '2024-04-01T00:00:00.000Z',
    updatedAt: '2024-10-30T00:00:00.000Z',
  },
  {
    _id: 'mock-005',
    companyName: 'EduSpark Philippines',
    industry: 'Education',
    country: 'Philippines',
    headquarters: 'Manila',
    foundedDate: '2019-07-04T00:00:00.000Z',
    employeeCount: 60,
    companyStage: 'Seed',
    website: 'https://eduspark.ph',
    description: 'Adaptive learning platform for K-12 students.',
    createdAt: '2024-05-18T00:00:00.000Z',
    updatedAt: '2024-11-02T00:00:00.000Z',
  },
]

// ─── Service ─────────────────────────────────────────────────────────────────

export const companiesService = {
  async getCompanies(filters: CompanyFilters = {}): Promise<PaginatedCompanies> {
    try {
      const params = new URLSearchParams()
      if (filters.country) params.set('country', filters.country)
      if (filters.industry) params.set('industry', filters.industry)
      if (filters.stage) params.set('stage', filters.stage)
      if (filters.search) params.set('search', filters.search)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))

      const response = await api.get('/api/v1/companies', { params })
      const resData = response.data
      if (resData && Array.isArray(resData.data)) {
        return {
          data: resData.data,
          total: resData.meta?.total ?? resData.data.length,
          page: resData.meta?.page ?? filters.page ?? 1,
          limit: resData.meta?.limit ?? filters.limit ?? 25,
          isMockData: resData.dataMode === 'sample',
        }
      }
      return resData
    } catch {
      // Fall back to mock data
      const mockFiltered = MOCK_COMPANIES.filter((c) => {
        if (filters.country && c.country !== filters.country) return false
        if (filters.industry && c.industry !== filters.industry) return false
        if (filters.stage && c.companyStage !== filters.stage) return false
        if (filters.search) {
          const q = filters.search.toLowerCase()
          return (
            c.companyName.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q)
          )
        }
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

  async getCompanyById(id: string): Promise<CompanyWithSignals & { isMockData?: boolean }> {
    try {
      const response = await api.get(`/api/v1/companies/${id}`)
      const resData = response.data
      return (resData.data ?? resData) as CompanyWithSignals & { isMockData?: boolean }
    } catch {
      throw new Error('Could not load this company. Check that the local backend is running, then retry.')
    }
  },
}
