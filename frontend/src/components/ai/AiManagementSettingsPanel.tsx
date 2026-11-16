import { FormEvent, useEffect, useState } from 'react'
import { Loader2Icon, OctagonIcon, PlayIcon, SaveIcon } from 'lucide-react'
import { aiManagementService, AiSettings, apiError, when } from '../../services/aiManagement.service'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600">{label}<div className="mt-1">{children}</div>{hint && <span className="mt-1 block text-[11px] font-normal text-singtelGray-500">{hint}</span>}</label>
}
const input = 'w-full rounded-lg border px-3 py-2 text-sm'

export function AiManagementSettingsPanel({ onChanged }: { onChanged?: () => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [intervals, setIntervals] = useState('')
  const [jurisdictions, setJurisdictions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function apply(value: AiSettings) {
    setSettings(value); setIntervals(value.followupIntervalsDays.join(', ')); setJurisdictions(value.consentOnlyJurisdictions.join(', '))
  }
  useEffect(() => { aiManagementService.settings().then(apply).catch(e => setError(apiError(e, 'Settings could not be loaded.'))) }, [])
  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => setSettings(current => current ? { ...current, [key]: value } : current)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!settings) return
    setBusy(true); setError(''); setMessage('')
    try {
      const followupIntervalsDays = intervals.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0)
      const consentOnlyJurisdictions = jurisdictions.split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
      apply(await aiManagementService.saveSettings({ ...settings, followupIntervalsDays, consentOnlyJurisdictions }))
      setMessage('Settings saved.'); onChanged?.()
    } catch (e) { setError(apiError(e, 'Settings could not be saved.')) } finally { setBusy(false) }
  }
  async function emergency(stop: boolean) {
    if (stop && !window.confirm('Stop ALL autonomous outbound email for every company now?')) return
    setBusy(true); setError('')
    try { apply(stop ? await aiManagementService.emergencyStop('Stopped from settings') : await aiManagementService.emergencyResume()); onChanged?.() }
    catch (e) { setError(apiError(e)) } finally { setBusy(false) }
  }

  if (!settings) return <div className="card p-6 text-sm text-singtelGray-500">{error || 'Loading AI Management settings…'}</div>
  return <form onSubmit={save} className="space-y-5">
    <section className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${settings.globalOutboundEnabled ? '' : 'border-red-300 bg-red-50'}`}>
      <div><h3 className="text-sm font-semibold text-singtelGray-800">Global emergency switch</h3>
        <p className="text-xs text-singtelGray-500">{settings.globalOutboundEnabled ? 'Autonomous outbound email is allowed for AI-managed companies.'
          : `All autonomous outbound email is stopped${settings.outboundStoppedAt ? ' since ' + when(settings.outboundStoppedAt) : ''}. Replies are still recorded and escalated.`}</p></div>
      {settings.globalOutboundEnabled
        ? <button type="button" disabled={busy} onClick={() => void emergency(true)} className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white"><OctagonIcon className="h-4 w-4" />Stop all autonomous email</button>
        : <button type="button" disabled={busy} onClick={() => void emergency(false)} className="inline-flex items-center gap-2 rounded bg-singtelRed px-3 py-2 text-sm font-medium text-white"><PlayIcon className="h-4 w-4" />Resume autonomous email</button>}
    </section>

    <section className="card space-y-4 p-5">
      <div><h3 className="text-sm font-semibold text-singtelGray-800">Daily lead discovery</h3>
        <p className="text-xs text-singtelGray-500">Runs on the backend scheduler, independent of this browser. The target is a maximum: only companies that pass the existing ranking thresholds are queued.</p></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.dailyRankingEnabled} onChange={e => set('dailyRankingEnabled', e.target.checked)} />Run Lead Ranking automatically every day</label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Daily target (companies)"><input type="number" min={1} max={200} required value={settings.dailyTarget} onChange={e => set('dailyTarget', Number(e.target.value))} className={input} /></Field>
        <Field label="Preferred time"><input type="time" required value={settings.preferredTime} onChange={e => set('preferredTime', e.target.value)} className={input} /></Field>
        <Field label="Timezone" hint="IANA name, e.g. Asia/Singapore"><input required value={settings.timezone} onChange={e => set('timezone', e.target.value)} className={input} /></Field>
        <Field label="Minimum lead score" hint="Existing ranking score, 0–100"><input type="number" min={0} max={100} required value={settings.minimumScore} onChange={e => set('minimumScore', Number(e.target.value))} className={input} /></Field>
        <Field label="Minimum ranking confidence (%)"><input type="number" min={0} max={100} required value={settings.minimumConfidence} onChange={e => set('minimumConfidence', Number(e.target.value))} className={input} /></Field>
      </div>
      <dl className="grid gap-2 rounded-lg bg-gray-50 p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <div><dt className="text-singtelGray-500">Last execution</dt><dd className="font-medium">{when(settings.lastRun?.completedAt ?? settings.lastRun?.startedAt)}</dd></div>
        <div><dt className="text-singtelGray-500">Next scheduled</dt><dd className="font-medium">{when(settings.nextScheduledRunAt)}</dd></div>
        <div><dt className="text-singtelGray-500">Discovered</dt><dd className="font-medium">{settings.lastRun?.discovered ?? '—'}</dd></div>
        <div><dt className="text-singtelGray-500">Ranked</dt><dd className="font-medium">{settings.lastRun?.ranked ?? '—'}</dd></div>
        <div><dt className="text-singtelGray-500">Queued</dt><dd className="font-medium">{settings.lastRun?.selected ?? '—'}</dd></div>
        <div><dt className="text-singtelGray-500">Rejected / skipped</dt><dd className="font-medium">{settings.lastRun ? `${settings.lastRun.rejected} / ${settings.lastRun.skipped}` : '—'}</dd></div>
      </dl>
    </section>

    <section className="card space-y-4 p-5">
      <div><h3 className="text-sm font-semibold text-singtelGray-800">Autonomous communication policy</h3>
        <p className="text-xs text-singtelGray-500">Applies to every AI-managed company. Pricing, legal, meetings, proposals, complaints and positive interest always go to a person.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Follow-up intervals (days)" hint="Days after the previous email, comma-separated"><input required value={intervals} onChange={e => setIntervals(e.target.value)} className={input} /></Field>
        <Field label="Maximum follow-ups"><input type="number" min={0} max={5} required value={settings.maxFollowups} onChange={e => set('maxFollowups', Number(e.target.value))} className={input} /></Field>
        <Field label="Close as no-response after (days)"><input type="number" min={1} max={60} required value={settings.noResponseCloseDays} onChange={e => set('noResponseCloseDays', Number(e.target.value))} className={input} /></Field>
        <Field label="Inbox polling interval (minutes)"><input type="number" min={1} max={30} required value={settings.inboxPollIntervalMinutes} onChange={e => set('inboxPollIntervalMinutes', Number(e.target.value))} className={input} /></Field>
        <Field label="Max proactive emails per contact / 7 days"><input type="number" min={1} max={10} required value={settings.maxProactiveEmailsPer7Days} onChange={e => set('maxProactiveEmailsPer7Days', Number(e.target.value))} className={input} /></Field>
        <Field label="Min hours between proactive emails"><input type="number" min={1} max={720} required value={settings.minimumHoursBetweenProactiveEmails} onChange={e => set('minimumHoursBetweenProactiveEmails', Number(e.target.value))} className={input} /></Field>
        <Field label="Reply confidence threshold" hint="0.5–1.0; below this a person reviews"><input type="number" step="0.01" min={0.5} max={1} required value={settings.minimumAutoConfidence} onChange={e => set('minimumAutoConfidence', Number(e.target.value))} className={input} /></Field>
        <Field label="Outreach confidence threshold" hint="0.3–1.0"><input type="number" step="0.01" min={0.3} max={1} required value={settings.minimumOutreachConfidence} onChange={e => set('minimumOutreachConfidence', Number(e.target.value))} className={input} /></Field>
      </div>
      <Field label="Consent-only jurisdictions" hint="Country codes where only recorded consent, an existing relationship or an inbound request permits AI outreach (e.g. DE, CA). Set by your compliance team.">
        <input value={jurisdictions} onChange={e => setJurisdictions(e.target.value)} placeholder="None configured" className={input} /></Field>
      <p className="rounded bg-gray-50 p-3 text-xs text-gray-600">Email provider: <strong>{settings.emailProvider.provider}</strong> · {settings.emailProvider.note}
        {settings.lastEmailPollAt ? ' Last inbox check: ' + when(settings.lastEmailPollAt) + '.' : ''}</p>
    </section>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="flex justify-end"><button disabled={busy} className="inline-flex items-center gap-2 rounded bg-singtelRed px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {busy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}Save settings</button></div>
  </form>
}
