import { useEffect, useState } from 'react'
import axios from 'axios'
import { BookOpenIcon, RefreshCwIcon } from 'lucide-react'
import api from '../services/api'

interface Knowledge {
  version: number; updatedAt: string
  seller: { name: string }
  strategy: { priorityMarkets: string[]; segments: { id: string; name: string }[] }
  offerings: { id: string; name: string; active: boolean; capabilities: string[]; buyerRoles: string[]; sourceIds: string[] }[]
  sources: { id: string; title: string; url: string }[]
}

function errorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Enter valid JSON before saving.'
  const data = error.response?.data
  const details = data?.details?.slice(0, 4).map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join(' · ')
  return details || data?.message || 'Business knowledge could not be loaded. Check the backend.'
}

export default function BusinessKnowledge() {
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await api.get('/api/v1/ai/business-knowledge')
      setKnowledge(response.data.data); setDraft(JSON.stringify(response.data.data, null, 2))
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  async function save() {
    if (!knowledge) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await api.put('/api/v1/ai/business-knowledge', { expectedVersion: knowledge.version, knowledge: JSON.parse(draft) })
      setKnowledge(response.data.data); setDraft(JSON.stringify(response.data.data, null, 2))
      setMessage(`Saved version ${response.data.data.version}. New analyses will use these changes.`)
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])

  return <section className="card p-6" aria-label="Seller business knowledge">
    <div className="flex flex-wrap justify-between gap-3 items-start">
      <div><h2 className="text-base font-semibold text-gray-800 flex items-center gap-2"><BookOpenIcon className="w-5 h-5 text-teal-600" /> Business knowledge</h2>
        <p className="text-sm text-gray-500 mt-1">What we sell, who we serve, and how analysis checks service fit.</p></div>
      <button onClick={() => void load()} disabled={busy} className="border rounded-lg px-3 py-2 text-xs inline-flex items-center gap-1 disabled:opacity-50"><RefreshCwIcon className="w-3 h-3" /> Reload saved knowledge</button>
    </div>
    {busy && <p role="status" className="text-sm text-gray-500 mt-4">Updating business knowledge…</p>}
    {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mt-4">{error}</p>}
    {message && <p role="status" className="text-sm text-teal-800 bg-teal-50 rounded-lg p-3 mt-4">{message}</p>}
    {knowledge && <div className="mt-5 space-y-4">
      <div className="rounded-lg bg-teal-50 p-4"><p className="font-semibold text-teal-900">{knowledge.seller.name} · Knowledge v{knowledge.version}</p>
        <p className="text-sm text-teal-800 mt-1">{knowledge.offerings.filter(o => o.active).length} active service areas</p>
        <p className="text-xs text-teal-800 mt-2">Research focus: {knowledge.strategy.priorityMarkets.join(' · ')}</p>
        <p className="text-xs text-teal-800 mt-1">Customer segments: {knowledge.strategy.segments.map(s => s.name).join(' · ')}</p></div>
      <p className="text-xs text-gray-500">Capability references come from official seller pages. Targeting rules and research priorities are team settings. Actual service availability and customer requirements need verification.</p>
      <details><summary className="text-sm font-medium text-gray-700 cursor-pointer">Explore the service catalogue</summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">{knowledge.offerings.map(o => <div key={o.id} className="border rounded-lg p-3 text-sm">
          <p className="font-semibold">{o.name}{!o.active && ' · Inactive'}</p><p className="text-gray-600 mt-1">{o.capabilities.join(' · ')}</p>
          <p className="text-xs text-gray-500 mt-2">Roles to identify: {o.buyerRoles.join(', ')}</p>
          <p className="text-xs text-teal-700 mt-2">{o.sourceIds.map(id => { const source = knowledge.sources.find(s => s.id === id); return source && <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="underline mr-2">Official reference</a> })}</p>
        </div>)}</div>
      </details>
      <details><summary className="text-sm font-medium text-gray-700 cursor-pointer">Edit structured business knowledge</summary>
        <p className="text-xs text-gray-500 my-3">Update lists, service rules, roles, segments or objectives below. Keep IDs and source references consistent. Saving applies to new analyses; versions are managed automatically.</p>
        <label htmlFor="business-knowledge-json" className="text-sm font-medium">Business configuration (JSON)</label>
        <textarea id="business-knowledge-json" value={draft} onChange={e => { setDraft(e.target.value); setMessage('') }} spellCheck={false} rows={20} className="mt-2 w-full font-mono text-xs p-3 rounded-lg border focus:ring-2 focus:ring-teal-500" />
        <button disabled={busy || !draft.trim()} onClick={() => void save()} className="mt-3 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Save business knowledge</button>
      </details>
    </div>}
  </section>
}
