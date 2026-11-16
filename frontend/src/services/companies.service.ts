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
  salesCompanyId?: string
  isSynthetic?: boolean
  isMockData?: boolean
  datasetTag?: string
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
  reasoning?: string
  salesCompanyId?: string
  isSynthetic?: boolean
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

export const companiesService = {
  async getCompanies(filters: CompanyFilters = {}): Promise<PaginatedCompanies> {
    const response = await api.get('/api/v1/companies', { params: filters })
    const result = response.data
    if (!Array.isArray(result?.data)) throw new Error('The company service returned an invalid response. Please retry.')
    return { data: result.data, total: result.meta?.total ?? result.data.length,
      page: result.meta?.page ?? filters.page ?? 1, limit: result.meta?.limit ?? filters.limit ?? 25,
      isMockData: result.dataMode === 'sample' || (result.data.length > 0 && result.data.every((row: Company) => row.isSynthetic === true)) }
  },
  async getCompanyById(id: string): Promise<CompanyWithSignals> {
    const response = await api.get('/api/v1/companies/' + encodeURIComponent(id))
    const company = response.data?.data
    if (!company?._id) throw new Error('The company service returned an invalid profile. Please retry.')
    return company
  },
}
