import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompanies } from '../hooks/useCompanies'
import { AlertCircleIcon, Building2Icon, MailIcon, RefreshCwIcon, UsersIcon, TrendingUpIcon, TargetIcon, SparklesIcon, ArrowRightIcon, BuildingIcon, GlobeIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart as RechartsBarChart, Cell } from 'recharts'
import { analyticsService, SalesAnalyticsDashboard } from '../services/analytics.service'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { formatDate, formatNumber } from '../utils/formatters'
import api from '../services/api'
import { AiDashboardSummary } from '../components/ai/AiDashboardSummary'

const lineColors: Record<string, string> = { EMAIL_PROVIDER_ACCEPTED: '#1e3a5f', REPLY_RECEIVED: '#0d9488', EMAIL_FAILED: '#dc2626' }
const title = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const dayValue = (value: Date) => value.toISOString().slice(0, 10)

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number | null | undefined; detail: string; icon: typeof Building2Icon }) {
  return <article className="card p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-gray-500">{label}</span><Icon className="h-4 w-4 text-teal-600" /></div><p className="mt-2 text-2xl font-semibold text-navy-600">{value == null ? '—' : formatNumber(value)}</p><p className="mt-1 text-[11px] text-gray-400">{detail}</p></article>
}

function ChartCard({ title: heading, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="card p-5"><div className="mb-3"><h2 className="text-sm font-semibold text-gray-800">{heading}</h2><p className="mt-1 text-xs text-gray-500">{note}</p></div>{children}</section>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { companies: recentCompanies, loading: companiesLoading } = useCompanies({ limit: 5 })
  const [data, setData] = useState<SalesAnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preset, setPreset] = useState('30')
  const [startDate, setStartDate] = useState(dayValue(new Date(Date.now() - 29 * 86400000)))
  const [endDate, setEndDate] = useState(dayValue(new Date()))
  const [filters, setFilters] = useState({ country: '', industry: '', service: '', agent: '', status: '' })
  const [busyIntervention, setBusyIntervention] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const search = new URLSearchParams({ startDate: `${startDate}T00:00:00.000Z`, endDate: `${endDate}T23:59:59.999Z`, page: '1', limit: '20' })
      for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value)
      setData(await analyticsService.getSalesDashboard(Object.fromEntries(search.entries())))
    } catch (e) { setError(e instanceof Error ? e.message : 'Analytics could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [startDate, endDate, filters.country, filters.industry, filters.service, filters.agent, filters.status])

  function changePeriod(value: string) {
    setPreset(value)
    const end = new Date()
    const start = value === 'today' ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : new Date(end.getTime() - (Number(value) - 1) * 86400000)
    setStartDate(dayValue(start)); setEndDate(dayValue(end))
  }

  async function updateIntervention(item: SalesAnalyticsDashboard['interventions']['items'][number], status: string) {
    const interventionId = String(item.payload.interventionId)
    setBusyIntervention(interventionId); setError('')
    try {
      await api.patch(`/api/v1/sales/companies/${encodeURIComponent(item.companyId)}/interventions/${encodeURIComponent(interventionId)}`, { status, assignedTo: item.assignedTo === 'Unassigned' ? 'Sales team' : item.assignedTo })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update this intervention.') }
    finally { setBusyIntervention('') }
  }

  const timeline = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>()
    for (const row of data?.timeline ?? []) { const item = map.get(row.date) ?? { date: row.date }; item[row.type] = row.count; map.set(row.date, item) }
    return [...map.values()]
  }, [data])
  const metric = data?.metrics ?? {}
  const countries = data?.geography.map(row => row.country).filter(Boolean) ?? []
  const industries = data?.opportunities.byIndustry.map(row => row.industry).filter(Boolean) ?? []
  const services = data?.opportunities.byService.map(row => row.service).filter(Boolean) ?? []
  const agents = data?.agentPerformance.map(row => row.agent).filter(Boolean) ?? []

  return <div className="max-w-7xl mx-auto space-y-6">
    <PageHeader title="Singtel Scout — Sales Intelligence" subtitle="A live view of discovery, evidence-qualified opportunities, outreach, replies, and human follow-up." actions={<button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600"><RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>} />
    {/* Hero banner */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2D5080 60%, #0D9488 100%)' }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white translate-x-20 -translate-y-20" />
          <div className="absolute bottom-0 left-32 w-40 h-40 rounded-full bg-white translate-y-16" />
        </div>
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SparklesIcon className="w-4 h-4 text-teal-300" />
              <span className="text-xs font-semibold text-teal-300 uppercase tracking-widest">AI-Powered Intelligence</span>
            </div>
            <h2 className="text-xl font-bold leading-tight">Singtel Scout</h2>
            <p className="text-white/70 text-sm mt-1 max-w-md">
              Identifying enterprise opportunities across APAC through live public research and AI analysis.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{formatNumber(metric.totalCompaniesDiscovered ?? 0)}</p>
              <p className="text-xs text-white/60 mt-0.5">Companies discovered</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-center">
              <p className="text-2xl font-bold">{formatNumber(metric.qualifiedCompanies ?? 0)}</p>
              <p className="text-xs text-white/60 mt-0.5">Qualified companies</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-center">
              <p className="text-2xl font-bold">{formatNumber(metric.pendingInterventions ?? 0)}</p>
              <p className="text-xs text-white/60 mt-0.5">Follow-ups pending</p>
            </div>
          </div>
        </div>
      </div>


    {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/companies')}
          className="card card-hover p-5 text-left flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-navy-50 flex items-center justify-center">
              <BuildingIcon className="w-5 h-5 text-navy-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Research a Company</p>
              <p className="text-xs text-gray-500 mt-0.5">Search and generate an AI discovery brief</p>
            </div>
          </div>
          <ArrowRightIcon className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
        </button>

        <button
          onClick={() => navigate('/opportunities')}
          className="card card-hover p-5 text-left flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <TargetIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">View Opportunities</p>
              <p className="text-xs text-gray-500 mt-0.5">Track and prioritise service opportunities</p>
            </div>
          </div>
          <ArrowRightIcon className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
        </button>
      </div>


    <section className="card flex flex-wrap items-end gap-3 p-4">
      <label className="text-xs text-gray-500">Reporting period<select value={preset} onChange={e => changePeriod(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-gray-700"><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option></select></label>
      <label className="text-xs text-gray-500">From<input type="date" value={startDate} onChange={e => { setPreset('custom'); setStartDate(e.target.value) }} className="mt-1 block rounded-lg border px-3 py-2 text-sm" /></label>
      <label className="text-xs text-gray-500">To<input type="date" value={endDate} onChange={e => { setPreset('custom'); setEndDate(e.target.value) }} className="mt-1 block rounded-lg border px-3 py-2 text-sm" /></label>
      {(['country', 'industry', 'service', 'agent', 'status'] as const).map(key => <label key={key} className="text-xs capitalize text-gray-500">{key}<select value={filters[key]} onChange={e => setFilters(current => ({ ...current, [key]: e.target.value }))} className="mt-1 block max-w-44 rounded-lg border px-3 py-2 text-sm text-gray-700"><option value="">All {key}s</option>{(key === 'country' ? countries : key === 'industry' ? industries : key === 'service' ? services : key === 'agent' ? agents : ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL_INFORMATION', 'RESOLVED', 'CLOSED']).map(value => <option key={value} value={value}>{title(value)}</option>)}</select></label>)}
      {data && <span className="ml-auto text-[11px] text-gray-400">{data.dataMode === 'memory_preview' ? 'Preview data' : 'MongoDB aggregates'}{data.containsSyntheticData ? ' · includes synthetic demo records' : ''} · UTC</span>}
    </section>
    {error && <div role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertCircleIcon className="h-4 w-4 shrink-0" />{error}</div>}
    {loading && !data ? <LoadingSpinner label="Loading sales analytics…" /> : data && <>
      <section><div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold text-gray-800">Sales activity</h2><p className="text-xs text-gray-400">{new Date(data.period.startDate).toLocaleDateString()} – {new Date(data.period.endDate).toLocaleDateString()}</p></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Discovered" value={metric.totalCompaniesDiscovered} detail="Unique companies" icon={Building2Icon} />
        <Metric label="Qualified" value={metric.qualifiedCompanies} detail="Evidence-linked hypotheses" icon={TargetIcon} />
        <Metric label="Selected" value={metric.companiesSelected} detail="For sales outreach" icon={UsersIcon} />
        <Metric label="Emails accepted" value={metric.emailsAcceptedByProvider} detail="Provider accepted · inbox unknown" icon={MailIcon} />
        <Metric label="Companies replied" value={metric.uniqueCompaniesThatReplied} detail={`${metric.responseRatePct ?? 0}% of contacted companies`} icon={TrendingUpIcon} />
        <Metric label="Positive intent" value={metric.interestedCompanies} detail="Unique companies" icon={TrendingUpIcon} />
        <Metric label="Meetings requested" value={metric.meetingsRequested} detail="Requests, not confirmations" icon={UsersIcon} />
        <Metric label="Open interventions" value={metric.pendingInterventions} detail={`${metric.highPriorityInterventions ?? 0} high / critical`} icon={AlertCircleIcon as typeof Building2Icon} />
      </div></section>

      <AiDashboardSummary />

      <ChartCard title="Distinct-company sales funnel" note={data.funnelDenominator}>
        {data.funnel.some(stage => stage.companies > 0) ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">{data.funnel.map((stage, i) => <div key={stage.name} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{i + 1}. {stage.name}</p><p className="mt-1 text-xl font-semibold text-navy-600">{formatNumber(stage.companies)}</p><p className="mt-1 text-[11px] text-teal-700">{i ? `${stage.conversionPct}% from previous` : 'Starting cohort'}{i ? ` · ${stage.dropoffPct}% drop-off` : ''}</p><p className="text-[10px] text-gray-400">Previous period: {stage.previousPeriodCompanies}</p></div>)}</div> : <p className="rounded-lg bg-gray-50 p-5 text-sm text-gray-500">No companies progressed through the funnel in this reporting period.</p>}
      </ChartCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Outreach and replies over time" note="Counts are email events; company response rate is shown separately.">{timeline.length ? <ResponsiveContainer width="100%" height={260}><LineChart data={timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="EMAIL_PROVIDER_ACCEPTED" name="Provider accepted" stroke={lineColors.EMAIL_PROVIDER_ACCEPTED} strokeWidth={2} /><Line type="monotone" dataKey="REPLY_RECEIVED" name="Replies received" stroke={lineColors.REPLY_RECEIVED} strokeWidth={2} /><Line type="monotone" dataKey="EMAIL_FAILED" name="Failed attempts" stroke={lineColors.EMAIL_FAILED} strokeWidth={2} /></LineChart></ResponsiveContainer> : <p className="p-8 text-sm text-gray-500">No outreach activity in this period.</p>}</ChartCard>
        <ChartCard title="Reply intent" note="Intent indicates the reply topic; sentiment measures tone and is not buying intent.">{data.intentDistribution.some(row => row.count > 0) ? <ResponsiveContainer width="100%" height={260}><RechartsBarChart data={data.intentDistribution.filter(row => row.count > 0)} layout="vertical" margin={{ left: 28 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="intent" width={155} tick={{ fontSize: 10 }} tickFormatter={title} /><Tooltip formatter={(value, _name, item) => [`${value} replies · ${item.payload.companies} companies`, 'Count']} /><Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} /></RechartsBarChart></ResponsiveContainer> : <p className="p-8 text-sm text-gray-500">No classified replies in this period.</p>}<div className="mt-3 flex flex-wrap gap-2">{data.sentimentDistribution.map(row => <span key={row.sentiment} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">{title(row.sentiment)} sentiment: {row.count}</span>)}</div></ChartCard>
        <ChartCard title="Human intervention queue" note={`Average resolution: ${metric.averageInterventionResolutionMs == null ? 'No resolved cases' : `${Math.round(Number(metric.averageInterventionResolutionMs) / 3600000 * 10) / 10} hours`}. Overdue threshold is not configured.`}><div className="mb-4 grid grid-cols-4 gap-2">{data.interventions.byPriority.map(row => <div key={row.priority} className="rounded bg-gray-50 p-2 text-center"><p className="text-[10px] text-gray-500">{title(row.priority)}</p><strong>{row.count}</strong></div>)}</div>{data.interventions.byReason.some(row => row.count) ? <ResponsiveContainer width="100%" height={220}><RechartsBarChart data={data.interventions.byReason.filter(row => row.count)}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="reason" tick={{ fontSize: 9 }} tickFormatter={title} interval={0} /><YAxis allowDecimals={false} /><Tooltip formatter={(value, _name, item) => [value, title(item.payload.reason)]} /><Bar dataKey="count" fill="#3d6ba3" /></RechartsBarChart></ResponsiveContainer> : <p className="p-6 text-sm text-gray-500">No intervention is required in this period.</p>}</ChartCard>
        <ChartCard title="Qualified service demand" note="Count of distinct companies with a Discovery service match.">{data.opportunities.byService.length ? <ResponsiveContainer width="100%" height={260}><RechartsBarChart data={data.opportunities.byService} layout="vertical" margin={{ left: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="service" width={155} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" fill="#1e3a5f" radius={[0, 4, 4, 0]} /></RechartsBarChart></ResponsiveContainer> : <p className="p-8 text-sm text-gray-500">No service-qualified companies in this period.</p>}</ChartCard>
      </div>

      <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-gray-800">Actionable human interventions</h2><p className="mt-1 text-xs text-gray-500">Latest state per intervention · click the company to open its conversation.</p></div><button onClick={() => window.location.assign('/sales?tab=interventions')} className="text-xs font-medium text-teal-700">Open intervention queue</button></div>{data.interventions.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-3">Company / contact</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned / status</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Update</th></tr></thead><tbody>{data.interventions.items.map(item => <tr key={String(item.payload.interventionId)} className="border-t"><td className="px-4 py-3"><a href={`/sales/companies/${encodeURIComponent(item.companyId)}`} className="font-medium text-navy-600 underline">{item.companyName}</a><small className="block text-gray-500">{item.contactName ?? 'Contact'}</small></td><td className="px-4 py-3 text-xs">{title(item.reason ?? 'OTHER')}</td><td className="px-4 py-3">{item.priority}</td><td className="px-4 py-3">{item.assignedTo}<small className="block text-gray-500">{item.status}</small></td><td className="px-4 py-3 text-xs text-gray-500">{Math.max(0, Math.floor((Date.now() - Date.parse(item.createdAt)) / 86400000))}d</td><td className="px-4 py-3"><select aria-label="Intervention status" disabled={busyIntervention === String(item.payload.interventionId) || ['RESOLVED', 'CLOSED'].includes(item.status ?? '')} value={item.status} onChange={e => void updateIntervention(item, e.target.value)} className="rounded border px-2 py-1 text-xs"><option>PENDING</option><option>ASSIGNED</option><option>IN_PROGRESS</option><option>WAITING_FOR_CUSTOMER</option><option>WAITING_FOR_INTERNAL_INFORMATION</option><option>RESOLVED</option><option>CLOSED</option></select></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-gray-500">No intervention records are in this period.</p>}</section>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Discovery by country" note="Known country only; missing locations are excluded.">{data.geography.length ? <ResponsiveContainer width="100%" height={230}><RechartsBarChart data={data.geography}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="country" tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count">{data.geography.map((row, i) => <Cell key={row.country} fill={['#1e3a5f', '#0d9488', '#3d6ba3', '#47c1bc'][i % 4]} />)}</Bar></RechartsBarChart></ResponsiveContainer> : <p className="p-6 text-sm text-gray-500">No country data is available.</p>}</ChartCard>
        <ChartCard title="Qualified opportunities by industry" note="Distinct company matches in the selected period.">{data.opportunities.byIndustry.length ? <ResponsiveContainer width="100%" height={230}><RechartsBarChart data={data.opportunities.byIndustry}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="industry" tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#47c1bc" /></RechartsBarChart></ResponsiveContainer> : <p className="p-6 text-sm text-gray-500">No industry breakdown is available.</p>}</ChartCard>
        <ChartCard title="Agent activity" note="Automation success excludes tasks that still require a human response.">{data.agentPerformance.length ? <div className="space-y-3">{data.agentPerformance.map(agent => <div key={agent.agent} className="rounded-lg bg-gray-50 p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{agent.agent}</strong><span className="text-xs text-teal-700">{agent.automationRatePct}% completed</span></div><p className="mt-1 text-xs text-gray-500">{agent.runs} runs · {agent.failed} failed · {agent.averageExecutionMs} ms average</p><p className="text-xs text-gray-500">{agent.lowConfidenceClassifications} low confidence · {agent.humanEscalationRatePct}% human escalation</p></div>)}</div> : <p className="p-6 text-sm text-gray-500">No agent execution events are recorded in this period.</p>}</ChartCard>
      </div>

      <section className="card p-5"><h2 className="text-sm font-semibold text-gray-800">Evidence-based business insights</h2><p className="mt-1 text-xs text-gray-500">Insights are generated from the structured metrics shown above.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{data.insights.map((insight, index) => <article key={`${insight.supportingMetric}-${index}`} className="rounded-lg border border-teal-100 bg-teal-50 p-4"><p className="text-sm font-medium text-teal-900">{insight.insight}</p><p className="mt-2 text-xs text-teal-800">Metric: {insight.supportingMetric} · confidence {Math.round(insight.confidence * 100)}%</p><p className="mt-1 text-xs text-gray-600">Suggested action: {insight.recommendedAction}</p></article>)}</div></section>

      <details className="card p-5"><summary className="cursor-pointer text-sm font-semibold text-gray-800">Detailed conversion and response KPIs</summary><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(metric).map(([key, value]) => <div key={key} className="rounded bg-gray-50 p-3"><p className="text-[11px] text-gray-500">{title(key)}</p><strong className="text-gray-800">{value == null ? 'No data' : `${formatNumber(Number(value))}${key.endsWith('Pct') ? '%' : ''}`}</strong></div>)}</div><p className="mt-4 text-[11px] text-gray-500">{data.definitions.providerAccepted} {data.definitions.uniqueCompanyReply} {data.definitions.sentiment}</p></details>
    </>}
    {/* Recent Companies */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Recent Companies</h3>
            <p className="text-xs text-gray-400 mt-0.5">Latest additions to the tracked workspace</p>
          </div>
          <button
            onClick={() => navigate('/companies')}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
          >
            View all
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </div>

        {companiesLoading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#F8FAFC' }} className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Company</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Industry</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Country</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Stage</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Added</th>
              </tr>
            </thead>
            <tbody>
              {recentCompanies.slice(0, 5).map((company) => (
                <tr
                  key={company._id}
                  className="border-b border-gray-50 last:border-0 hover:bg-teal-50/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/companies/${company._id}`)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-navy-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-navy-600">
                          {company.companyName.charAt(0)}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-800">{company.companyName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{company.industry ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <GlobeIcon className="w-3 h-3 text-gray-400" />
                      {company.country ?? '—'}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">{company.companyStage ?? '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{formatDate(company.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

  </div>
}
