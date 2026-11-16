import { useEffect, useState } from 'react'
import {
  CheckCircle2Icon,
  XCircleIcon,
  RefreshCwIcon,
  SlidersIcon,
  DatabaseIcon,
  WifiIcon,
  ClockIcon,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { analyticsService, HealthStatus } from '../services/analytics.service'
import { formatDate } from '../utils/formatters'
import BusinessKnowledge from '../components/BusinessKnowledge'
import { AiManagementSettingsPanel } from '../components/ai/AiManagementSettingsPanel'
import api from '../services/api'

export default function Settings() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)
  const [refreshFrequency, setRefreshFrequency] = useState('')
  const [feedBusy, setFeedBusy] = useState(false)
  const [feedMessage, setFeedMessage] = useState('')
  const [feedError, setFeedError] = useState('')

  async function saveFeedInterval() {
    setFeedBusy(true); setFeedMessage(''); setFeedError('')
    try {
      const current = (await api.get('/api/v1/prospecting')).data.settings
      const saved = (await api.post('/api/v1/prospecting/settings', { ...current, intervalMinutes: Number(refreshFrequency) })).data
      setRefreshFrequency(String(saved.settings.intervalMinutes)); setFeedMessage('Research interval saved. Lead Ranking uses the same setting.')
    } catch { setFeedError('The interval could not be saved. Check whether research is running, then retry.') }
    finally { setFeedBusy(false) }
  }

  async function checkHealth() {
    setLoadingHealth(true)
    try {
      const data = await analyticsService.getHealth()
      setHealth(data)
    } catch {
      setHealth({
        status: 'down',
        timestamp: new Date().toISOString(),
        services: {
          mongodb: { status: 'down' },
          neo4j: { status: 'down' },
        },
      })
    } finally {
      setLoadingHealth(false)
    }
  }

  useEffect(() => {
    void checkHealth()
    let active = true
    api.get('/api/v1/prospecting').then(response => { if (active) setRefreshFrequency(String(response.data.settings.intervalMinutes)) })
      .catch(() => { if (active) setFeedError('The saved research interval could not be loaded.') })
    return () => { active = false }
  }, [])

  const mongoHealthy = health?.services?.mongodb?.status === 'healthy' || health?.services?.mongodb?.status === 'connected'
  const neo4jHealthy = health?.services?.neo4j?.status === 'healthy' || health?.services?.neo4j?.status === 'connected'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage research settings, platform configuration and integration health"
      />

      <section aria-labelledby="ai-settings-heading" className="space-y-3">
        <h2 id="ai-settings-heading" className="text-base font-semibold text-gray-800">AI Management & daily lead discovery</h2>
        <AiManagementSettingsPanel />
      </section>

      {/* Business Knowledge */}
      <BusinessKnowledge />

      {/* Platform Config */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <SlidersIcon className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Platform Configuration</h2>
            <p className="text-xs text-gray-400">Intelligence scraping and extraction settings</p>
          </div>
        </div>

        <div className="p-6">
          <label htmlFor="feed-refresh-interval" className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
            Intelligence Feed Refresh Interval
          </label>
          <select
            id="feed-refresh-interval"
            value={refreshFrequency}
            disabled={!refreshFrequency || feedBusy}
            onChange={(e) => setRefreshFrequency(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 w-full sm:w-auto"
          >
            {!refreshFrequency && <option value="">Loading saved interval…</option>}
            {refreshFrequency && !['60', '360', '720', '1440'].includes(refreshFrequency) && <option value={refreshFrequency}>Every {refreshFrequency} minutes</option>}
            <option value="60">Every 1 Hour</option>
            <option value="360">Every 6 Hours</option>
            <option value="720">Every 12 Hours</option>
            <option value="1440">Daily</option>
          </select>
          <button onClick={() => void saveFeedInterval()} disabled={feedBusy || !refreshFrequency} className="ml-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Save feed interval</button>
          {feedMessage && <p role="status" className="mt-2 text-sm text-teal-700">{feedMessage}</p>}
          {feedError && <p role="alert" className="mt-2 text-sm text-red-700">{feedError}</p>}
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
            <ClockIcon className="w-3 h-3" />
            Uses the saved Lead Ranking research interval. Automatic research must be enabled on Lead Ranking for scheduled runs.
          </p>
        </div>
      </div>

      {/* Integration Status */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
              <DatabaseIcon className="w-4 h-4 text-navy-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Integration Health</h2>
              <p className="text-xs text-gray-400">Real-time status of core storage layers</p>
            </div>
          </div>
          <button
            onClick={() => void checkHealth()}
            disabled={loadingHealth}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
            Re-check
          </button>
        </div>

        <div className="p-6 space-y-4">
          {health?.storageMode === 'temporary_preview' && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <WifiIcon className="w-3.5 h-3.5 flex-shrink-0" />
              Storage: temporary session. Research is retained until the service restarts.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* MongoDB */}
            <div className={`rounded-xl p-4 border transition-colors ${mongoHealthy ? 'bg-teal-50/50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${mongoHealthy ? 'bg-teal-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-semibold text-gray-800">MongoDB</span>
                </div>
                {mongoHealthy ? (
                  <div className="flex items-center gap-1 text-xs font-semibold text-teal-700">
                    <CheckCircle2Icon className="w-4 h-4" />
                    Online
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-400">
                    <XCircleIcon className="w-4 h-4" />
                    {health?.services?.mongodb?.status ?? 'Offline'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">Company profiles, signals and opportunities</p>
              {health?.services?.mongodb?.latencyMs !== undefined && (
                <p className="text-xs text-gray-400 mt-1.5 font-mono">{health.services.mongodb.latencyMs}ms latency</p>
              )}
            </div>

            {/* Neo4j */}
            <div className={`rounded-xl p-4 border transition-colors ${neo4jHealthy ? 'bg-teal-50/50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${neo4jHealthy ? 'bg-teal-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-semibold text-gray-800">Neo4j</span>
                </div>
                {neo4jHealthy ? (
                  <div className="flex items-center gap-1 text-xs font-semibold text-teal-700">
                    <CheckCircle2Icon className="w-4 h-4" />
                    Online
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-400">
                    <XCircleIcon className="w-4 h-4" />
                    {health?.services?.neo4j?.status ?? 'Offline'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">Graph relationships, multi-hop lookups</p>
              {health?.services?.neo4j?.latencyMs !== undefined && (
                <p className="text-xs text-gray-400 mt-1.5 font-mono">{health.services.neo4j.latencyMs}ms latency</p>
              )}
            </div>
          </div>

          {health && (
            <p className="text-xs text-gray-400 text-right flex items-center justify-end gap-1">
              <ClockIcon className="w-3 h-3" />
              Last probe: {formatDate(health.timestamp)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
