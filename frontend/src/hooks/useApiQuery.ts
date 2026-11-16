import { useEffect, useState } from 'react'

/** The caller's stable request callback changes when its filters or route change. */
export function useApiQuery<T>(request: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    setError(null)
    request(signal)
      .then(result => { if (!signal.aborted) setData(result) })
      .catch(reason => {
        if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'The request failed.')
      })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [request, revision])

  return { data, loading, error, refetch: () => setRevision(value => value + 1) }
}
