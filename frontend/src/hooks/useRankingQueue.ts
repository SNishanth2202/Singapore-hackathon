import { useCallback, useEffect, useRef, useState } from 'react'
import { Comparison, Meta, Queue, View, rankingRequest } from '../services/ranking.service'

export function useRankingQueue(view: View) {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setBusy(true)
    try {
      const q = await rankingRequest<Queue>(`/queue?view=${view}`)
      const m = await rankingRequest<Meta>('/demo')
      if (id !== requestId.current) return
      setQueue(q); setMeta(m); setComparison(null); setError(null)
      localStorage.setItem(`ranking-last-${view}`, JSON.stringify(q))
    } catch (err) {
      if (id !== requestId.current) return
      setError((err as Error).message)
      const saved = localStorage.getItem(`ranking-last-${view}`)
      if (saved) { try { setQueue(JSON.parse(saved) as Queue) } catch { /* An invalid cache is never a fallback dataset. */ } }
    } finally { if (id === requestId.current) setBusy(false) }
  }, [view])
  useEffect(() => { setQueue(previous => previous?.view === view ? previous : null); void refresh(); return () => { requestId.current++ } }, [refresh, view])
  const mutate = useCallback(async (path: string, body: unknown) => {
    setBusy(true); setError(null)
    try { await rankingRequest(`${path}${path.includes('?') ? '&' : '?'}view=${view}`, body); await refresh(); return true }
    catch (err) { setError((err as Error).message); setBusy(false); return false }
  }, [refresh, view])
  const loadComparison = useCallback(async () => {
    setComparison(null)
    try { setComparison(await rankingRequest<Comparison>('/comparison')) }
    catch (error) { setError((error as Error).message) }
  }, [])
  return { queue, meta, comparison, error, busy, refresh, mutate, loadComparison }
}
