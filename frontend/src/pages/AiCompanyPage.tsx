import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon, BotIcon, ExternalLinkIcon, FlaskConicalIcon, Loader2Icon, RefreshCwIcon, UserIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { AiManagementControl } from '../components/ai/AiManagementControl'
import { CommunicationBadge } from '../components/ai/AiStatusBadge'
import { AttentionCard } from './AiManagementPage'
import { aiManagementService, apiError, CompanyDetail, ConversationMessage, label, MemoryItem, when } from '../services/aiManagement.service'

type Timeline = Awaited<ReturnType<typeof aiManagementService.timeline>>

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`card p-5 ${className}`}><h2 className="mb-3 text-sm font-semibold text-gray-800">{title}</h2>{children}</section>
}
function MemoryList({ title, items, empty }: { title: string; items?: MemoryItem[]; empty: string }) {
  return <div><h3 className="text-xs font-semibold uppercase text-gray-500">{title}</h3>
    {items?.length ? <ul className="mt-1 space-y-1 text-xs text-gray-700">{items.map(item => <li key={item.sourceEventId + item.text} className="rounded bg-gray-50 p-1.5">{item.text}
      {item.serviceIds?.length ? <span className="ml-1 text-teal-700">→ {item.serviceIds.join(', ')}</span> : null}<span className="block text-[10px] text-gray-400">{when(item.at)} · source {item.sourceEventId}</span></li>)}</ul>
      : <p className="mt-1 text-xs text-gray-400">{empty}</p>}</div>
}

