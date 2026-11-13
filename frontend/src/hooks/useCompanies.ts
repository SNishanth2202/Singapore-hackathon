import { useState, useEffect, useCallback } from 'react'
import { companiesService, Company, PaginatedCompanies, CompanyFilters } from '../services/companies.service'

interface UseCompaniesReturn {
  companies: Company[]
  total: number
  loading: boolean
  error: string | null
  isMockData: boolean
  refetch: (filters?: CompanyFilters) => Promise<void>
}

export function useCompanies(initialFilters: CompanyFilters = {}): UseCompaniesReturn {
  const [companies, setCompanies] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMockData, setIsMockData] = useState(false)

  const fetch = useCallback(async (filters: CompanyFilters = initialFilters) => {
    setLoading(true)
    setError(null)
    try {
      const result: PaginatedCompanies = await companiesService.getCompanies(filters)
      setCompanies(result.data)
      setTotal(result.total)
      setIsMockData(result.isMockData ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetch(initialFilters)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { companies, total, loading, error, isMockData, refetch: fetch }
}
