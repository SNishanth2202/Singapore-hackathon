import { useCallback, useEffect, useRef, useState } from 'react'
import { Comparison, Meta, Queue, View, rankingRequest, RankingRequestError } from '../services/ranking.service'

export function useRankingQueue(view: View, salesperson: string) {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)
  const discardUncheckedQueue = useCallback((err: unknown) => {
    if (!(err instanceof RankingRequestError) || err.code !== 'CUSTOMER_DATABASE_UNAVAILABLE') return false
    setQueue(null); setComparison(null); localStorage.removeItem(`ranking-last-${view}`); return true
  }, [view])
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setBusy(true)
    try {
      const q = await rankingRequest<Queue>(`/queue?view=${view}&salesperson=${encodeURIComponent(salesperson)}`)
      if (q.customerEligibility?.policy !== 'exclude_known_singtel_customers') {
        throw new RankingRequestError('The backend has not verified Singtel customer eligibility. Refresh after the backend is updated.', 'CUSTOMER_DATABASE_UNAVAILABLE')
      }
      const m = await rankingRequest<Meta>('/demo')
      if (id !== requestId.current) return
      setQueue(q); setMeta(m); setComparison(null); setError(null)

    } catch (err) {
      if (id !== requestId.current) return
      setError((err as Error).message)
      if (discardUncheckedQueue(err)) return
      setQueue(null)
    } finally { if (id === requestId.current) setBusy(false) }
  }, [view, salesperson, discardUncheckedQueue])
  useEffect(() => { setQueue(null); void refresh(); return () => { requestId.current++ } }, [refresh, view, salesperson])
  const mutate = useCallback(async (path: string, body: unknown) => {
    setBusy(true); setError(null)
    try { await rankingRequest(`${path}${path.includes('?') ? '&' : '?'}view=${view}`, body); await refresh(); return true }
    catch (err) { setError((err as Error).message); discardUncheckedQueue(err); setBusy(false); return false }
  }, [refresh, view, discardUncheckedQueue])
  const loadComparison = useCallback(async () => {
    setComparison(null)
    try { setComparison(await rankingRequest<Comparison>(`/comparison?salesperson=${encodeURIComponent(salesperson)}`)) }
    catch (error) { setError((error as Error).message); discardUncheckedQueue(error) }
  }, [discardUncheckedQueue, salesperson])
  return { queue, meta, comparison, error, busy, refresh, mutate, loadComparison }
}
