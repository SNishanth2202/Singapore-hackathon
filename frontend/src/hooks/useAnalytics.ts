import { useState, useEffect, useCallback } from 'react'
import { analyticsService, AnalyticsOverview } from '../services/analytics.service'

interface UseAnalyticsReturn {
  overview: AnalyticsOverview | null
  loading: boolean
  error: string | null
  isMockData: boolean
  refetch: () => Promise<void>
}

export function useAnalytics(): UseAnalyticsReturn {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMockData, setIsMockData] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await analyticsService.getOverview()
      setOverview(result)
      setIsMockData(result.isMockData ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetch()
  }, [fetch])

  return { overview, loading, error, isMockData, refetch: fetch }
}
