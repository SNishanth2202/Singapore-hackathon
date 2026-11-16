import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeftIcon, CheckCircle2Icon, MailIcon, RefreshCwIcon, SendIcon, UserPlusIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import api from '../services/api'
import { AiManagementControl } from '../components/ai/AiManagementControl'
import { aiManagementService, ManagementState } from '../services/aiManagement.service'

interface Event {
  eventId: string; type: string; companyId: string; companyName: string; contactId?: string; contactName?: string
  contactEmail?: string; subject?: string; body?: string; intent?: string; createdAt: string; payload: Record<string, unknown>
}
interface CompanyBrief {
  companySummary: string; businessContext: string[]
  requirements: { text: string; status: string; sourceIds: string[]; sourceMessageId?: string }[]
  services: { id: string; name: string; fit: string; sourceIds: string[] }[]
  evidenceSources: { sourceId: string; title: string; url: string; verification: string }[]
  confidence: number; missingInformation: string[]; communicationStrategy: string
}
interface Workflow {
  companyId: string; events: Event[]; optedOutEmails: string[]; isSynthetic: boolean
  companyBrief?: CompanyBrief
}
function err(e: unknown) { return axios.isAxiosError(e) ? e.response?.data?.message ?? 'Workflow update failed.' : 'Workflow update failed.' }
const apiCompanyId = (id: string) => encodeURIComponent(id)

