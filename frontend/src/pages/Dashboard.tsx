import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApiQuery'
import { companiesService } from '../services/companies.service'
import { AlertCircleIcon, Building2Icon, MailIcon, RefreshCwIcon, UsersIcon, TrendingUpIcon, TargetIcon, SearchIcon, ArrowRightIcon, SlidersHorizontalIcon, GlobeIcon, CalendarDaysIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart as RechartsBarChart, Legend } from 'recharts'
import { analyticsService, SalesAnalyticsDashboard } from '../services/analytics.service'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { formatDate, formatNumber } from '../utils/formatters'
import api from '../services/api'
import { AiDashboardSummary } from '../components/ai/AiDashboardSummary'
import { PortfolioDashboard } from '../components/crm/PortfolioDashboard'

import { chartTheme } from '../components/charts/chartTheme'

const lineColors = { EMAIL_PROVIDER_ACCEPTED: chartTheme.primary, REPLY_RECEIVED: chartTheme.secondary, EMAIL_FAILED: chartTheme.muted }
const title = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const dayValue = (value: Date) => value.toISOString().slice(0, 10)

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number | null | undefined; detail: string; icon: typeof Building2Icon }) {
  return (
    <article className="card min-w-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-singtelGray-600">{label}</span>
        <Icon size={15} strokeWidth={1.75} className="shrink-0 text-singtelRed-600" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-singtelGray-900 tabular-nums">{value == null ? '—' : formatNumber(value)}</p>
      <p className="mt-1 text-xs leading-relaxed text-singtelGray-500">{detail}</p>
    </article>
  )
}

