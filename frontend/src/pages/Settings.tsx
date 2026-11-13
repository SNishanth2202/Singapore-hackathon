import { useEffect, useState } from 'react'
import { CheckCircle2Icon, XCircleIcon, RefreshCwIcon, UserIcon, SlidersIcon, DatabaseIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { analyticsService, HealthStatus } from '../services/analytics.service'
import { formatDate } from '../utils/formatters'

export default function Settings() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)
  const [refreshFrequency, setRefreshFrequency] = useState('6h')

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
  }, [])

  const mongoHealthy = health?.services?.mongodb?.status === 'healthy' || health?.services?.mongodb?.status === 'connected'
  const neo4jHealthy = health?.services?.neo4j?.status === 'healthy' || health?.services?.neo4j?.status === 'connected'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Settings & Configuration"
        subtitle="Manage user preferences, data pipeline intervals, and integration diagnostics"
      />

      {/* User Profile */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
            <UserIcon className="w-4 h-4 text-navy-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">User Profile</h2>
            <p className="text-xs text-gray-500">Current authenticated enterprise session</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Full Name
            </label>
            <input
              type="text"
              readOnly
              value="Enterprise Analyst"
              className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Email Address
            </label>
            <input
              type="email"
              readOnly
              value="analyst@singtel.com"
              className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Role
            </label>
            <input
              type="text"
              readOnly
              value="Strategic Enterprise Sales & Intelligence"
              className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Division
            </label>
            <input
              type="text"
              readOnly
              value="Singtel Enterprise Group (Singapore HQ)"
              className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Platform Config */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <SlidersIcon className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">Platform Configuration</h2>
            <p className="text-xs text-gray-500">Autonomous intelligence scraping & extraction triggers</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Intelligence Feed Refresh Interval
            </label>
            <select
              value={refreshFrequency}
              onChange={(e) => setRefreshFrequency(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="1h">Every 1 Hour (High Sensitivity)</option>
              <option value="6h">Every 6 Hours (Standard)</option>
              <option value="12h">Every 12 Hours</option>
              <option value="24h">Daily (Low Bandwidth)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Determines how frequently background collectors poll registry APIs and news sources for signals.
            </p>
          </div>
        </div>
      </div>

      {/* Integration Status Cards */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center">
              <DatabaseIcon className="w-4 h-4 text-navy-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Integration Status</h2>
              <p className="text-xs text-gray-500">Real-time health check of core storage layers</p>
            </div>
          </div>
          <button
            onClick={() => void checkHealth()}
            disabled={loadingHealth}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
            Re-check Health
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* MongoDB */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-800">MongoDB</span>
                <span className="text-xs text-gray-500">(Document Store)</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Stores company profiles, intelligence signals, and opportunities.
              </p>
              {health?.services?.mongodb?.latencyMs !== undefined && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Latency: {health.services.mongodb.latencyMs}ms
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {mongoHealthy ? (
                <>
                  <CheckCircle2Icon className="w-5 h-5 text-teal-600" />
                  <span className="text-xs font-semibold text-teal-700">Online</span>
                </>
              ) : (
                <>
                  <XCircleIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">
                    {health?.services?.mongodb?.status ?? 'Offline'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Neo4j */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-800">Neo4j</span>
                <span className="text-xs text-gray-500">(Graph Database)</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Powers entity relationship graph, multi-hop lookups, and clustering.
              </p>
              {health?.services?.neo4j?.latencyMs !== undefined && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Latency: {health.services.neo4j.latencyMs}ms
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {neo4jHealthy ? (
                <>
                  <CheckCircle2Icon className="w-5 h-5 text-teal-600" />
                  <span className="text-xs font-semibold text-teal-700">Online</span>
                </>
              ) : (
                <>
                  <XCircleIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">
                    {health?.services?.neo4j?.status ?? 'Offline'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {health && (
          <p className="text-xs text-gray-400 mt-4 text-right">
            Last probe: {formatDate(health.timestamp)}
          </p>
        )}
      </div>
    </div>
  )
}
