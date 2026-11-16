import { useState } from 'react'
import axios from 'axios'
import { BarChart3Icon, CheckCircleIcon, RefreshCwIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { rankingRequest } from '../services/ranking.service'

interface HandoffResponse { handoff: { company: { name: string }; candidates: number }; queue: { total: number } }

export default function LeadRanking({ researchId, qualifiedCount = 0 }: { researchId: string; qualifiedCount?: number }) {
  const [result, setResult] = useState<HandoffResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function rank() {
    setLoading(true); setError('')
    try {
      setResult(await rankingRequest<HandoffResponse>('/import-discovery', { researchId }))
    } catch (e) {
      setResult(null)
      setError(axios.isAxiosError(e) ? e.response?.data?.message ?? 'Lead ranking could not be generated.' : e instanceof Error ? e.message : 'Lead ranking could not be generated.')
    } finally { setLoading(false) }
  }

  return <section className="card p-5 sm:p-6" aria-label="Discovery-to-ranking hand-off">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold text-navy-600"><BarChart3Icon className="w-5 h-5 text-teal-600" /> Lead Ranking Agent</h2>
        <p className="text-sm text-gray-500 mt-1">Send evidence-qualified service hypotheses to the ranked lead worklist.</p></div>
      <button onClick={() => void rank()} disabled={loading || qualifiedCount === 0} className="inline-flex items-center gap-2 bg-navy-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-navy-700 disabled:opacity-60">
        {loading ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <BarChart3Icon className="w-4 h-4" />}
        {loading ? 'Adding to worklist…' : result ? 'Refresh worklist candidate' : 'Add qualified leads'}
      </button>
    </div>
    {qualifiedCount === 0 && <p className="mt-3 text-sm text-gray-600">Use the source-linked discovery question to confirm a requirement. Qualified-lead handoff becomes available when an analysis retains a supported service hypothesis.</p>}
    {!result && !loading && !error && <p className="text-sm text-gray-500 mt-5 bg-gray-50 p-4 rounded-lg">Only dated signals that pass the existing service-matching rules are sent. The hand-off creates no CRM record and leaves buyer, site, technical, and deadline facts unconfirmed.</p>}
    {loading && <p role="status" className="text-sm text-teal-700 mt-5 bg-teal-50 p-4 rounded-lg">Validating the cited Discovery evidence and updating the ranking queue…</p>}
    {error && <p role="alert" className="text-sm text-red-700 mt-5 bg-red-50 p-4 rounded-lg">{error}</p>}
    {result && <div role="status" className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900 flex flex-wrap items-center justify-between gap-3"><p className="flex gap-2"><CheckCircleIcon className="w-5 h-5 shrink-0" /><span>Added {result.handoff.candidates} evidence-qualified candidate(s) for {result.handoff.company.name}. The worklist now contains {result.queue.total} leads; mandatory checks keep this hand-off at verification until internal facts arrive.</span></p><Link to="/lead-ranking" className="rounded-lg bg-teal-700 text-white px-3 py-2 text-xs font-semibold hover:bg-teal-800">Open Lead Ranking</Link></div>}
  </section>
}
