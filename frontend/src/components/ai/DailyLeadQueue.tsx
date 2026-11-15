import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotIcon, CalendarClockIcon, Loader2Icon, PlayIcon, RefreshCwIcon } from 'lucide-react'
import { aiManagementService, AiSettings, apiError, CompanyRow, when } from '../../services/aiManagement.service'
import { AiManagementControl } from './AiManagementControl'
import { CommunicationBadge } from './AiStatusBadge'

/** Today's eligible companies from the scheduled Lead Ranking run, each with an independent AI Management toggle. */
export function DailyLeadQueue() {
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [companies, current] = await Promise.all([aiManagementService.companies({ scope: 'queue' }), aiManagementService.settings()])
      setRows(companies); setSettings(current); setError('')
    } catch (e) { setError(apiError(e, 'The daily lead queue could not be loaded.')) } finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function runNow() {
    setRunning(true); setError(''); setMessage('')
    try {
      const run = await aiManagementService.runDailyRanking()
      setMessage(run.status === 'COMPLETED' ? `Ranked ${run.ranked} discovered companies; ${run.selected} new eligible compan${run.selected === 1 ? 'y' : 'ies'} added (target ${run.target}).`
        : run.reason ?? 'Ranking run did not complete.')
      await load()
    } catch (e) { setError(apiError(e, 'The ranking run failed.')) } finally { setRunning(false) }
  }
  async function seedPreview() {
    setError('')
    try { const result = await aiManagementService.seedPreview(); setMessage(result.note); await load() }
    catch (e) { setError(apiError(e, 'Synthetic preview companies could not be loaded.')) }
  }
  const last = settings?.lastRun

  return <section className="card mb-5 overflow-hidden" aria-labelledby="daily-queue-title">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
      <div>
        <h2 id="daily-queue-title" className="flex items-center gap-2 text-sm font-semibold text-gray-800"><BotIcon className="h-4 w-4 text-teal-600" />Daily AI lead queue</h2>
        <p className="mt-1 text-xs text-gray-500">Unique eligible companies prepared by the Lead Ranking Agent. Enable AI Management per company to let the AI run its email conversation.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/ai-management?tab=settings" className="btn-secondary text-xs">Schedule & target</Link>
        <button onClick={() => void runNow()} disabled={running} className="inline-flex items-center gap-1.5 rounded bg-navy-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          {running ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <PlayIcon className="h-3.5 w-3.5" />}Run ranking now</button>
        <button onClick={() => void load()} disabled={busy} aria-label="Refresh daily queue" className="rounded p-2 text-gray-500 hover:bg-gray-100"><RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>
    {settings && <div className="grid grid-cols-2 gap-px bg-gray-100 text-xs sm:grid-cols-4 lg:grid-cols-7">
      {[
        ['Daily target', String(settings.dailyTarget)],
        ['Schedule', settings.dailyRankingEnabled ? settings.preferredTime + ' ' + settings.timezone : 'Off'],
        ['Last run', when(last?.completedAt ?? last?.startedAt)],
        ['Next run', when(settings.nextScheduledRunAt)],
        ['Discovered / ranked', last ? `${last.discovered} / ${last.ranked}` : '—'],
        ['Added to queue', last ? String(last.selected) : '—'],
        ['Rejected / skipped', last ? `${last.rejected} / ${last.skipped}` : '—'],
      ].map(([name, value]) => <div key={name} className="bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-gray-400">{name}</p><p className="mt-0.5 font-medium text-gray-700">{value}</p></div>)}
    </div>}
    {last?.status === 'FAILED' && <p className="bg-red-50 px-4 py-2 text-xs text-red-700">Last run failed: {last.error}</p>}
    {error && <p role="alert" className="bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
    {message && <p role="status" className="bg-teal-50 px-4 py-2 text-xs text-teal-800">{message}</p>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500"><tr>
          <th className="px-4 py-2">Rank</th><th className="px-2 py-2">Company</th><th className="px-2 py-2">Score</th><th className="px-2 py-2">Priority</th>
          <th className="px-2 py-2">Opportunity</th><th className="px-2 py-2">Recommended services</th><th className="px-2 py-2">AI Management</th><th className="px-2 py-2">Conversation</th>
        </tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.companyId} className={`border-t align-top ${row.humanAttention ? 'bg-red-50/40' : ''}`}>
            <td className="px-4 py-3 font-semibold text-gray-500">{row.rank ? String(row.rank).padStart(2, '0') : '—'}<span className="block text-[10px] font-normal text-gray-400">{row.queuedOn}</span></td>
            <td className="px-2 py-3"><Link className="font-semibold text-navy-600 hover:underline" to={'/ai-management/companies/' + encodeURIComponent(row.companyId)}>{row.companyName}</Link>
              <span className="block text-[11px] text-gray-500">{[row.country, row.industry].filter(Boolean).join(' · ') || 'Country / industry not recorded'}</span></td>
            <td className="px-2 py-3 font-medium">{row.leadScore ?? '—'}{row.leadConfidence != null && <span className="block text-[10px] text-gray-400">{row.leadConfidence}% conf.</span>}</td>
            <td className="px-2 py-3">{row.priority ?? '—'}</td>
            <td className="max-w-[220px] px-2 py-3 text-gray-600">{row.opportunitySummary ?? '—'}</td>
            <td className="px-2 py-3 text-gray-600">{row.recommendedServices.join(', ') || '—'}</td>
            <td className="px-2 py-3"><AiManagementControl compact companyId={row.companyId} companyName={row.companyName} state={row.managementState}
              onChanged={text => { setMessage(text); void load() }} /></td>
            <td className="px-2 py-3">{row.managementState === 'OFF' && !row.activatedAt ? <span className="text-gray-400">Not started</span> : <>
              <CommunicationBadge state={row.communicationState} />
              {row.nextActionAt && <span className="mt-1 flex items-center gap-1 text-[10px] text-gray-400"><CalendarClockIcon className="h-3 w-3" />{when(row.nextActionAt)}</span>}
              {row.attentionReason && row.humanAttention && <span className="mt-1 block text-[10px] text-red-700">{row.attentionReason}</span>}</>}</td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length && !busy && <div className="p-6 text-center text-sm text-gray-500"><p>No companies are in the daily queue yet. Research companies to feed Discovery, then run ranking. The queue never invents leads to reach the target.</p>
        {settings?.previewSeedingAvailable && <button onClick={() => void seedPreview()} className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">Load 3 synthetic preview companies</button>}</div>}
    </div>
  </section>
}
