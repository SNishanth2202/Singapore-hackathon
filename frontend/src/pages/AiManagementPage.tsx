import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangleIcon, BellIcon, BotIcon, CheckIcon, InboxIcon, Loader2Icon, MailIcon, MessageSquareIcon, OctagonIcon, PlayIcon,
  RefreshCwIcon, SendIcon, UserCheckIcon, UsersIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { AiManagementControl } from '../components/ai/AiManagementControl'
import { AiManagementSettingsPanel } from '../components/ai/AiManagementSettingsPanel'
import { CommunicationBadge, ManagementBadge, PriorityBadge } from '../components/ai/AiStatusBadge'
import { aiManagementService, AiNotification, Analytics, apiError, CompanyRow, FollowUp, label, when } from '../services/aiManagement.service'

const TABS = [['companies', 'Companies'], ['attention', 'Human attention'], ['notifications', 'Notifications'], ['followups', 'Follow-ups'], ['settings', 'Settings']] as const
type Tab = typeof TABS[number][0]
const conversationLink = (companyId: string) => '/ai-management/companies/' + encodeURIComponent(companyId)

function Stat({ label: name, value, detail, tone = 'text-navy-600', icon: Icon }: { label: string; value: number | string; detail?: string; tone?: string; icon: typeof BotIcon }) {
  return <article className="card p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-gray-500">{name}</span><Icon className="h-4 w-4 text-teal-600" /></div>
    <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>{detail && <p className="mt-1 text-[11px] text-gray-400">{detail}</p>}</article>
}

