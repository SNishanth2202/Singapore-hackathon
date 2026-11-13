import { useState, useEffect, useCallback } from 'react'
import { opportunitiesService, Opportunity, PaginatedOpportunities, OpportunityFilters } from '../services/opportunities.service'

interface UseOpportunitiesReturn {
  opportunities: Opportunity[]
  total: number
  loading: boolean
  error: string | null
  isMockData: boolean
  refetch: (filters?: OpportunityFilters) => Promise<void>
}

export function useOpportunities(initialFilters: OpportunityFilters = {}): UseOpportunitiesReturn {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMockData, setIsMockData] = useState(false)

  const fetch = useCallback(async (filters: OpportunityFilters = initialFilters) => {
    setLoading(true)
    setError(null)
    try {
      const result: PaginatedOpportunities = await opportunitiesService.getOpportunities(filters)
      setOpportunities(result.data)
      setTotal(result.total)
      setIsMockData(result.isMockData ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunities')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetch(initialFilters)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { opportunities, total, loading, error, isMockData, refetch: fetch }
}
