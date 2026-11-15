import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeftIcon, CheckCircle2Icon, MailIcon, RefreshCwIcon, SendIcon, UserPlusIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import api from '../services/api'

interface Event { eventId: string; type: string; companyId: string; companyName: string; contactId?: string; contactName?: string; contactEmail?: string; subject?: string; body?: string; createdAt: string; payload: Record<string, unknown> }
interface Workflow { companyId: string; events: Event[]; optedOutEmails: string[]; isSynthetic: boolean }
function err(e: unknown) { return axios.isAxiosError(e) ? e.response?.data?.message ?? 'Workflow update failed.' : 'Workflow update failed.' }

export default function SalesWorkflowPage() {
  const { companyId = '' } = useParams()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [reply, setReply] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [draftId, setDraftId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const events = workflow?.events ?? []
  const selected = events.some(e => e.type === 'SELECTED')
  const contact = [...events].reverse().find(e => e.type === 'CONTACT_IDENTIFIED')
  const draft = [...events].reverse().find(e => e.type === 'EMAIL_DRAFTED')
  const approval = [...events].reverse().find(e => e.type === 'EMAIL_APPROVED')
  const sent = [...events].reverse().find(e => e.type === 'EMAIL_PROVIDER_ACCEPTED')
  const optedOut = !!contact && workflow?.optedOutEmails.includes(contact.contactEmail?.toLowerCase() ?? '')

  async function load() {
    if (!companyId) return
    setBusy(true); setError('')
    try {
      const response = await api.get(`/api/v1/sales/companies/${companyId}`)
      setWorkflow(response.data.data)
      const latestDraft = [...(response.data.data.events as Event[])].reverse().find(e => e.type === 'EMAIL_DRAFTED')
      if (latestDraft) { setDraftId(String(latestDraft.payload.draftId ?? '')); setEditedBody(latestDraft.body ?? '') }
      const latestContact = [...(response.data.data.events as Event[])].reverse().find(e => e.type === 'CONTACT_IDENTIFIED')
      if (latestContact) { setContactName(latestContact.contactName ?? ''); setContactEmail(latestContact.contactEmail ?? '') }
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [companyId])

  async function perform(path: string, body?: unknown, success?: string) {
    setBusy(true); setError(''); setMessage('')
    try { await api.post(path, body ?? {}); if (success) setMessage(success); await load() }
    catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  async function saveContact(event: FormEvent) {
    event.preventDefault()
    await perform(`/api/v1/sales/companies/${companyId}/contacts`, { name: contactName, email: contactEmail, role: contactRole || 'Decision maker' }, 'Contact added to this company workflow.')
  }
  async function createDraft() {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await api.post(`/api/v1/sales/companies/${companyId}/drafts`)
      const value = response.data.data as Event; setDraftId(String(value.payload.draftId)); setEditedBody(value.body ?? ''); setMessage('Draft created and ready for your edits.')
      await load()
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  async function approve() {
    setBusy(true); setError(''); setMessage('')
    try { await api.post(`/api/v1/sales/companies/${companyId}/drafts/${draftId}/approve`, { editedBody }); setMessage('Human approval recorded. You may now send through the mock provider.'); await load() }
    catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  async function send() {
    await perform(`/api/v1/sales/companies/${companyId}/drafts/${draftId}/send`, {}, 'Mock provider accepted the email for processing. Inbox delivery is unconfirmed.')
  }
  async function simulateReply(event: FormEvent) {
    event.preventDefault()
    await perform(`/api/v1/sales/companies/${companyId}/replies`, { replyId: `reply-${Date.now()}`, contactEmail, text: reply }, 'Reply recorded, classified, and checked for human escalation.')
    setReply('')
  }

  return <div>
    <Link to="/sales" className="mb-3 inline-flex items-center gap-1 text-sm text-teal-700"><ArrowLeftIcon className="h-4 w-4" />Sales worklist</Link>
    <PageHeader title={workflow?.events[0]?.companyName ?? 'Sales workflow'} subtitle="Review each stage and keep the company evidence and conversation history together." actions={<button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button>} />
    {workflow?.isSynthetic && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Synthetic demonstration company and contact.</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
    <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-5">{['DISCOVERED', 'QUALIFIED', 'SELECTED', 'EMAIL_PROVIDER_ACCEPTED', 'REPLY_RECEIVED'].map((stage, index) => { const done = events.some(e => e.type === stage); return <div key={stage} className={`rounded-lg border p-3 ${done ? 'border-teal-200 bg-teal-50' : 'bg-white'}`}><p className="text-xs text-gray-500">Stage {index + 1}</p><p className="mt-1 text-xs font-semibold text-gray-800">{stage.replace(/_/g, ' ')}</p><p className={`mt-1 text-[11px] ${done ? 'text-teal-700' : 'text-gray-400'}`}>{done ? 'Recorded' : 'Waiting'}</p></div> })}</div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5"><h2 className="font-semibold text-gray-800">1. Company selection</h2><p className="mt-1 text-xs text-gray-500">Discovery and evidence-qualified opportunities are linked to this account.</p><button disabled={busy || selected} onClick={() => void perform(`/api/v1/sales/companies/${companyId}/select`, {}, 'Company selected for sales outreach.')} className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{selected ? 'Company selected' : 'Select company'}</button></section>
      <section className="card p-5"><h2 className="flex items-center gap-2 font-semibold text-gray-800"><UserPlusIcon className="h-4 w-4" />2. Decision maker</h2><form onSubmit={saveContact} className="mt-3 grid gap-2"><input required value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Contact name" className="rounded-lg border px-3 py-2 text-sm" /><input required type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Contact email" className="rounded-lg border px-3 py-2 text-sm" /><input value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="Role / buying unit" className="rounded-lg border px-3 py-2 text-sm" /><button disabled={busy || !selected || optedOut} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{contact ? 'Update contact details' : 'Add contact'}</button>{optedOut && <p className="text-xs text-red-700">Contact opted out; outreach is blocked.</p>}</form></section>
      <section className="card p-5"><h2 className="flex items-center gap-2 font-semibold text-gray-800"><MailIcon className="h-4 w-4" />3. Personalised email</h2><p className="mt-1 text-xs text-gray-500">Drafts cite the discovered report and frame service fit as a question.</p><button disabled={busy || !contact || optedOut || !!sent} onClick={() => void createDraft()} className="mt-3 rounded-lg bg-navy-600 px-3 py-2 text-sm text-white disabled:opacity-50">Create email draft</button>{draft && <><label className="mt-4 block text-xs font-medium text-gray-600">Review and edit draft · {draft.subject}</label><textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={8} maxLength={10000} className="mt-2 w-full rounded-lg border p-3 text-sm" /><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !editedBody.trim() || !!approval} onClick={() => void approve()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><CheckCircle2Icon className="h-4 w-4" />{approval ? 'Human approved' : 'Approve email'}</button><button disabled={busy || !approval || !!sent} onClick={() => void send()} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white disabled:opacity-50"><SendIcon className="h-4 w-4" />Send via mock provider</button></div>{sent && <p className="mt-3 text-xs text-teal-800">Provider accepted at {new Date(sent.createdAt).toLocaleString()}. This does not confirm inbox delivery.</p>}</>}</section>
      <section className="card p-5"><h2 className="font-semibold text-gray-800">4. Reply intelligence</h2><p className="mt-1 text-xs text-gray-500">Reply simulation uses a local classification adapter; it never sends a message.</p><form onSubmit={simulateReply} className="mt-3 space-y-2"><textarea required value={reply} onChange={e => setReply(e.target.value)} rows={4} placeholder="Paste or simulate an incoming reply…" className="w-full rounded-lg border p-3 text-sm" /><button disabled={busy || !sent || optedOut} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Classify simulated reply</button></form>{events.filter(e => ['REPLY_RECEIVED', 'REPLY_CLASSIFIED', 'FEEDBACK_CAPTURED', 'INTERVENTION_CREATED'].includes(e.type)).slice(-8).map(event => <div key={event.eventId} className="mt-3 rounded-lg bg-gray-50 p-3 text-xs"><strong>{event.type.replace(/_/g, ' ')}{event.payload.intent ? ` · ${event.payload.intent}` : ''}</strong><p className="mt-1 text-gray-600">{String(event.payload.evidence ?? event.payload.requirement ?? event.payload.escalationReason ?? event.body ?? '')}</p></div>)}</section>
    </div>
    <section className="card mt-5 p-5"><h2 className="font-semibold text-gray-800">Full company activity history</h2>{events.length ? <ol className="mt-3 space-y-2">{events.map(event => <li key={event.eventId} className="flex flex-wrap justify-between gap-2 border-t py-2 text-xs"><span className="font-medium text-gray-700">{event.type.replace(/_/g, ' ')}{event.payload.intent ? ` · ${event.payload.intent}` : ''}</span><time className="text-gray-400">{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol> : <p className="mt-3 text-sm text-gray-500">No activity recorded.</p>}</section>
  </div>
}