function Message({ message }: { message: ConversationMessage }) {
  const inbound = message.direction === 'INBOUND'
  return <li className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
    <article className={`max-w-[85%] rounded-lg border p-3 text-sm ${inbound ? 'bg-white' : message.sentBy === 'AI' ? 'border-teal-200 bg-teal-50' : 'border-navy-100 bg-navy-50'}`}>
      <header className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        {inbound ? <><UserIcon className="h-3 w-3" />{message.contactName ?? 'Customer'}</> : message.sentBy === 'AI' ? <><BotIcon className="h-3 w-3 text-teal-700" />AI · {label(message.kind)}{message.followupKind ? ' (' + label(message.followupKind) + ')' : ''}</> : <>Salesperson · {label(message.kind)}</>}
        <span>· {when(message.at)}</span>
        {!inbound && <span className="rounded bg-white px-1 text-[10px]">{message.synthetic ? 'Recorded outbox — not sent' : 'Provider accepted · delivery unconfirmed'}</span>}
        {inbound && message.channel === 'synthetic_simulation' && <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">Simulated reply</span>}
      </header>
      {message.subject && <p className="mt-1 font-medium text-gray-800">{message.subject}</p>}
      <p className="mt-1 whitespace-pre-wrap text-gray-700">{message.body}</p>
      {inbound && message.interpretation && <div className="mt-2 rounded bg-gray-50 p-2 text-[11px] text-gray-600">
        <strong>AI interpretation:</strong> {label(message.interpretation.intent)} · {label(message.interpretation.sentiment)} tone · buying intent {message.interpretation.buyingIntent?.toLowerCase() ?? '—'}
        {message.interpretation.confidence != null ? ' · ' + Math.round(message.interpretation.confidence * 100) + '% confidence' : ''}
        {message.interpretation.requirements.length > 0 && <span className="block">Requirements: {message.interpretation.requirements.join('; ')}</span>}
        {message.aiDecision && <span className="block">Decision: <strong>{label(message.aiDecision.decision)}</strong>{message.aiDecision.reason ? ' — ' + message.aiDecision.reason : ''}</span>}
      </div>}
      {!inbound && message.rationale && <p className="mt-2 text-[11px] text-gray-500">{message.generatedBy ? label(message.generatedBy) + ': ' : ''}{message.rationale}</p>}
    </article>
  </li>
}

export default function AiCompanyPage() {
  const { companyId = '' } = useParams()
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const value = await aiManagementService.company(companyId)
      setDetail(value)
      const [conversation, history] = await Promise.all([aiManagementService.conversations(companyId), aiManagementService.timeline(companyId)])
      setMessages(conversation.messages); setTimeline(history); setError('')
    } catch (e) { setError(apiError(e, 'This company could not be loaded.')) } finally { setBusy(false) }
  }, [companyId])
  useEffect(() => { void load() }, [load])

  async function simulate(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await aiManagementService.simulateReply(companyId, reply) as { result?: { decision?: string; reason?: string } }
      setMessage('Reply processed. AI decision: ' + label(result.result?.decision ?? 'none') + (result.result?.reason ? ' — ' + result.result.reason : ''))
      setReply(''); await load()
    } catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }

  const m = detail?.management
  const memory = m?.memory
  const openItems = detail?.notifications.filter(item => item.requiresAction && item.status !== 'RESOLVED') ?? []

  return <div className="space-y-5">
    <Link to="/ai-management" className="inline-flex items-center gap-1 text-sm text-teal-700"><ArrowLeftIcon className="h-4 w-4" />AI Management</Link>
    <PageHeader title={detail?.company.companyName ?? 'Company'} subtitle={[detail?.company.industry, detail?.company.country].filter(Boolean).join(' · ') || 'AI-managed company conversation'}
      badge={detail?.company.isSynthetic ? <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">Account records</span> : undefined}
      actions={<>
        <Link to={'/sales/companies/' + encodeURIComponent(companyId)} className="btn-secondary inline-flex items-center gap-1">Manual sales workflow<ExternalLinkIcon className="h-3.5 w-3.5" /></Link>
        <button onClick={() => void load()} disabled={busy} aria-label="Refresh" className="rounded p-2 text-gray-500 hover:bg-gray-100"><RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
      </>} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
    {!detail && busy && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2Icon className="h-4 w-4 animate-spin" />Loading…</p>}

    {detail && <>
      <Card title="AI Management status and controls">
        <AiManagementControl companyId={companyId} companyName={detail.company.companyName} state={m?.managementState ?? 'OFF'} onChanged={text => { setMessage(text); void load() }} />
        {m?.activatedAt && <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-gray-400">Conversation</dt><dd><CommunicationBadge state={m.communicationState} /></dd></div>
          <div><dt className="text-gray-400">Next action</dt><dd className="text-gray-700">{m.nextActionKind ? label(m.nextActionKind) + ' · ' + when(m.nextActionAt) : 'None scheduled'}{m.managementState !== 'ACTIVE' && m.nextActionAt ? ' (held)' : ''}</dd></div>
          <div><dt className="text-gray-400">Contact</dt><dd className="text-gray-700">{m.contactName} · {m.contactRole}<span className="block text-gray-400">{m.contactEmail}</span></dd></div>
          <div><dt className="text-gray-400">Activated</dt><dd className="text-gray-700">{when(m.activatedAt)} by {m.activatedBy}<span className="block text-gray-400">{m.jurisdiction} · {label(m.outreachBasis)}</span></dd></div>
          {m.humanOwner && <div><dt className="text-gray-400">Human owner</dt><dd className="text-purple-700">{m.humanOwner}</dd></div>}
          {m.attentionReason && m.humanAttention && <div className="sm:col-span-2"><dt className="text-gray-400">Why paused</dt><dd className="text-red-700">{m.attentionReason}</dd></div>}
          {m.lastError && <div className="sm:col-span-2"><dt className="text-gray-400">Last error</dt><dd className="text-red-700">{m.lastError}</dd></div>}
          <div><dt className="text-gray-400">Follow-ups sent (this sequence)</dt><dd className="text-gray-700">{m.followupAttempts}</dd></div>
        </dl>}
        {!m?.activatedAt && detail.readiness.problems.length > 0 && <p className="mt-3 text-xs text-amber-700">Before enabling: {detail.readiness.problems.join(' ')}</p>}
      </Card>

      {openItems.length > 0 && <section className="space-y-3"><h2 className="text-sm font-semibold text-red-700">Pending human actions</h2>
        {openItems.map(item => <AttentionCard key={item.notificationId} item={item} onChanged={text => { setMessage(text); void load() }} />)}</section>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Conversation timeline" className="lg:col-span-2">
          {messages.length ? <ol className="space-y-3">{messages.map(item => <Message key={item.id} message={item} />)}</ol> : <p className="text-sm text-gray-500">No emails yet.</p>}
          {detail.emailProvider.synthetic && m?.activatedAt && <form onSubmit={simulate} className="mt-5 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
            <label className="flex items-center gap-1 text-xs font-medium text-amber-800"><FlaskConicalIcon className="h-3.5 w-3.5" />Review a customer reply in the recorded inbox</label>
            <textarea required value={reply} onChange={e => setReply(e.target.value)} rows={3} maxLength={5000} placeholder="e.g. Does Singtel offer managed cybersecurity services?" className="mt-2 w-full rounded border p-2 text-sm" />
            <button disabled={busy || !reply.trim()} className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Send simulated reply through the inbox</button>
          </form>}
        </Card>

        <div className="space-y-5">
          <Card title="Opportunity">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-gray-400">Lead score</dt><dd className="text-lg font-semibold text-navy-600">{detail.lead?.score ?? m?.leadScore ?? '—'}</dd></div>
              <div><dt className="text-gray-400">Opportunity score</dt><dd className="text-lg font-semibold text-teal-700">{m?.opportunityScore ?? '—'}</dd></div>
              <div><dt className="text-gray-400">Priority</dt><dd>{detail.lead?.priority ?? m?.priority ?? '—'}</dd></div>
              <div><dt className="text-gray-400">Service hypothesis</dt><dd>{detail.opportunities.map(item => item.service).filter(Boolean).join(', ') || '—'}</dd></div>
            </dl>
            {m?.scoreHistory && m.scoreHistory.length > 0 && <div className="mt-3"><h3 className="text-xs font-semibold uppercase text-gray-500">Score history</h3>
              <ul className="mt-1 space-y-1 text-[11px] text-gray-600">{m.scoreHistory.map(item => <li key={item.at + item.score}>{item.previous ?? '—'} → <strong>{item.score}</strong>: {item.reason} <span className="text-gray-400">({when(item.at)})</span></li>)}</ul></div>}
            {detail.brief.services.length > 0 && <p className="mt-3 text-xs text-gray-600">Relevant Singtel services: {detail.brief.services.map(service => service.name).join(', ')}</p>}
          </Card>
          <Card title="Company memory">
            {memory?.summary && <p className="mb-3 text-xs text-gray-700">{memory.summary}</p>}
            <div className="space-y-3">
              <MemoryList title="Customer requirements" items={memory?.requirements} empty="None stated by the customer yet." />
              <MemoryList title="Buying signals" items={memory?.buyingSignals} empty="None." />
              <MemoryList title="Existing provider" items={memory?.existingProviders} empty="Not mentioned." />
              <MemoryList title="Objections" items={memory?.objections} empty="None." />
              <MemoryList title="Questions asked" items={memory?.questions} empty="None." />
              <MemoryList title="Preferences" items={memory?.preferences} empty="None recorded." />
              <div><h3 className="text-xs font-semibold uppercase text-gray-500">Pending actions</h3>
                {memory?.pendingActions.length ? <ul className="mt-1 space-y-1 text-xs">{memory.pendingActions.map(item => <li key={item.id} className={item.status === 'OPEN' ? 'text-gray-800' : 'text-gray-400 line-through'}>{item.description}</li>)}</ul>
                  : <p className="mt-1 text-xs text-gray-400">None.</p>}</div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Company intelligence">
          <p className="text-sm text-gray-700">{detail.brief.companySummary}</p>
          {detail.brief.requirements.length > 0 && <ul className="mt-3 space-y-1 text-xs">{detail.brief.requirements.map((item, index) => <li key={index} className="rounded bg-gray-50 p-1.5"><span className="font-medium">{label(item.status)}</span>: {item.text}</li>)}</ul>}
          {detail.brief.evidenceSources.length > 0 && <ul className="mt-3 space-y-1 text-xs">{detail.brief.evidenceSources.map(source => <li key={source.sourceId}><a href={source.url} target="_blank" rel="noreferrer" className="text-teal-700 underline">{source.title}</a> · {source.verification}</li>)}</ul>}
        </Card>
        <Card title="Agent execution and state history">
          <ol className="max-h-96 space-y-1.5 overflow-y-auto text-xs">{timeline?.events.filter(event => ['AI_MANAGEMENT_STATE_CHANGED', 'AGENT_EXECUTION', 'FOLLOWUP_SCHEDULED', 'FOLLOWUP_CANCELLED', 'OPPORTUNITY_UPDATED', 'OUTREACH_BLOCKED', 'SUPPRESSION_ADDED', 'REPLY_CLASSIFIED'].includes(event.type))
            .map(event => <li key={event.eventId} className="border-t pt-1.5"><span className={event.success === false ? 'text-red-700' : 'text-gray-700'}>{event.summary}</span><span className="block text-[10px] text-gray-400">{when(event.at)}</span></li>)}</ol>
        </Card>
      </div>
    </>}
  </div>
}
