import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangleIcon, BotIcon, Loader2Icon, PauseIcon, PlayIcon, PowerIcon, UserCheckIcon, XIcon } from 'lucide-react'
import { aiManagementService, apiError, CompanyDetail, ManagementState, OUTREACH_BASIS_LABELS } from '../../services/aiManagement.service'
import { ManagementBadge } from './AiStatusBadge'

const ENROLLED: ManagementState[] = ['ACTIVATING', 'ACTIVE', 'PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'ERROR']

/** Activation dialog: shows readiness, collects a verified contact if needed, and requires explicit authorisation. */
function ActivationDialog({ companyId, companyName, onClose, onDone }: { companyId: string; companyName: string; onClose: () => void; onDone: (message: string) => void }) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [jurisdiction, setJurisdiction] = useState('SG')
  const [contact, setContact] = useState({ name: '', email: '', role: '', source: '', outreachBasis: '' })
  const [authorised, setAuthorised] = useState(false)
  const [compliance, setCompliance] = useState(false)

  useEffect(() => {
    let current = true
    aiManagementService.company(companyId).then(value => {
      if (!current) return
      setDetail(value)
      const existing = value.readiness.contact
      if (existing) setContact({ name: existing.name ?? '', email: existing.email ?? '', role: existing.role ?? '', source: existing.source ?? '', outreachBasis: existing.outreachBasis ?? '' })
    }).catch(e => { if (current) setError(apiError(e, 'Could not load company readiness.')) })
    return () => { current = false }
  }, [companyId])

  const contactProblems = detail?.readiness.problems.filter(problem => /contact|outreach basis/i.test(problem)) ?? []
  const otherProblems = detail?.readiness.problems.filter(problem => !/contact|outreach basis/i.test(problem)) ?? []
  const needsContactForm = !detail?.readiness.contact || contactProblems.length > 0

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await aiManagementService.enable(companyId, {
        jurisdiction,
        ...(needsContactForm || contact.email !== detail?.readiness.contact?.email ? { contact } : {}),
      })
      const outcome = result.step.status === 'sent' ? 'Initial outreach was sent autonomously.' : result.step.reason ? 'Next step: ' + result.step.reason : ''
      onDone(['AI Management enabled for ' + companyName + '.', outcome, ...result.warnings].filter(Boolean).join(' '))
    } catch (e) { setError(apiError(e, 'AI Management could not be enabled.')) } finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="ai-activate-title">
    <form onSubmit={submit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="ai-activate-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900"><BotIcon className="h-5 w-5 text-teal-600" />Enable AI Management</h2>
          <p className="mt-1 text-sm text-gray-500">{companyName}</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100"><XIcon className="h-5 w-5" /></button>
      </div>
      {!detail && !error && <p className="mt-6 flex items-center gap-2 text-sm text-gray-500"><Loader2Icon className="h-4 w-4 animate-spin" />Checking intelligence, contact and suppression…</p>}
      {detail && <>
        <section className="mt-4 rounded-lg border p-3 text-sm">
          <h3 className="text-xs font-semibold uppercase text-gray-500">Readiness</h3>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            <li>{detail.readiness.intelligence.discovered ? '✓' : '✗'} Entered through Discovery</li>
            <li>{detail.readiness.intelligence.qualifiedOpportunities ? '✓' : '✗'} {detail.readiness.intelligence.qualifiedOpportunities} evidence-qualified opportunit{detail.readiness.intelligence.qualifiedOpportunities === 1 ? 'y' : 'ies'}</li>
            <li>{detail.readiness.intelligence.evidenceSources ? '✓' : '✗'} {detail.readiness.intelligence.evidenceSources} verified research source(s)</li>
            <li>{detail.readiness.contact && !detail.readiness.contact.suppressed ? '✓' : '✗'} Verified contact {detail.readiness.contact?.suppressed ? '(opted out — blocked)' : ''}</li>
          </ul>
          {otherProblems.length > 0 && <p className="mt-2 text-xs text-red-700">{otherProblems.join(' ')}</p>}
        </section>
        <fieldset className="mt-4 grid gap-2">
          <legend className="text-xs font-semibold uppercase text-gray-500">Verified business contact</legend>
          <input required value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} placeholder="Contact name" className="rounded-lg border px-3 py-2 text-sm" />
          <input required type="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} placeholder="Business email" className="rounded-lg border px-3 py-2 text-sm" />
          <input required value={contact.role} onChange={e => setContact({ ...contact, role: e.target.value })} placeholder="Role" className="rounded-lg border px-3 py-2 text-sm" />
          <input required minLength={3} value={contact.source} onChange={e => setContact({ ...contact, source: e.target.value })} placeholder="How was this contact verified?" className="rounded-lg border px-3 py-2 text-sm" />
          <select required value={contact.outreachBasis} onChange={e => setContact({ ...contact, outreachBasis: e.target.value })} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">Reviewed outreach basis…</option>
            {detail.activation.outreachBases.map(basis => <option key={basis} value={basis}>{OUTREACH_BASIS_LABELS[basis] ?? basis}</option>)}
          </select>
          <label className="text-xs text-gray-600">Contact’s jurisdiction (country code)
            <input required value={jurisdiction} onChange={e => setJurisdiction(e.target.value.toUpperCase().slice(0, 2))} pattern="[A-Za-z]{2}" className="ml-2 w-16 rounded border px-2 py-1 text-sm uppercase" /></label>
          {detail.activation.consentOnlyJurisdictions.length > 0 && <p className="text-xs text-gray-500">Consent-only policy applies to: {detail.activation.consentOnlyJurisdictions.join(', ')}.</p>}
          <p className="text-xs text-gray-500">A publicly listed email address is not proof of consent or lawful permission.</p>
        </fieldset>
        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">What you are authorising</p>
          <p className="mt-1">{detail.activation.statement}</p>
          {detail.emailProvider.synthetic && <p className="mt-2 font-medium">Recorded email mode: messages stay in the outbox and are not sent.</p>}
          {!detail.activation.globalOutboundEnabled && <p className="mt-2 font-medium text-red-700">Global outbound sending is stopped. Nothing will be sent until it is resumed.</p>}
        </section>
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={authorised} onChange={e => setAuthorised(e.target.checked)} className="mt-1" />
          I authorise autonomous outreach, follow-ups and routine replies for this company without approving each email.</label>
        <label className="mt-2 flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={compliance} onChange={e => setCompliance(e.target.checked)} className="mt-1" />
          I have reviewed the outreach basis against the applicable outreach and privacy requirements for the contact’s jurisdiction.</label>
      </>}
      {error && <p role="alert" className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button disabled={busy || !detail || !authorised || !compliance || otherProblems.length > 0} className="inline-flex items-center gap-2 rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy && <Loader2Icon className="h-4 w-4 animate-spin" />}Enable AI Management</button>
      </div>
    </form>
  </div>
}

