import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangleIcon, BellIcon, BotIcon, CheckIcon, InboxIcon, Loader2Icon, MailIcon, MessageSquareIcon, OctagonIcon, PlayIcon,
  RefreshCwIcon, SearchIcon, SendIcon, UserCheckIcon, UsersIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { AiManagementControl } from '../components/ai/AiManagementControl'
import { AgentWorkspaces } from '../components/ai/AgentWorkspaces'
import { AiManagementSettingsPanel } from '../components/ai/AiManagementSettingsPanel'
import { CommunicationBadge, ManagementBadge, PriorityBadge } from '../components/ai/AiStatusBadge'
import { aiManagementService, AiNotification, Analytics, apiError, CompanyRow, FollowUp, label, when } from '../services/aiManagement.service'

const TABS = [['companies', 'Companies'], ['attention', 'Human attention'], ['notifications', 'Notifications'], ['followups', 'Follow-ups'], ['settings', 'Settings']] as const
type Tab = typeof TABS[number][0]
const conversationLink = (companyId: string) => '/ai-management/companies/' + encodeURIComponent(companyId)

function Stat({ label: name, value, detail, tone = 'text-singtelGray-800', icon: Icon }: { label: string; value: number | string; detail?: string; tone?: string; icon: typeof BotIcon }) {
  return <article className="bg-white px-4 py-3.5"><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 shrink-0 text-singtelGray-500" /><span className="text-xs font-medium text-singtelGray-600">{name}</span></div>
    <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${tone}`}>{value}</p>{detail && <p className="mt-1 text-[11px] text-singtelGray-500">{detail}</p>}</article>
}

export function AttentionCard({ item, onChanged }: { item: AiNotification; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('')
    try { await action(); onChanged(message) } catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }
  return <article className={`card p-4 ${item.unread ? 'border-l-4 border-l-singtelRed' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={item.priority} /><span className="text-[11px] uppercase tracking-wide text-singtelGray-500">{label(item.type)}</span>
        {item.status === 'ACKNOWLEDGED' && <span className="text-[11px] text-singtelGray-700">Owned by {item.owner}</span>}</div>
        <h3 className="mt-1 font-semibold text-singtelGray-800"><Link to={conversationLink(item.companyId)} className="hover:underline">{item.title}</Link></h3>
        <p className="text-xs text-singtelGray-500">{item.companyName}{item.contactName ? ' · ' + item.contactName : ''} · {when(item.createdAt)}</p></div>
      {item.opportunityScore != null && <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">Opportunity score {item.opportunityScore}</span>}
    </div>
    {item.latestMessage && <blockquote className="mt-3 whitespace-pre-wrap rounded border-l-2 border-gray-300 bg-gray-50 p-2 text-sm text-gray-700">{item.latestMessage}</blockquote>}
    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      <div><dt className="font-medium text-singtelGray-500">Why escalated</dt><dd className="text-gray-700">{item.reason ?? item.summary}</dd></div>
      <div><dt className="font-medium text-singtelGray-500">AI interpretation</dt><dd className="text-gray-700">{item.intent ? label(item.intent) : '—'}{item.sentiment ? ' · ' + label(item.sentiment) + ' tone' : ''}
        {item.buyingIntent ? ' · buying intent ' + item.buyingIntent.toLowerCase() : ''}</dd></div>
      {item.buyingSignals.length > 0 && <div><dt className="font-medium text-singtelGray-500">Buying signals</dt><dd className="text-gray-700">{item.buyingSignals.join('; ')}</dd></div>}
      {item.requirements.length > 0 && <div><dt className="font-medium text-singtelGray-500">Requirements</dt><dd className="text-gray-700">{item.requirements.join('; ')}</dd></div>}
      {item.recommendation && <div className="sm:col-span-2"><dt className="font-medium text-singtelGray-500">Recommended action</dt><dd className="text-gray-700">{item.recommendation}</dd></div>}
    </dl>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {item.companyId !== 'global' && <div className="mt-3 flex flex-wrap gap-2">
      <Link to={conversationLink(item.companyId)} onClick={() => { if (item.unread) void aiManagementService.markRead(item.notificationId) }} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><MessageSquareIcon className="h-3.5 w-3.5" />Open conversation</Link>
      {item.status === 'OPEN' && item.requiresAction && <button disabled={busy} onClick={() => void run(async () => { await aiManagementService.acknowledge(item.notificationId); await aiManagementService.takeover(item.companyId) }, 'You have taken ownership of ' + item.companyName + '. Automation is stopped for this company.')}
        className="inline-flex items-center gap-1 rounded border border-singtelGray-200 px-2 py-1 text-xs text-singtelGray-700"><UserCheckIcon className="h-3.5 w-3.5" />Take ownership</button>}
      <Link to={'/sales/companies/' + encodeURIComponent(item.companyId)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><SendIcon className="h-3.5 w-3.5" />Respond manually</Link>
      {item.status !== 'RESOLVED' && item.requiresAction && <>
        <button disabled={busy} onClick={() => void run(() => aiManagementService.resolve(item.notificationId), 'Marked resolved.')} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><CheckIcon className="h-3.5 w-3.5" />Mark resolved</button>
        <button disabled={busy} onClick={() => void run(() => aiManagementService.resolve(item.notificationId, true), 'Resolved and AI Management resumed for ' + item.companyName + '.')} className="inline-flex items-center gap-1 rounded bg-singtelRed px-2 py-1 text-xs text-white"><PlayIcon className="h-3.5 w-3.5" />Resolve & resume AI</button>
      </>}
    </div>}
  </article>
}

export default function AiManagementPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'companies') as Tab
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [notifications, setNotifications] = useState<AiNotification[]>([])
  const [attention, setAttention] = useState<AiNotification[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [filters, setFilters] = useState({ status: '', industry: '', country: '', priority: '', from: '', to: '', scope: 'all' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const query: Record<string, string> = { scope: filters.scope }
      for (const key of ['status', 'industry', 'country', 'priority'] as const) if (filters[key]) query[key] = filters[key]
      if (filters.from) query.from = new Date(filters.from + 'T00:00:00').toISOString()
      if (filters.to) query.to = new Date(filters.to + 'T23:59:59').toISOString()
      const [a, c, n, h, f] = await Promise.all([aiManagementService.analytics(), aiManagementService.companies(query), aiManagementService.notifications(),
        aiManagementService.notifications({ requiresAction: 'true', status: 'UNRESOLVED' }), aiManagementService.followUps()])
      setAnalytics(a); setCompanies(c); setNotifications(n.data); setAttention(h.data); setFollowUps(f); setError('')
    } catch (e) { setError(apiError(e, 'AI Management data could not be loaded.')) } finally { setBusy(false) }
  }, [filters])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const timer = window.setInterval(() => { void load() }, 60_000); return () => window.clearInterval(timer) }, [load])

  const changed = (text: string) => { setMessage(text); void load() }
  const options = useMemo(() => ({
    industries: [...new Set(companies.map(row => row.industry).filter(Boolean))] as string[],
    countries: [...new Set(companies.map(row => row.country).filter(Boolean))] as string[],
    priorities: [...new Set(companies.map(row => row.priority).filter(Boolean))] as string[],
  }), [companies])
  const searchTerm = search.trim().toLowerCase()
  const matching = companies.filter(row => [row.companyName, row.contactName].some(value => value?.toLowerCase().includes(searchTerm)))
  const pageSize = 20
  const pages = Math.max(1, Math.ceil(matching.length / pageSize))
  const currentPage = Math.min(page, pages)
  const offset = (currentPage - 1) * pageSize
  useEffect(() => { setPage(1) }, [filters, search])

  async function runWorker() {
    setBusy(true); setError('')
    try {
      const result = await aiManagementService.runWorker() as { processed?: { status: string }[]; poll?: { received?: number } }
      setMessage(`Checked the inbox (${result.poll?.received ?? 0} new message(s)) and ran ${result.processed?.length ?? 0} due compan${result.processed?.length === 1 ? 'y' : 'ies'}.`)
      await load()
    } catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }
  const c = analytics?.companies

  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="AI Management" subtitle="Monitor autonomous outreach, review company conversations and take ownership of escalations."
      badge={analytics?.emailProvider.synthetic ? <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Recorded email · outbox only</span> : undefined}
      actions={<>
        <button onClick={() => void runWorker()} disabled={busy} className="btn-primary inline-flex items-center gap-2"><InboxIcon className="h-4 w-4" />Check inbox & run due actions</button>
        <button onClick={() => void load()} disabled={busy} aria-label="Refresh" className="rounded p-2 text-singtelGray-500 hover:bg-gray-100"><RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
      </>} />
    {analytics && !analytics.globalOutboundEnabled && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"><OctagonIcon className="h-4 w-4" />Emergency stop is active: no autonomous email is being sent. <button className="ml-auto underline" onClick={() => setParams({ tab: 'settings' })}>Manage</button></div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

    <AgentWorkspaces />
    {c && analytics && <section aria-label="AI Management metrics" className="card grid grid-cols-2 gap-px overflow-hidden bg-singtelGray-200 sm:grid-cols-4">
      <Stat label="AI-managed" value={c.currentlyManaged} tone="text-singtelRed" detail={`${c.selectedForAiManagement} ever enabled`} icon={BotIcon} />
      <Stat label="Active" value={c.active} detail="Automation running" icon={PlayIcon} />
      <Stat label="Waiting for reply" value={c.waitingForReply} icon={MailIcon} />
      <Stat label="Follow-ups scheduled" value={c.followupsScheduled} icon={SendIcon} />
      <Stat label="Positive responses" value={analytics.replies.positiveIntent} detail={`${analytics.replies.positiveSentiment} positive-tone replies`} icon={UsersIcon} />
      <Stat label="Need attention" value={c.humanAttention} tone={c.humanAttention ? 'text-red-600' : 'text-singtelGray-800'} detail={`${analytics.notifications.openHumanInterventions} open items`} icon={AlertTriangleIcon} />
      <Stat label="Paused / handover" value={`${c.paused} / ${c.humanHandover}`} icon={UserCheckIcon} />
      <Stat label="Automation errors" value={c.errors} tone={c.errors ? 'text-red-600' : 'text-singtelGray-800'} detail={`${analytics.emails.blocked} sends blocked by policy`} icon={AlertTriangleIcon} />
    </section>}

    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="AI Management sections">{TABS.map(([key, name]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setParams({ tab: key })}
      className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${tab === key ? 'border-singtelRed font-semibold text-singtelRed-700' : 'border-transparent text-singtelGray-500 hover:text-gray-700'}`}>
      {name}{key === 'attention' && attention.length > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{attention.length}</span>}
      {key === 'notifications' && notifications.some(item => item.unread) && <span className="ml-1.5 rounded-full bg-singtelRed px-1.5 text-[10px] text-white">{notifications.filter(item => item.unread).length}</span>}
    </button>)}</nav>

    {tab === 'companies' && <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5">
        <h2 className="text-sm font-semibold text-singtelGray-800">Company worklist</h2>
        <label className="relative w-full sm:w-64"><SearchIcon size={14} aria-hidden className="absolute left-3 top-2.5 text-singtelGray-500" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search companies or contacts" placeholder="Search companies or contacts" className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-b px-4 py-3 text-xs text-singtelGray-500">
        <label>Show<select value={filters.scope} onChange={e => setFilters({ ...filters, scope: e.target.value })} className="mt-1 block rounded border px-2 py-1.5 text-sm"><option value="all">Queue + managed</option><option value="managed">AI-managed only</option><option value="queue">Daily queue only</option></select></label>
        <label>Status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="mt-1 block rounded border px-2 py-1.5 text-sm"><option value="">All</option>
          {['ACTIVE', 'HUMAN_ATTENTION', 'PAUSED', 'HUMAN_HANDOVER', 'COMPLETED', 'ERROR', 'OFF', 'WAITING_FOR_REPLY', 'FOLLOW_UP_SCHEDULED', 'CUSTOMER_RESPONDED', 'NO_RESPONSE', 'NOT_INTERESTED', 'UNSUBSCRIBED'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Industry<select value={filters.industry} onChange={e => setFilters({ ...filters, industry: e.target.value })} className="mt-1 block rounded border px-2 py-1.5 text-sm"><option value="">All</option>{options.industries.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Country<select value={filters.country} onChange={e => setFilters({ ...filters, country: e.target.value })} className="mt-1 block rounded border px-2 py-1.5 text-sm"><option value="">All</option>{options.countries.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Priority<select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })} className="mt-1 block rounded border px-2 py-1.5 text-sm"><option value="">All</option>{options.priorities.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>From<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} className="mt-1 block rounded border px-2 py-1 text-sm" /></label>
        <label>To<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} className="mt-1 block rounded border px-2 py-1 text-sm" /></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-singtelGray-500"><tr><th className="px-4 py-2">Company</th><th className="px-2 py-2">Score</th><th className="px-2 py-2">Priority</th>
          <th className="px-2 py-2">AI Management</th><th className="px-2 py-2">Conversation</th><th className="px-2 py-2">Next action</th><th className="px-2 py-2">Last message</th></tr></thead>
        <tbody>{matching.slice(offset, offset + pageSize).map(row => <tr key={row.companyId} className={`border-t align-top hover:bg-gray-50 ${row.humanAttention ? 'bg-red-50/40' : ''}`}>
          <td className="px-4 py-3"><Link to={conversationLink(row.companyId)} className="font-semibold text-singtelGray-800 hover:underline">{row.companyName}</Link>
            <span className="block text-[11px] text-singtelGray-500">{[row.country, row.industry].filter(Boolean).join(' · ') || '—'}{row.contactName ? ' · ' + row.contactName : ''}</span>
            {row.humanAttention && <span className="mt-1 flex items-center gap-1 text-[11px] text-red-700"><AlertTriangleIcon className="h-3 w-3" />{row.attentionReason ?? 'Needs attention'}</span>}
            {row.lastError && row.managementState === 'ERROR' && <span className="mt-1 block text-[11px] text-red-700">{row.lastError}</span>}</td>
          <td className="px-2 py-3">{row.opportunityScore ?? row.leadScore ?? '—'}</td>
          <td className="px-2 py-3">{row.priority ? <PriorityBadge priority={row.priority} /> : '—'}</td>
          <td className="px-2 py-3"><AiManagementControl compact companyId={row.companyId} companyName={row.companyName} state={row.managementState} onChanged={changed} /></td>
          <td className="px-2 py-3">{row.activatedAt ? <CommunicationBadge state={row.communicationState} /> : <span className="text-singtelGray-500">Not started</span>}</td>
          <td className="px-2 py-3 text-gray-600">{row.nextActionKind ? label(row.nextActionKind) : '—'}<span className="block text-[10px] text-singtelGray-500">{when(row.nextActionAt)}</span></td>
          <td className="px-2 py-3 text-singtelGray-500">{when(row.lastMessageAt)}</td>
        </tr>)}</tbody></table>
        {!matching.length && analytics && !busy && <p className="p-6 text-center text-sm text-singtelGray-500">No companies match these filters.</p>}</div>
      {analytics && matching.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-singtelGray-500">
        <span>{offset + 1}–{Math.min(offset + pageSize, matching.length)} of {matching.length} companies</span>
        {pages > 1 && <div className="flex gap-2">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button>
          <button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>}
      </div>}
    </section>}

    {tab === 'attention' && <section className="space-y-3">
      <p className="text-xs text-singtelGray-500">Conversations the AI has paused for a person: positive interest, meeting/proposal/pricing requests, complaints, uncertain or out-of-scope questions, and blocked sends.</p>
      {attention.map(item => <AttentionCard key={item.notificationId} item={item} onChanged={changed} />)}
      {analytics && !attention.length && <div className="card p-8 text-center text-sm text-singtelGray-500"><CheckIcon className="mx-auto mb-2 h-6 w-6 text-singtelRed" />Nothing needs your attention right now.</div>}
    </section>}

    {tab === 'notifications' && <section className="card divide-y">
      <div className="flex items-center justify-between p-3"><h2 className="text-sm font-semibold text-singtelGray-800">Notification centre</h2>
        <button className="text-xs text-singtelRed-700 underline" onClick={() => void aiManagementService.markAllRead().then(() => load())}>Mark all read</button></div>
      {notifications.map(item => <div key={item.notificationId} className={`flex flex-wrap items-start gap-3 p-3 text-sm ${item.unread ? 'bg-singtelRed-50/40' : ''}`}>
        <BellIcon className={`mt-0.5 h-4 w-4 ${item.unread ? 'text-singtelRed' : 'text-gray-300'}`} />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={item.priority} /><span className="font-medium text-singtelGray-800">{item.title}</span>
          {item.requiresAction && <span className="text-[11px] text-singtelGray-500">{item.status === 'RESOLVED' ? 'Resolved' : 'Action needed'}</span>}</div>
          <p className="mt-0.5 text-xs text-gray-600">{item.summary}</p><p className="text-[11px] text-singtelGray-500">{when(item.createdAt)}</p></div>
        <div className="flex gap-2">{item.companyId !== 'global' && <Link to={conversationLink(item.companyId)} className="text-xs text-singtelRed-700 underline" onClick={() => { if (item.unread) void aiManagementService.markRead(item.notificationId) }}>Open</Link>}
          {item.unread && <button className="text-xs text-singtelGray-500 underline" onClick={() => void aiManagementService.markRead(item.notificationId).then(() => load())}>Mark read</button>}</div>
      </div>)}
      {analytics && !notifications.length && <p className="p-6 text-center text-sm text-singtelGray-500">No notifications yet.</p>}
    </section>}

    {tab === 'followups' && <section className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase text-singtelGray-500"><tr><th className="px-4 py-2">Company</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Due</th><th className="px-2 py-2">Reason</th><th className="px-2 py-2">State</th></tr></thead>
        <tbody>{followUps.map(item => <tr key={item.companyId} className="border-t"><td className="px-4 py-2"><Link to={conversationLink(item.companyId)} className="font-medium text-singtelGray-800 hover:underline">{item.companyName}</Link><span className="block text-singtelGray-500">{item.contactName}</span></td>
          <td className="px-2 py-2">{label(item.nextActionKind)}{item.nextActionKind === 'NO_REPLY_FOLLOWUP' ? ` (${item.followupAttempts} sent)` : ''}</td><td className="px-2 py-2">{when(item.nextActionAt)}</td>
          <td className="px-2 py-2 text-gray-600">{item.note ?? '—'}</td><td className="px-2 py-2"><ManagementBadge state={item.managementState} />{!item.willRun && <span className="block text-[10px] text-amber-700">Held until resumed</span>}</td></tr>)}</tbody></table>
      {analytics && !followUps.length && <p className="p-6 text-center text-sm text-singtelGray-500">No follow-ups are scheduled.</p>}
    </section>}

    {tab === 'settings' && <AiManagementSettingsPanel onChanged={() => void load()} />}
    {busy && !analytics && <p className="flex items-center gap-2 text-sm text-singtelGray-500"><Loader2Icon className="h-4 w-4 animate-spin" />Loading…</p>}
  </div>
}