export function AttentionCard({ item, onChanged }: { item: AiNotification; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('')
    try { await action(); onChanged(message) } catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }
  return <article className={`card p-4 ${item.unread ? 'border-l-4 border-l-teal-500' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={item.priority} /><span className="text-[11px] uppercase tracking-wide text-gray-400">{label(item.type)}</span>
        {item.status === 'ACKNOWLEDGED' && <span className="text-[11px] text-purple-700">Owned by {item.owner}</span>}</div>
        <h3 className="mt-1 font-semibold text-gray-800"><Link to={conversationLink(item.companyId)} className="hover:underline">{item.title}</Link></h3>
        <p className="text-xs text-gray-500">{item.companyName}{item.contactName ? ' · ' + item.contactName : ''} · {when(item.createdAt)}</p></div>
      {item.opportunityScore != null && <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">Opportunity score {item.opportunityScore}</span>}
    </div>
    {item.latestMessage && <blockquote className="mt-3 whitespace-pre-wrap rounded border-l-2 border-gray-300 bg-gray-50 p-2 text-sm text-gray-700">{item.latestMessage}</blockquote>}
    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      <div><dt className="font-medium text-gray-500">Why escalated</dt><dd className="text-gray-700">{item.reason ?? item.summary}</dd></div>
      <div><dt className="font-medium text-gray-500">AI interpretation</dt><dd className="text-gray-700">{item.intent ? label(item.intent) : '—'}{item.sentiment ? ' · ' + label(item.sentiment) + ' tone' : ''}
        {item.buyingIntent ? ' · buying intent ' + item.buyingIntent.toLowerCase() : ''}</dd></div>
      {item.buyingSignals.length > 0 && <div><dt className="font-medium text-gray-500">Buying signals</dt><dd className="text-gray-700">{item.buyingSignals.join('; ')}</dd></div>}
      {item.requirements.length > 0 && <div><dt className="font-medium text-gray-500">Requirements</dt><dd className="text-gray-700">{item.requirements.join('; ')}</dd></div>}
      {item.recommendation && <div className="sm:col-span-2"><dt className="font-medium text-gray-500">Recommended action</dt><dd className="text-gray-700">{item.recommendation}</dd></div>}
    </dl>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {item.companyId !== 'global' && <div className="mt-3 flex flex-wrap gap-2">
      <Link to={conversationLink(item.companyId)} onClick={() => { if (item.unread) void aiManagementService.markRead(item.notificationId) }} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><MessageSquareIcon className="h-3.5 w-3.5" />Open conversation</Link>
      {item.status === 'OPEN' && item.requiresAction && <button disabled={busy} onClick={() => void run(async () => { await aiManagementService.acknowledge(item.notificationId); await aiManagementService.takeover(item.companyId) }, 'You have taken ownership of ' + item.companyName + '. Automation is stopped for this company.')}
        className="inline-flex items-center gap-1 rounded border border-purple-200 px-2 py-1 text-xs text-purple-700"><UserCheckIcon className="h-3.5 w-3.5" />Take ownership</button>}
      <Link to={'/sales/companies/' + encodeURIComponent(item.companyId)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><SendIcon className="h-3.5 w-3.5" />Respond manually</Link>
      {item.status !== 'RESOLVED' && item.requiresAction && <>
        <button disabled={busy} onClick={() => void run(() => aiManagementService.resolve(item.notificationId), 'Marked resolved.')} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"><CheckIcon className="h-3.5 w-3.5" />Mark resolved</button>
        <button disabled={busy} onClick={() => void run(() => aiManagementService.resolve(item.notificationId, true), 'Resolved and AI Management resumed for ' + item.companyName + '.')} className="inline-flex items-center gap-1 rounded bg-teal-600 px-2 py-1 text-xs text-white"><PlayIcon className="h-3.5 w-3.5" />Resolve & resume AI</button>
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

  async function runWorker() {
    setBusy(true); setError('')
    try {
      const result = await aiManagementService.runWorker() as { processed?: { status: string }[]; poll?: { received?: number } }
      setMessage(`Checked the inbox (${result.poll?.received ?? 0} new message(s)) and ran ${result.processed?.length ?? 0} due compan${result.processed?.length === 1 ? 'y' : 'ies'}.`)
      await load()
    } catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }
  const c = analytics?.companies

  return <div className="space-y-5">
    <PageHeader title="AI Management" subtitle="Companies whose email conversations are run by the autonomous communication agent. You are notified only when a person is needed."
      badge={analytics?.emailProvider.synthetic ? <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Synthetic preview · no real email</span> : undefined}
      actions={<>
        <button onClick={() => void runWorker()} disabled={busy} className="btn-secondary inline-flex items-center gap-2"><InboxIcon className="h-4 w-4" />Check inbox & run due actions</button>
        <button onClick={() => void load()} disabled={busy} aria-label="Refresh" className="rounded p-2 text-gray-500 hover:bg-gray-100"><RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
      </>} />
    {analytics && !analytics.globalOutboundEnabled && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"><OctagonIcon className="h-4 w-4" />Emergency stop is active: no autonomous email is being sent. <button className="ml-auto underline" onClick={() => setParams({ tab: 'settings' })}>Manage</button></div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}

    {c && analytics && <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Stat label="AI-managed" value={c.currentlyManaged} detail={`${c.selectedForAiManagement} ever enabled`} icon={BotIcon} />
      <Stat label="Active" value={c.active} detail="Automation running" icon={PlayIcon} />
      <Stat label="Waiting for reply" value={c.waitingForReply} icon={MailIcon} />
      <Stat label="Follow-ups scheduled" value={c.followupsScheduled} icon={SendIcon} />
      <Stat label="Positive responses" value={analytics.replies.positiveIntent} detail={`${analytics.replies.positiveSentiment} positive-tone replies`} icon={UsersIcon} />
      <Stat label="Need attention" value={c.humanAttention} tone={c.humanAttention ? 'text-red-600' : 'text-navy-600'} detail={`${analytics.notifications.openHumanInterventions} open items`} icon={AlertTriangleIcon} />
      <Stat label="Paused / handover" value={`${c.paused} / ${c.humanHandover}`} icon={UserCheckIcon} />
      <Stat label="Automation errors" value={c.errors} tone={c.errors ? 'text-red-600' : 'text-navy-600'} detail={`${analytics.emails.blocked} sends blocked by policy`} icon={AlertTriangleIcon} />
    </div>}

    <nav className="flex flex-wrap gap-1 border-b" aria-label="AI Management sections">{TABS.map(([key, name]) => <button key={key} onClick={() => setParams({ tab: key })}
      className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? 'border-teal-600 font-medium text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      {name}{key === 'attention' && attention.length > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{attention.length}</span>}
      {key === 'notifications' && notifications.some(item => item.unread) && <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 text-[10px] text-white">{notifications.filter(item => item.unread).length}</span>}
    </button>)}</nav>

    {tab === 'companies' && <section className="card overflow-hidden">
      <div className="flex flex-wrap items-end gap-2 border-b p-3 text-xs text-gray-500">
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
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-2">Company</th><th className="px-2 py-2">Score</th><th className="px-2 py-2">Priority</th>
          <th className="px-2 py-2">AI Management</th><th className="px-2 py-2">Conversation</th><th className="px-2 py-2">Next action</th><th className="px-2 py-2">Last message</th></tr></thead>
        <tbody>{companies.map(row => <tr key={row.companyId} className={`border-t align-top ${row.humanAttention ? 'bg-red-50/40' : ''}`}>
          <td className="px-4 py-3"><Link to={conversationLink(row.companyId)} className="font-semibold text-navy-600 hover:underline">{row.companyName}</Link>
            <span className="block text-[11px] text-gray-500">{[row.country, row.industry].filter(Boolean).join(' · ') || '—'}{row.contactName ? ' · ' + row.contactName : ''}</span>
            {row.humanAttention && <span className="mt-1 flex items-center gap-1 text-[11px] text-red-700"><AlertTriangleIcon className="h-3 w-3" />{row.attentionReason ?? 'Needs attention'}</span>}
            {row.lastError && row.managementState === 'ERROR' && <span className="mt-1 block text-[11px] text-red-700">{row.lastError}</span>}</td>
          <td className="px-2 py-3">{row.opportunityScore ?? row.leadScore ?? '—'}</td>
          <td className="px-2 py-3">{row.priority ?? '—'}</td>
          <td className="px-2 py-3"><AiManagementControl compact companyId={row.companyId} companyName={row.companyName} state={row.managementState} onChanged={changed} /></td>
          <td className="px-2 py-3">{row.activatedAt ? <CommunicationBadge state={row.communicationState} /> : <span className="text-gray-400">Not started</span>}</td>
          <td className="px-2 py-3 text-gray-600">{row.nextActionKind ? label(row.nextActionKind) : '—'}<span className="block text-[10px] text-gray-400">{when(row.nextActionAt)}</span></td>
          <td className="px-2 py-3 text-gray-500">{when(row.lastMessageAt)}</td>
        </tr>)}</tbody></table>
        {!companies.length && !busy && <p className="p-6 text-center text-sm text-gray-500">No companies match these filters.</p>}</div>
    </section>}

    {tab === 'attention' && <section className="space-y-3">
      <p className="text-xs text-gray-500">Conversations the AI has paused for a person: positive interest, meeting/proposal/pricing requests, complaints, uncertain or out-of-scope questions, and blocked sends.</p>
      {attention.map(item => <AttentionCard key={item.notificationId} item={item} onChanged={changed} />)}
      {!attention.length && <div className="card p-8 text-center text-sm text-gray-500"><CheckIcon className="mx-auto mb-2 h-6 w-6 text-teal-600" />Nothing needs your attention right now.</div>}
    </section>}

    {tab === 'notifications' && <section className="card divide-y">
      <div className="flex items-center justify-between p-3"><h2 className="text-sm font-semibold text-gray-800">Notification centre</h2>
        <button className="text-xs text-teal-700 underline" onClick={() => void aiManagementService.markAllRead().then(() => load())}>Mark all read</button></div>
      {notifications.map(item => <div key={item.notificationId} className={`flex flex-wrap items-start gap-3 p-3 text-sm ${item.unread ? 'bg-teal-50/40' : ''}`}>
        <BellIcon className={`mt-0.5 h-4 w-4 ${item.unread ? 'text-teal-600' : 'text-gray-300'}`} />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={item.priority} /><span className="font-medium text-gray-800">{item.title}</span>
          {item.requiresAction && <span className="text-[11px] text-gray-500">{item.status === 'RESOLVED' ? 'Resolved' : 'Action needed'}</span>}</div>
          <p className="mt-0.5 text-xs text-gray-600">{item.summary}</p><p className="text-[11px] text-gray-400">{when(item.createdAt)}</p></div>
        <div className="flex gap-2">{item.companyId !== 'global' && <Link to={conversationLink(item.companyId)} className="text-xs text-teal-700 underline" onClick={() => { if (item.unread) void aiManagementService.markRead(item.notificationId) }}>Open</Link>}
          {item.unread && <button className="text-xs text-gray-500 underline" onClick={() => void aiManagementService.markRead(item.notificationId).then(() => load())}>Mark read</button>}</div>
      </div>)}
      {!notifications.length && <p className="p-6 text-center text-sm text-gray-500">No notifications yet.</p>}
    </section>}

    {tab === 'followups' && <section className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase text-gray-500"><tr><th className="px-4 py-2">Company</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Due</th><th className="px-2 py-2">Reason</th><th className="px-2 py-2">State</th></tr></thead>
        <tbody>{followUps.map(item => <tr key={item.companyId} className="border-t"><td className="px-4 py-2"><Link to={conversationLink(item.companyId)} className="font-medium text-navy-600 hover:underline">{item.companyName}</Link><span className="block text-gray-400">{item.contactName}</span></td>
          <td className="px-2 py-2">{label(item.nextActionKind)}{item.nextActionKind === 'NO_REPLY_FOLLOWUP' ? ` (${item.followupAttempts} sent)` : ''}</td><td className="px-2 py-2">{when(item.nextActionAt)}</td>
          <td className="px-2 py-2 text-gray-600">{item.note ?? '—'}</td><td className="px-2 py-2"><ManagementBadge state={item.managementState} />{!item.willRun && <span className="block text-[10px] text-amber-700">Held until resumed</span>}</td></tr>)}</tbody></table>
      {!followUps.length && <p className="p-6 text-center text-sm text-gray-500">No follow-ups are scheduled.</p>}
    </section>}

    {tab === 'settings' && <AiManagementSettingsPanel onChanged={() => void load()} />}
    {busy && !analytics && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2Icon className="h-4 w-4 animate-spin" />Loading…</p>}
  </div>
}