export function AiManagementControl({ companyId, companyName, state, compact = false, onChanged }: {
  companyId: string; companyName: string; state: ManagementState; compact?: boolean; onChanged?: (message: string) => void
}) {
  const [dialog, setDialog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const enrolled = ENROLLED.includes(state)

  async function run(action: () => Promise<unknown>, message: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true); setError('')
    try { await action(); onChanged?.(message) } catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }
  const toggle = () => enrolled
    ? run(() => aiManagementService.disable(companyId), 'AI Management disabled for ' + companyName + '. Pending automated actions were cancelled; history is kept.',
      'Turn off AI Management for ' + companyName + '? Scheduled follow-ups will be cancelled. Conversation history and intelligence are kept.')
    : setDialog(true)

  return <div className={compact ? 'flex flex-col items-start gap-1' : 'flex flex-wrap items-center gap-2'}>
    <div className="flex items-center gap-2">
      <button type="button" role="switch" aria-checked={enrolled} aria-label={(enrolled ? 'Disable' : 'Enable') + ' AI Management for ' + companyName}
        disabled={busy || state === 'ACTIVATING'} onClick={() => void toggle()}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${enrolled ? 'bg-teal-600' : 'bg-gray-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enrolled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <ManagementBadge state={state} />
      {busy && <Loader2Icon className="h-3.5 w-3.5 animate-spin text-gray-400" />}
    </div>
    {enrolled && <div className="flex flex-wrap gap-1">
      {(state === 'ACTIVE' || state === 'HUMAN_ATTENTION_REQUIRED') && <button disabled={busy} onClick={() => void run(() => aiManagementService.pause(companyId), 'Automation paused for ' + companyName + '.')}
        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"><PauseIcon className="h-3 w-3" />Pause</button>}
      {['PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'ERROR'].includes(state) && <button disabled={busy} onClick={() => void run(() => aiManagementService.resume(companyId), 'AI Management resumed for ' + companyName + '.')}
        className="inline-flex items-center gap-1 rounded border border-teal-200 px-1.5 py-0.5 text-[11px] text-teal-700 hover:bg-teal-50"><PlayIcon className="h-3 w-3" />Resume AI</button>}
      {state !== 'HUMAN_HANDOVER' && <button disabled={busy} onClick={() => void run(() => aiManagementService.takeover(companyId), 'You now own the ' + companyName + ' conversation. Automation is stopped until you resume it.')}
        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-purple-700 hover:bg-purple-50"><UserCheckIcon className="h-3 w-3" />Take over</button>}
      {!compact && <button disabled={busy} onClick={() => void toggle()} className="inline-flex items-center gap-1 rounded border border-red-200 px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-50"><PowerIcon className="h-3 w-3" />Disable</button>}
    </div>}
    {error && <p role="alert" className="flex items-start gap-1 text-[11px] text-red-700"><AlertTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" />{error}</p>}
    {dialog && <ActivationDialog companyId={companyId} companyName={companyName} onClose={() => setDialog(false)} onDone={message => { setDialog(false); onChanged?.(message) }} />}
  </div>
}