export default function SalesWorkflowPage() {
  const { companyId = '' } = useParams()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [contactSource, setContactSource] = useState('')
  const [outreachBasis, setOutreachBasis] = useState('')
  const [reply, setReply] = useState('')
  const [editedSubject, setEditedSubject] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [followupAt, setFollowupAt] = useState('')
  const [draftId, setDraftId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [aiState, setAiState] = useState<ManagementState | null>(null)
  const events = workflow?.events ?? []
  const selected = events.some(event => event.type === 'SELECTED')
  const contacts = events.filter(event => event.type === 'CONTACT_IDENTIFIED')
  const contact = contacts[contacts.length - 1]
  const optedOut = !!contact && workflow?.optedOutEmails.includes(contact.contactEmail?.toLowerCase() ?? '')
  const activeDraft = [...events].reverse().find(event => event.type === 'EMAIL_DRAFTED'
    && !events.some(other => other.type === 'EMAIL_REJECTED' && other.payload.draftId === event.payload.draftId))
  const activeDraftId = String(activeDraft?.payload.draftId ?? '')
  const approval = events.find(event => event.type === 'EMAIL_APPROVED' && event.payload.draftId === activeDraftId)
  const sent = events.find(event => event.type === 'EMAIL_PROVIDER_ACCEPTED' && event.payload.draftId === activeDraftId)
  const acceptedMessages = events.filter(event => event.type === 'EMAIL_PROVIDER_ACCEPTED')

  async function load() {
    if (!companyId) return
    setBusy(true); setError('')
    try {
      const response = await api.get('/api/v1/sales/companies/' + apiCompanyId(companyId))
      const data = response.data.data as Workflow
      setWorkflow(data)
      const latestDraft = [...data.events].reverse().find(event => event.type === 'EMAIL_DRAFTED'
        && !data.events.some(other => other.type === 'EMAIL_REJECTED' && other.payload.draftId === event.payload.draftId))
      if (latestDraft) {
        setDraftId(String(latestDraft.payload.draftId ?? ''))
        setEditedSubject(latestDraft.subject ?? '')
        setEditedBody(latestDraft.body ?? '')
      } else { setDraftId(''); setEditedSubject(''); setEditedBody('') }
      const latestContact = [...data.events].reverse().find(event => event.type === 'CONTACT_IDENTIFIED')
      if (latestContact) {
        setContactName(latestContact.contactName ?? '')
        setContactEmail(latestContact.contactEmail ?? '')
        setContactRole(String(latestContact.payload.role ?? ''))
        setContactSource(String(latestContact.payload.source ?? ''))
        setOutreachBasis(String(latestContact.payload.outreachBasis ?? ''))
      }
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [companyId])
  const loadAi = () => aiManagementService.company(companyId).then(value => setAiState(value.management?.managementState ?? 'OFF')).catch(() => setAiState(null))
  useEffect(() => { void loadAi() }, [companyId])

  async function perform(path: string, body?: unknown, success?: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      await api.post(path, body ?? {})
      if (success) setMessage(success)
      await load()
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  async function saveContact(event: FormEvent) {
    event.preventDefault()
    await perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/contacts',
      { name: contactName, email: contactEmail, role: contactRole || 'Decision maker', source: contactSource, outreachBasis },
      'Contact and outreach review saved.')
  }
  async function createDraft() {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await api.post('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/drafts')
      const value = response.data.data as Event
      setDraftId(String(value.payload.draftId)); setEditedSubject(value.subject ?? ''); setEditedBody(value.body ?? '')
      setMessage('Draft created and ready for your edits.')
      await load()
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  async function approve() {
    await perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/drafts/' + encodeURIComponent(draftId) + '/approve',
      { editedSubject, editedBody }, 'Human approval recorded. The message is ready for the configured provider.')
  }
  async function reject() {
    await perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/drafts/' + encodeURIComponent(draftId) + '/reject',
      { reason: 'Rejected by sales reviewer.' }, 'Draft rejected.')
  }
  async function send() {
    await perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/drafts/' + encodeURIComponent(draftId) + '/send',
      {}, 'Provider accepted the email for processing. Inbox delivery is unconfirmed.')
  }
  async function simulateReply(event: FormEvent) {
    event.preventDefault()
    await perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/replies',
      { replyId: 'reply-' + Date.now(), contactEmail, text: reply }, 'Reply analyzed, saved to company memory, and routed for review.')
    setReply('')
  }
  async function scheduleFollowup() {
    if (!followupAt || !contactEmail) return
    await perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/followups',
      { contactEmail, scheduledAt: new Date(followupAt).toISOString(), requestId: 'manual-' + Date.now() },
      'Follow-up scheduled. An eligible draft will be created for approval when due.')
  }
  const timeline = useMemo(() => [...events].reverse(), [events])

  return <div className="space-y-5">
    <Link to="/sales" className="inline-flex items-center gap-1 text-sm text-teal-700"><ArrowLeftIcon className="h-4 w-4" />Sales worklist</Link>
    <PageHeader title={events[0]?.companyName ?? 'Sales workflow'} subtitle="Company intelligence, approved services, outreach, replies, and next steps." actions={<button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button>} />
    {workflow?.isSynthetic && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Account and contact records.</p>}
    {aiState && workflow && <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div><h2 className="text-sm font-semibold text-gray-800">AI Management</h2>
        <p className="text-xs text-gray-500">{aiState === 'OFF' ? 'Let the AI run this company’s email conversation, escalating to you only when needed. Manual drafting below stays available.' : 'The AI is managing this company’s email conversation. Manual activity remains available.'}</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <AiManagementControl companyId={workflow.companyId} companyName={events[0]?.companyName ?? workflow.companyId} state={aiState} onChanged={text => { setMessage(text); void loadAi(); void load() }} />
        <Link to={'/ai-management/companies/' + encodeURIComponent(workflow.companyId)} className="text-xs text-teal-700 underline">Conversation view</Link>
      </div>
    </section>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}

    {workflow?.companyBrief && <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-800">Company context</h2><p className="mt-2 text-sm text-gray-700">{workflow.companyBrief.companySummary}</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">Context confidence {Math.round(workflow.companyBrief.confidence * 100)}%</span></div>
      <p className="mt-3 text-sm text-gray-600">{workflow.companyBrief.communicationStrategy}</p>
      {workflow.companyBrief.requirements.length > 0 && <div className="mt-4"><h3 className="text-xs font-semibold uppercase text-gray-500">Requirements and signals</h3><ul className="mt-2 space-y-2">{workflow.companyBrief.requirements.map((item, index) => <li key={index} className="rounded bg-gray-50 p-2 text-sm"><span className="font-medium">{item.status.replace(/_/g, ' ')}</span>: {item.text}<small className="block text-xs text-gray-500">Evidence: {item.sourceIds.join(', ') || 'No source reference'}</small></li>)}</ul></div>}
      {workflow.companyBrief.services.length > 0 && <p className="mt-3 text-sm text-gray-600">Relevant catalogue services: {workflow.companyBrief.services.map(service => service.name + ' (' + service.fit.toLowerCase().replace('_', ' ') + ')').join(', ')}</p>}
      {workflow.companyBrief.evidenceSources.length > 0 && <ul className="mt-3 space-y-1 text-xs">{workflow.companyBrief.evidenceSources.map(source => <li key={source.sourceId}><a className="text-teal-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {source.verification}</li>)}</ul>}
      {workflow.companyBrief.missingInformation.length > 0 && <p className="mt-3 text-xs text-amber-700">Still to verify: {workflow.companyBrief.missingInformation.join(', ')}</p>}
    </section>}

    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{['DISCOVERED', 'QUALIFIED', 'SELECTED', 'EMAIL_PROVIDER_ACCEPTED', 'REPLY_RECEIVED'].map((stage, index) => {
      const done = events.some(event => event.type === stage)
      return <div key={stage} className={`rounded-lg border p-3 ${done ? 'border-teal-200 bg-teal-50' : 'bg-white'}`}><p className="text-xs text-gray-500">Stage {index + 1}</p><p className="mt-1 text-xs font-semibold text-gray-800">{stage.replace(/_/g, ' ')}</p><p className={`mt-1 text-[11px] ${done ? 'text-teal-700' : 'text-gray-400'}`}>{done ? 'Recorded' : 'Waiting'}</p></div>
    })}</div>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5"><h2 className="font-semibold text-gray-800">1. Company selection</h2><p className="mt-1 text-xs text-gray-500">Discovery and evidence-qualified opportunities remain linked to this account.</p><button disabled={busy || selected} onClick={() => void perform('/api/v1/sales/companies/' + apiCompanyId(companyId) + '/select', {}, 'Company selected for sales outreach.')} className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{selected ? 'Company selected' : 'Select company'}</button></section>
      <section className="card p-5"><h2 className="flex items-center gap-2 font-semibold text-gray-800"><UserPlusIcon className="h-4 w-4" />2. Verified contact and outreach review</h2><form onSubmit={saveContact} className="mt-3 grid gap-2">
        <input required value={contactName} onChange={event => setContactName(event.target.value)} placeholder="Contact name" className="rounded-lg border px-3 py-2 text-sm" />
        <input required type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} placeholder="Contact email" className="rounded-lg border px-3 py-2 text-sm" />
        <input value={contactRole} onChange={event => setContactRole(event.target.value)} placeholder="Role / buying unit" className="rounded-lg border px-3 py-2 text-sm" />
        <input required value={contactSource} onChange={event => setContactSource(event.target.value)} placeholder="How was this contact verified?" className="rounded-lg border px-3 py-2 text-sm" />
        <select required value={outreachBasis} onChange={event => setOutreachBasis(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">Select reviewed outreach basis</option><option value="RECORDED_CONSENT">Recorded consent</option><option value="EXISTING_BUSINESS_RELATIONSHIP">Existing business relationship</option><option value="ASSESSED_LEGITIMATE_INTEREST">Legitimate interest assessed</option><option value="INBOUND_REQUEST">Customer requested contact</option></select>
        <p className="text-xs text-gray-500">A public email address alone is not marketing permission. Confirm your organisation’s applicable basis before proceeding.</p>
        <button disabled={busy || !selected || optedOut} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{contact ? 'Update verified contact' : 'Save contact review'}</button>
        {optedOut && <p className="text-xs text-red-700">Contact opted out; outreach is blocked.</p>}
      </form></section>

      <section className="card p-5"><h2 className="flex items-center gap-2 font-semibold text-gray-800"><MailIcon className="h-4 w-4" />3. Personalised outreach and reply drafts</h2><p className="mt-1 text-xs text-gray-500">Drafts use company evidence and approved catalogue content. Every outbound email needs human approval.</p>
        <button disabled={busy || !contact || optedOut || acceptedMessages.some(event => event.contactEmail?.toLowerCase() === contactEmail.toLowerCase() && event.payload.kind === 'initial')} onClick={() => void createDraft()} className="mt-3 rounded-lg bg-navy-600 px-3 py-2 text-sm text-white disabled:opacity-50">Create initial email draft</button>
        {activeDraft && <><label className="mt-4 block text-xs font-medium text-gray-600">{activeDraft.payload.kind === 'reply' ? 'Suggested response' : activeDraft.payload.kind === 'followup' ? 'Suggested follow-up' : 'Initial outreach'} · edit before approval</label>
          <input aria-label="Email subject" value={editedSubject} onChange={event => setEditedSubject(event.target.value)} maxLength={200} className="mt-2 w-full rounded-lg border p-3 text-sm" />
          <textarea aria-label="Email body" value={editedBody} onChange={event => setEditedBody(event.target.value)} rows={8} maxLength={10000} className="mt-2 w-full rounded-lg border p-3 text-sm" />
          <p className="mt-2 text-xs text-gray-500">{String(activeDraft.payload.rationale ?? '')} {activeDraft.payload.confidence != null ? 'Confidence ' + Math.round(Number(activeDraft.payload.confidence) * 100) + '%' : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !editedBody.trim() || !editedSubject.trim() || !!approval} onClick={() => void approve()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><CheckCircle2Icon className="h-4 w-4" />{approval ? 'Human approved' : 'Approve email'}</button>
            <button disabled={busy || !!approval || !!sent} onClick={() => void reject()} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">Reject draft</button>
            <button disabled={busy || !approval || !!sent} onClick={() => void send()} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white disabled:opacity-50"><SendIcon className="h-4 w-4" />Send via configured provider</button></div>
          {sent && <p className="mt-3 text-xs text-teal-800">Provider accepted at {new Date(sent.createdAt).toLocaleString()}. Inbox delivery is unconfirmed.</p>}
        </>}
      </section>

      <section className="card p-5"><h2 className="font-semibold text-gray-800">4. Reply intelligence</h2><p className="mt-1 text-xs text-gray-500">Inbound messages are matched to this contact and thread, analyzed, saved to company memory, and routed to response review or intervention.</p>
        <form onSubmit={simulateReply} className="mt-3 space-y-2"><textarea required value={reply} onChange={event => setReply(event.target.value)} rows={4} placeholder="Paste a customer reply for analysis..." className="w-full rounded-lg border p-3 text-sm" /><button disabled={busy || acceptedMessages.length === 0 || optedOut} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Analyze simulated reply</button></form>
        {timeline.filter(event => ['REPLY_RECEIVED', 'REPLY_CLASSIFIED', 'FEEDBACK_CAPTURED', 'INTERVENTION_CREATED'].includes(event.type)).slice(0, 8).map(event => {
          const analysis = event.payload.analysis as { intent?: string; requestedNextAction?: string } | undefined
          return <div key={event.eventId} className="mt-3 rounded-lg bg-gray-50 p-3 text-xs"><strong>{event.type.replace(/_/g, ' ')}{event.intent ? ' · ' + event.intent : analysis?.intent ? ' · ' + analysis.intent : ''}</strong><p className="mt-1 text-gray-600">{String(event.payload.requirement ?? event.payload.escalationReason ?? event.body ?? analysis?.requestedNextAction ?? '')}</p><span className="text-gray-400">{new Date(event.createdAt).toLocaleString()}</span></div>
        })}
      </section>
    </div>

    {acceptedMessages.length > 0 && <section className="card p-5"><h2 className="font-semibold text-gray-800">Follow-up management</h2><p className="mt-1 text-sm text-gray-500">Replies, opt-outs, active interventions, timing, and the configured contact limit are checked before a follow-up draft is created.</p><div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-gray-500">Requested follow-up time<input type="datetime-local" value={followupAt} onChange={event => setFollowupAt(event.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-sm" /></label>
      <button disabled={busy || !followupAt || optedOut} onClick={() => void scheduleFollowup()} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Schedule follow-up</button>
      <button disabled={busy} onClick={() => void perform('/api/v1/sales/followups/run-due', {}, 'Due follow-ups reviewed; eligible drafts await approval.')} className="rounded-lg bg-navy-600 px-3 py-2 text-sm text-white disabled:opacity-50">Review due follow-ups</button>
    </div></section>}

    <section className="card p-5"><h2 className="font-semibold text-gray-800">Full company activity history</h2>{events.length ? <ol className="mt-3 space-y-2">{timeline.map(event => <li key={event.eventId} className="flex flex-wrap justify-between gap-2 border-t py-2 text-xs"><span className="font-medium text-gray-700">{event.type.replace(/_/g, ' ')}{event.intent ? ' · ' + event.intent : ''}</span><time className="text-gray-400">{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol> : <p className="mt-3 text-sm text-gray-500">No activity recorded.</p>}</section>
  </div>
}
