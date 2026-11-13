import { BuildingIcon, TrendingUpIcon, TargetIcon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react'
import { useAnalytics } from '../hooks/useAnalytics'
import { useCompanies } from '../hooks/useCompanies'
import { MetricCard } from '../components/ui/MetricCard'
import { BarChart } from '../components/charts/BarChart'
import { PieChart } from '../components/charts/PieChart'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { ErrorState } from '../components/ui/ErrorState'
import { PageHeader } from '../components/ui/PageHeader'
import { formatDate, formatNumber } from '../utils/formatters'

function MockDataBanner() {
  return (
    <div className="mb-6 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
      <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
      <span>
        <strong>Sample Data Mode</strong> — Backend unavailable. Showing illustrative placeholder data only.
      </span>
    </div>
  )
}

export default function Dashboard() {
  const { overview, loading: analyticsLoading, error: analyticsError, isMockData, refetch } = useAnalytics()
  const { companies: recentCompanies, loading: companiesLoading } = useCompanies({ limit: 5 })

  if (analyticsLoading) return <LoadingSpinner label="Loading dashboard..." />
  if (analyticsError) return <ErrorState message={analyticsError} onRetry={refetch} />

  const industryData = (overview?.companiesByIndustry ?? []).map((d) => ({
    name: d.industry,
    value: d.count,
  }))
  const countryData = (overview?.companiesByCountry ?? []).map((d) => ({
    name: d.country,
    value: d.count,
  }))

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Real-time overview of enterprise intelligence across Southeast Asia"
        actions={
          <button
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
            Refresh
          </button>
        }
      />

      {isMockData && <MockDataBanner />}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <MetricCard
          label="Total Companies"
          value={formatNumber(overview?.totalCompanies ?? 0)}
          icon={BuildingIcon}
          trend={{ value: 4.8, label: 'vs last month' }}
          isSample={isMockData}
        />
        <MetricCard
          label="New This Week"
          value={formatNumber(overview?.newThisWeek ?? 0)}
          icon={TrendingUpIcon}
          trend={{ value: 12, label: 'vs last week' }}
          isSample={isMockData}
        />
        <MetricCard
          label="Open Opportunities"
          value={formatNumber(overview?.openOpportunities ?? 0)}
          icon={TargetIcon}
          isSample={isMockData}
        />
        <MetricCard
          label="High Priority"
          value={formatNumber(overview?.highPriorityOpportunities ?? 0)}
          icon={AlertCircleIcon}
          isSample={isMockData}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <BarChart
          data={industryData}
          title="Companies by Industry"
          isSample={isMockData}
        />
        <PieChart
          data={countryData}
          title="Companies by Country"
          isSample={isMockData}
        />
      </div>

      {/* Recent Companies */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Recent Companies</h3>
          {isMockData && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-600 border border-amber-200">
              sample
            </span>
          )}
        </div>
        {companiesLoading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Industry</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Country</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
              </tr>
            </thead>
            <tbody>
              {recentCompanies.slice(0, 5).map((company) => (
                <tr key={company._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-navy-600">{company.companyName}</td>
                  <td className="px-5 py-3 text-gray-600">{company.industry ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{company.country ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{company.companyStage ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDate(company.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
