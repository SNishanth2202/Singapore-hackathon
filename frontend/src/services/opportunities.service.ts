import api from './api'

export interface Opportunity {
  _id: string
  companyId: string
  companyName?: string
  salesCompanyId?: string
  isSynthetic?: boolean
  datasetTag?: string
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

export const opportunitiesService = {
  async getOpportunities(filters: OpportunityFilters = {}, signal?: AbortSignal): Promise<PaginatedOpportunities> {
    const response = await api.get('/api/v1/opportunities', { params: filters, signal })
    const result = response.data
    if (!Array.isArray(result?.data)) throw new Error('The opportunity service returned an invalid response. Please retry.')
    return { data: result.data, total: result.meta?.total ?? result.data.length,
      page: result.meta?.page ?? filters.page ?? 1, limit: result.meta?.limit ?? filters.limit ?? 25,
      isMockData: result.dataMode === 'sample' || (result.data.length > 0 && result.data.every((row: Opportunity) => row.isSynthetic === true)) }
  },
}
