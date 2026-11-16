import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { AlertCircleIcon, ArrowRightIcon, CheckCircle2Icon, RefreshCwIcon, UsersIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import api from '../services/api'
import { formatDate } from '../utils/formatters'

interface Event { eventId: string; type: string; companyId: string; companyName: string; researchId?: string; contactName?: string; contactEmail?: string; reason?: string; priority?: string; status?: string; assignedTo?: string; createdAt: string; payload: Record<string, string | number | boolean | null | undefined> }
interface Page<T> { data: T[]; meta?: { total: number; page: number; limit: number } }

function errorText(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.message ?? 'The sales workflow request failed.' : 'The sales workflow request failed.' }

export default function SalesWorkbench() {
  const [params, setParams] = useSearchParams()
  const [companies, setCompanies] = useState<Event[]>([])
  const [interventions, setInterventions] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const tab = params.get('tab') === 'interventions' ? 'interventions' : 'companies'

  async function load() {
    setLoading(true); setError('')
    try {
      const [companyResponse, interventionResponse] = await Promise.all([
        api.get<Page<Event>>('/api/v1/sales/companies', { params: { limit: 100 } }),
        api.get<Page<Event>>('/api/v1/sales/interventions', { params: { limit: 100 } }),
      ])
      setCompanies(companyResponse.data.data ?? [])
      setInterventions(interventionResponse.data.data ?? [])
    } catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function seedDemo() {
    setBusy(true); setError(''); setNotice('')
    try { await api.post('/api/v1/sales/demo/run'); setNotice('Workflow activity is retained for review in the recorded outbox.'); await load() }
    catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  async function update(event: Event, status: string) {
    const interventionId = String(event.payload.interventionId)
    setBusy(true); setError('')
    try {
      await api.patch(`/api/v1/sales/companies/${encodeURIComponent(event.companyId)}/interventions/${encodeURIComponent(interventionId)}`, { status, assignedTo: event.assignedTo === 'Unassigned' ? 'Sales team' : event.assignedTo })
      await load()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return <div>
    <PageHeader title="Sales Outreach & Intervention" subtitle="Move discovered accounts through human approved outreach and manage conversations that need attention." actions={<button onClick={() => void seedDemo()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"><UsersIcon className="h-4 w-4" />Prepare workflow walkthrough</button>} />
    {error && <div role="alert" className="mb-4 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertCircleIcon className="h-4 w-4 shrink-0" />{error}</div>}
    {notice && <p role="status" className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
    <Link to="/crm" className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-teal-100 bg-teal-50 p-4 text-teal-900"><span><span className="block text-sm font-semibold">Customer CRM</span><span className="mt-1 block text-xs">Review existing customer contacts, contracts, invoices, usage and service issues before planning the next action.</span></span><ArrowRightIcon className="h-5 w-5 shrink-0" /></Link>
    <div className="mb-5 flex gap-2 border-b">
      <button onClick={() => setParams({})} className={`px-3 py-2 text-sm ${tab === 'companies' ? 'border-b-2 border-teal-600 font-semibold text-navy-600' : 'text-gray-500'}`}>Discovered companies ({companies.length})</button>
      <button onClick={() => setParams({ tab: 'interventions' })} className={`px-3 py-2 text-sm ${tab === 'interventions' ? 'border-b-2 border-teal-600 font-semibold text-navy-600' : 'text-gray-500'}`}>Human intervention ({interventions.length})</button>
      <button onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 px-3 py-2 text-xs text-gray-500" disabled={loading}><RefreshCwIcon className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
    </div>
    {tab === 'companies' ? <div className="card overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-semibold text-gray-800">Company sales worklist</h2><p className="mt-1 text-xs text-gray-500">Companies are deduplicated by Discovery identity. Select a company to identify a contact, prepare an email, and review its conversation history.</p></div>
      {loading ? <p role="status" className="p-6 text-sm text-gray-500">Loading sales worklist…</p> : companies.length ? <div className="divide-y">{companies.map(company => <Link key={company.companyId} to={`/sales/companies/${encodeURIComponent(company.companyId)}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-gray-50"><div><p className="font-medium text-navy-600">{company.companyName}</p><p className="mt-1 text-xs text-gray-500">{company.companyId} · {company.payload.sourceCount ?? 0} discovered source(s) · {formatDate(company.createdAt)}</p></div><ArrowRightIcon className="h-4 w-4 text-teal-600" /></Link>)}</div> : <div className="p-8 text-center"><p className="font-medium text-gray-700">No discovered companies are in the sales worklist yet.</p><p className="mt-2 text-sm text-gray-500">Research a company, then add its evidence-qualified candidates to Lead Ranking.</p><Link to="/companies" className="mt-4 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm text-white">Start company discovery</Link></div>}
    </div> : <div className="card overflow-x-auto"><div className="border-b px-5 py-4"><h2 className="font-semibold text-gray-800">Human intervention queue</h2><p className="mt-1 text-xs text-gray-500">Latest status per intervention. High priority and critical cases should be reviewed first.</p></div>
      {interventions.length ? <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Company / contact</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Owner / status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{interventions.map(item => <tr key={item.payload.interventionId as string} className="border-t"><td className="px-4 py-3"><Link className="font-medium text-navy-600 underline" to={`/sales/companies/${encodeURIComponent(item.companyId)}`}>{item.companyName}</Link><small className="block text-gray-500">{item.contactName ?? item.contactEmail ?? 'Contact unknown'}</small></td><td className="px-4 py-3">{(item.reason ?? 'OTHER').replace(/_/g, ' ')}</td><td className="px-4 py-3">{item.priority}</td><td className="px-4 py-3">{item.assignedTo}<small className="block text-gray-500">{item.status}</small></td><td className="px-4 py-3">{formatDate(item.createdAt)}</td><td className="px-4 py-3"><select aria-label={`Update ${String(item.payload.interventionId)}`} disabled={busy || ['RESOLVED', 'CLOSED'].includes(item.status ?? '')} value={item.status} onChange={e => void update(item, e.target.value)} className="rounded border px-2 py-1 text-xs"><option>PENDING</option><option>ASSIGNED</option><option>IN_PROGRESS</option><option>WAITING_FOR_CUSTOMER</option><option>WAITING_FOR_INTERNAL_INFORMATION</option><option>RESOLVED</option><option>CLOSED</option></select></td></tr>)}</tbody></table> : <p className="p-8 text-sm text-gray-500">No human interventions are currently recorded.</p>}
    </div>}
    <p className="mt-4 flex items-center gap-2 text-xs text-gray-400"><CheckCircle2Icon className="h-3 w-3" />Provider acceptance is recorded separately from inbox delivery. Walkthrough actions remain clearly separated from live outreach.</p>
  </div>
}