function ChartCard({ title: heading, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="card min-w-0 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-singtelGray-900">{heading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-singtelGray-500">{note}</p>
      </div>
      {children}
    </section>
  )
}

const loadRecentCompanies = (signal: AbortSignal) => companiesService.getCompanies({ limit: 5 }, signal)

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: recent, loading: companiesLoading, error: companiesError, refetch: refreshCompanies } = useApiQuery(loadRecentCompanies)
  const recentCompanies = recent?.data ?? []
  const [mutationError, setMutationError] = useState('')
  const [preset, setPreset] = useState('30')
  const [startDate, setStartDate] = useState(dayValue(new Date(Date.now() - 29 * 86400000)))
  const [endDate, setEndDate] = useState(dayValue(new Date()))
  const [filters, setFilters] = useState({ country: '', industry: '', service: '', agent: '', status: '' })
  const [busyIntervention, setBusyIntervention] = useState('')
  const [portfolioRevision, setPortfolioRevision] = useState(0)

  const fetchDashboard = useCallback((signal: AbortSignal) => {
    const params: Record<string, string> = { startDate: startDate + 'T00:00:00.000Z', endDate: endDate + 'T23:59:59.999Z', page: '1', limit: '20' }
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value
    return analyticsService.getSalesDashboard(params, signal)
  }, [startDate, endDate, filters])
  const { data, loading, error: loadError, refetch: load } = useApiQuery(fetchDashboard)
  const error = mutationError || loadError

  function changePeriod(value: string) {
    setPreset(value)
    if (value === 'custom') return
    const end = new Date()
    const start = value === 'today' ? end : new Date(end.getTime() - (Number(value) - 1) * 86400000)
    setStartDate(dayValue(start)); setEndDate(dayValue(end))
  }

  async function updateIntervention(item: SalesAnalyticsDashboard['interventions']['items'][number], status: string) {
    const interventionId = String(item.payload.interventionId)
    setBusyIntervention(interventionId); setMutationError('')
    try {
      await api.patch(`/api/v1/sales/companies/${encodeURIComponent(item.companyId)}/interventions/${encodeURIComponent(interventionId)}`, { status, assignedTo: item.assignedTo === 'Unassigned' ? 'Sales team' : item.assignedTo })
      load()
    } catch (e) { setMutationError(e instanceof Error ? e.message : 'Could not update this intervention.') }
    finally { setBusyIntervention('') }
  }

  const timeline = useMemo(() => {
    const map = new Map<string, Record<string, string | number>>()
    for (const row of data?.timeline ?? []) { const item = map.get(row.date) ?? { date: row.date }; item[row.type] = row.count; map.set(row.date, item) }
    return [...map.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)))
  }, [data])
  const funnelMax = Math.max(1, ...(data?.funnel.map(stage => stage.companies) ?? []))
  const metric = data?.metrics ?? {}
  const countries = data?.geography.map(row => row.country).filter(Boolean) ?? []
  const industries = data?.opportunities.byIndustry.map(row => row.industry).filter(Boolean) ?? []
  const services = data?.opportunities.byService.map(row => row.service).filter(Boolean) ?? []
  const agents = data?.agentPerformance.map(row => row.agent).filter(Boolean) ?? []

  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <PageHeader
      title="Singtel Scout"
      subtitle="Account portfolio, sales activity and outreach performance."
      actions={<>
        <button onClick={() => { setPortfolioRevision(value => value + 1); setMutationError(''); refreshCompanies(); load() }} disabled={loading} className="btn-secondary inline-flex items-center gap-2">
          <RefreshCwIcon size={15} className={loading ? 'animate-spin' : ''} />Refresh
        </button>
        <Link to="/lead-ranking" className="btn-primary inline-flex items-center gap-2"><SearchIcon size={15} />Find new customers</Link>
      </>}
    />

    <PortfolioDashboard refreshKey={portfolioRevision} />

    <nav aria-label="Sales workspace actions" className="flex flex-wrap gap-2">
      <Link to="/companies" className="btn-secondary inline-flex items-center gap-2"><SearchIcon size={15} />Research a company</Link>
      <Link to="/opportunities" className="btn-secondary inline-flex items-center gap-2"><TargetIcon size={15} />View opportunities</Link>
      <Link to="/crm" className="btn-secondary inline-flex items-center gap-2"><UsersIcon size={15} />Grow customer accounts</Link>
    </nav>

    <section aria-labelledby="discovery-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="discovery-heading" className="text-lg font-semibold tracking-tight text-singtelGray-900">Discovery and outreach analytics</h2>
        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium">
          <CalendarDaysIcon size={14} className="text-singtelGray-500" />
          <span className="sr-only">Reporting period</span>
          <select aria-label="Reporting period" value={preset} onChange={e => changePeriod(e.target.value)} className="bg-transparent text-singtelGray-700">
            <option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option>
          </select>
        </label>
      </div>
      <details key={preset === 'custom' ? 'custom' : 'standard'} open={preset === 'custom' || undefined} className="card px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-singtelGray-600"><SlidersHorizontalIcon size={14} className="mx-1.5 inline-block" />Reporting filters</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
          <label className="text-xs text-singtelGray-600">From<input type="date" value={startDate} onChange={e => { setPreset('custom'); setStartDate(e.target.value) }} className="mt-1 block rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-xs text-singtelGray-600">To<input type="date" value={endDate} onChange={e => { setPreset('custom'); setEndDate(e.target.value) }} className="mt-1 block rounded-lg border px-3 py-2 text-sm" /></label>
      {(['country', 'industry', 'service', 'agent', 'status'] as const).map(key => <label key={key} className="text-xs capitalize text-gray-500">{key}<select value={filters[key]} onChange={e => setFilters(current => ({ ...current, [key]: e.target.value }))} className="mt-1 block max-w-44 rounded-lg border px-3 py-2 text-sm text-gray-700"><option value="">{({ country: 'All countries', industry: 'All industries', service: 'All services', agent: 'All agents', status: 'All statuses' })[key]}</option>{(key === 'country' ? countries : key === 'industry' ? industries : key === 'service' ? services : key === 'agent' ? agents : ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_INTERNAL_INFORMATION', 'RESOLVED', 'CLOSED']).map(value => <option key={value} value={value}>{title(value)}</option>)}</select></label>)}
      {data && <span className="ml-auto text-[11px] text-singtelGray-500">{data.dataMode === 'memory_preview' ? 'Session data' : 'MongoDB aggregates'} · UTC</span>}
        </div>
      </details>
    {error && <div role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertCircleIcon className="h-4 w-4 shrink-0" />{error}</div>}
    {loading && !data ? <LoadingSpinner label="Loading sales analytics…" /> : data && <>
      <section><div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold text-gray-800">Sales activity</h2><p className="text-xs text-singtelGray-500">{new Date(data.period.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' })} – {new Date(data.period.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}</p></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Discovered" value={metric.totalCompaniesDiscovered} detail="Unique companies" icon={Building2Icon} />
        <Metric label="Qualified" value={metric.qualifiedCompanies} detail="Evidence-linked hypotheses" icon={TargetIcon} />
        <Metric label="Selected" value={metric.companiesSelected} detail="For sales outreach" icon={UsersIcon} />
        <Metric label="Emails accepted" value={metric.emailsAcceptedByProvider} detail="Provider accepted · inbox unknown" icon={MailIcon} />
        <Metric label="Companies replied" value={metric.uniqueCompaniesThatReplied} detail={`${metric.responseRatePct ?? 0}% of contacted companies`} icon={TrendingUpIcon} />
        <Metric label="Positive intent" value={metric.interestedCompanies} detail="Unique companies" icon={TrendingUpIcon} />
        <Metric label="Meetings requested" value={metric.meetingsRequested} detail="Customer meeting requests" icon={UsersIcon} />
        <Metric label="Open interventions" value={metric.pendingInterventions} detail={`${metric.highPriorityInterventions ?? 0} high / critical`} icon={AlertCircleIcon as typeof Building2Icon} />
      </div></section>



      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Outreach and replies over time" note="Email events in the selected reporting period.">{timeline.length ? <ResponsiveContainer width="100%" height={260}><LineChart data={timeline}><CartesianGrid vertical={false} stroke={chartTheme.grid} strokeDasharray="3 4" /><XAxis axisLine={false} tickLine={false} dataKey="date" tick={chartTheme.axis} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={chartTheme.tooltip} /><Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" /><Line type="monotone" dataKey="EMAIL_PROVIDER_ACCEPTED" name="Provider accepted" stroke={lineColors.EMAIL_PROVIDER_ACCEPTED} strokeWidth={2} /><Line type="monotone" dataKey="REPLY_RECEIVED" name="Replies received" stroke={lineColors.REPLY_RECEIVED} strokeWidth={2} /><Line type="monotone" dataKey="EMAIL_FAILED" name="Failed attempts" strokeDasharray="4 3" stroke={lineColors.EMAIL_FAILED} strokeWidth={2} /></LineChart></ResponsiveContainer> : <p className="p-8 text-sm text-gray-500">No outreach activity in this period.</p>}</ChartCard>
        <ChartCard title="Sales funnel" note={data.funnelDenominator}>
          {data.funnel.some(stage => stage.companies > 0) ? <div className="space-y-3">
            {data.funnel.map((stage, index) => (
              <div key={stage.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-medium text-singtelGray-700">{stage.name}</p>
                  <span className="text-sm font-semibold tabular-nums text-singtelGray-900">{formatNumber(stage.companies)}</span>
                </div>
                <div className="my-1 h-1.5 overflow-hidden rounded-full bg-singtelGray-100">
                  <div className={index === 0 ? 'h-full rounded-full bg-singtelRed' : 'h-full rounded-full bg-singtelGray-500'} style={{ width: `${100 * stage.companies / funnelMax}%` }} />
                </div>
                <p className="text-[11px] text-singtelGray-500">{index ? `${stage.conversionPct}% from previous · ${stage.dropoffPct}% drop-off` : 'Starting cohort'} · Previous period: {stage.previousPeriodCompanies}</p>
              </div>
            ))}
          </div> : <p className="rounded-lg bg-singtelGray-50 p-5 text-sm text-singtelGray-500">No companies progressed through the funnel in this reporting period.</p>}
        </ChartCard>
      </div>

      <AiDashboardSummary />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Reply intent" note="Reply topics and sentiment for the selected period.">{data.intentDistribution.some(row => row.count > 0) ? <ResponsiveContainer width="100%" height={260}><RechartsBarChart data={data.intentDistribution.filter(row => row.count > 0)} layout="vertical" margin={{ left: 28 }}><CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 4" horizontal={false} /><XAxis axisLine={false} tickLine={false} type="number" allowDecimals={false} /><YAxis axisLine={false} tickLine={false} type="category" dataKey="intent" width={155} tick={chartTheme.axis} tickFormatter={title} /><Tooltip contentStyle={chartTheme.tooltip} formatter={(value, _name, item) => [`${value} replies · ${item.payload.companies} companies`, 'Count']} /><Bar dataKey="count" fill={chartTheme.primary} radius={[0, 4, 4, 0]} /></RechartsBarChart></ResponsiveContainer> : <p className="p-8 text-sm text-gray-500">No classified replies in this period.</p>}<div className="mt-3 flex flex-wrap gap-2">{data.sentimentDistribution.map(row => <span key={row.sentiment} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">{title(row.sentiment)} sentiment: {row.count}</span>)}</div></ChartCard>
        <ChartCard title="Human intervention queue" note={`Average resolution: ${metric.averageInterventionResolutionMs == null ? 'No resolved cases' : `${Math.round(Number(metric.averageInterventionResolutionMs) / 3600000 * 10) / 10} hours`}. Overdue threshold is not configured.`}><div className="mb-4 grid grid-cols-4 gap-2">{data.interventions.byPriority.map(row => <div key={row.priority} className="rounded bg-gray-50 p-2 text-center"><p className="text-[10px] text-gray-500">{title(row.priority)}</p><strong>{row.count}</strong></div>)}</div>{data.interventions.byReason.some(row => row.count) ? <ResponsiveContainer width="100%" height={220}><RechartsBarChart data={data.interventions.byReason.filter(row => row.count)}><CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 4" vertical={false} /><XAxis axisLine={false} tickLine={false} dataKey="reason" tick={chartTheme.axis} tickFormatter={title} interval={0} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={chartTheme.tooltip} formatter={(value, _name, item) => [value, title(item.payload.reason)]} /><Bar dataKey="count" fill={chartTheme.secondary} /></RechartsBarChart></ResponsiveContainer> : <p className="p-6 text-sm text-gray-500">No intervention is required in this period.</p>}</ChartCard>
        <ChartCard title="Qualified service demand" note="Count of distinct companies with a Discovery service match.">{data.opportunities.byService.length ? <ResponsiveContainer width="100%" height={260}><RechartsBarChart data={data.opportunities.byService} layout="vertical" margin={{ left: 18 }}><CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 4" horizontal={false} /><XAxis axisLine={false} tickLine={false} type="number" allowDecimals={false} /><YAxis axisLine={false} tickLine={false} type="category" dataKey="service" width={155} tick={chartTheme.axis} /><Tooltip contentStyle={chartTheme.tooltip} /><Bar dataKey="count" fill={chartTheme.primary} radius={[0, 4, 4, 0]} /></RechartsBarChart></ResponsiveContainer> : <p className="p-8 text-sm text-gray-500">No service-qualified companies in this period.</p>}</ChartCard>
      </div>

      <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-gray-800">Actionable human interventions</h2><p className="mt-1 text-xs text-gray-500">Latest state per intervention · click the company to open its conversation.</p></div><button onClick={() => window.location.assign('/sales?tab=interventions')} className="text-xs font-medium text-singtelRed-700">Open intervention queue</button></div>{data.interventions.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-3">Company / contact</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned / status</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Update</th></tr></thead><tbody>{data.interventions.items.map(item => <tr key={String(item.payload.interventionId)} className="border-t"><td className="px-4 py-3"><a href={`/sales/companies/${encodeURIComponent(item.companyId)}`} className="font-medium text-singtelGray-900 underline">{item.companyName}</a><small className="block text-gray-500">{item.contactName ?? 'Contact'}</small></td><td className="px-4 py-3 text-xs">{title(item.reason ?? 'OTHER')}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${['HIGH', 'CRITICAL'].includes(item.priority?.toUpperCase() ?? '') ? 'bg-singtelRed-50 text-singtelRed-700' : 'bg-singtelGray-50 text-singtelGray-600'}`}>{title(item.priority ?? 'Unspecified')}</span></td><td className="px-4 py-3">{item.assignedTo}<small className="mt-1 block text-gray-500">{title(item.status ?? 'Pending')}</small></td><td className="px-4 py-3 text-xs text-gray-500">{Math.max(0, Math.floor((Date.now() - Date.parse(item.createdAt)) / 86400000))}d</td><td className="px-4 py-3"><select aria-label="Intervention status" disabled={busyIntervention === String(item.payload.interventionId) || ['RESOLVED', 'CLOSED'].includes(item.status ?? '')} value={item.status} onChange={e => void updateIntervention(item, e.target.value)} className="rounded border px-2 py-1 text-xs"><option>PENDING</option><option>ASSIGNED</option><option>IN_PROGRESS</option><option>WAITING_FOR_CUSTOMER</option><option>WAITING_FOR_INTERNAL_INFORMATION</option><option>RESOLVED</option><option>CLOSED</option></select></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-gray-500">No intervention records are in this period.</p>}</section>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Discovery by country" note="Companies with a recorded country.">{data.geography.length ? <ResponsiveContainer width="100%" height={230}><RechartsBarChart data={data.geography}><CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 4" vertical={false} /><XAxis axisLine={false} tickLine={false} dataKey="country" tick={chartTheme.axis} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={chartTheme.tooltip} /><Bar dataKey="count" fill={chartTheme.primary} radius={[4, 4, 0, 0]} /></RechartsBarChart></ResponsiveContainer> : <p className="p-6 text-sm text-gray-500">No country data is available.</p>}</ChartCard>
        <ChartCard title="Qualified opportunities by industry" note="Distinct company matches in the selected period.">{data.opportunities.byIndustry.length ? <ResponsiveContainer width="100%" height={230}><RechartsBarChart data={data.opportunities.byIndustry}><CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 4" vertical={false} /><XAxis axisLine={false} tickLine={false} dataKey="industry" tick={chartTheme.axis} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={chartTheme.tooltip} /><Bar dataKey="count" fill={chartTheme.secondary} /></RechartsBarChart></ResponsiveContainer> : <p className="p-6 text-sm text-gray-500">No industry breakdown is available.</p>}</ChartCard>
        <ChartCard title="Agent activity" note="Automation success excludes tasks that still require a human response.">{data.agentPerformance.length ? <div className="space-y-3">{data.agentPerformance.map(agent => <div key={agent.agent} className="rounded-lg bg-gray-50 p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{agent.agent}</strong><span className="text-xs text-singtelRed-700">{agent.automationRatePct}% completed</span></div><p className="mt-1 text-xs text-gray-500">{agent.runs} runs · {agent.failed} failed · {agent.averageExecutionMs} ms average</p><p className="text-xs text-gray-500">{agent.lowConfidenceClassifications} low confidence · {agent.humanEscalationRatePct}% human escalation</p></div>)}</div> : <p className="p-6 text-sm text-gray-500">No agent execution events are recorded in this period.</p>}</ChartCard>
      </div>

      <section className="card p-5"><h2 className="text-sm font-semibold text-gray-800">Evidence-based business insights</h2><p className="mt-1 text-xs text-gray-500">Insights are generated from the structured metrics shown above.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{data.insights.map((insight, index) => <article key={`${insight.supportingMetric}-${index}`} className="rounded-lg border border-gray-200 bg-singtelGray-50 p-4"><p className="text-sm font-medium text-singtelGray-900">{insight.insight}</p><p className="mt-2 text-xs text-singtelGray-600">Metric: {insight.supportingMetric} · confidence {Math.round(insight.confidence * 100)}%</p><p className="mt-1 text-xs text-gray-600">Suggested action: {insight.recommendedAction}</p></article>)}</div></section>

      <details className="card p-5"><summary className="cursor-pointer text-sm font-semibold text-gray-800">Detailed conversion and response KPIs</summary><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(metric).map(([key, value]) => <div key={key} className="rounded bg-gray-50 p-3"><p className="text-[11px] text-gray-500">{title(key)}</p><strong className="text-gray-800">{value == null ? 'No data' : `${formatNumber(Number(value))}${key.endsWith('Pct') ? '%' : ''}`}</strong></div>)}</div><p className="mt-4 text-[11px] text-gray-500">{data.definitions.providerAccepted} {data.definitions.uniqueCompanyReply} {data.definitions.sentiment}</p></details>
    </>}
    </section>
    {/* Recent companies */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Recent companies</h3>
            <p className="text-xs text-singtelGray-500 mt-0.5">Latest additions to the tracked workspace</p>
          </div>
          <button
            onClick={() => navigate('/companies')}
            className="inline-flex items-center gap-1 text-xs font-medium text-singtelRed-600 hover:text-singtelRed-700 transition-colors"
          >
            View all
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </div>

        {companiesLoading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-singtelGray-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-singtelGray-500 uppercase tracking-widest">Company</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-singtelGray-500 uppercase tracking-widest">Industry</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-singtelGray-500 uppercase tracking-widest">Country</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-singtelGray-500 uppercase tracking-widest">Stage</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-singtelGray-500 uppercase tracking-widest">Added</th>
              </tr>
            </thead>
            <tbody>
              {recentCompanies.slice(0, 5).map((company) => (
                <tr
                  key={company._id}
                  className="border-b border-gray-50 last:border-0 hover:bg-singtelGray-50/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/companies/${company._id}`)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-singtelGray-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-singtelGray-900">
                          {company.companyName.charAt(0)}
                        </span>
                      </div>
                      <Link className="font-semibold text-gray-800 hover:text-singtelRed" to={`/companies/${company._id}`} onClick={event => event.stopPropagation()}>{company.companyName}</Link>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{company.industry ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <GlobeIcon className="w-3 h-3 text-singtelGray-500" />
                      {company.country ?? '—'}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">{company.companyStage ?? '—'}</td>
                  <td className="px-5 py-3 text-xs text-singtelGray-500">{formatDate(company.createdAt)}</td>
                </tr>
              ))}
              {!recentCompanies.length && <tr><td colSpan={5} className="px-5 py-5 text-sm text-singtelGray-500">{companiesError ? 'Recent companies could not be loaded.' : 'No recent companies.'}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

  </div>
}
