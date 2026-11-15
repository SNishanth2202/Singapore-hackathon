import { useState } from 'react'
import { useOpportunities } from '../hooks/useOpportunities'
import { DataTable, Column } from '../components/ui/DataTable'
import { FilterBar, FilterConfig } from '../components/ui/FilterBar'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { Badge } from '../components/ui/Badge'
import { formatDate, formatConfidence } from '../utils/formatters'
import { Opportunity } from '../services/opportunities.service'
import { TargetIcon } from 'lucide-react'

const PAGE_SIZE = 25

export default function OpportunityIntelligence() {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [page, setPage] = useState(1)

  const { opportunities, total, loading, error, isMockData, refetch } = useOpportunities({
    status,
    priority,
    page,
    limit: PAGE_SIZE,
  })

  function handleFilterChange(id: string, value: string) {
    const next = { status, priority, [id]: value }
    if (id === 'status') setStatus(value)
    if (id === 'priority') setPriority(value)
    setPage(1)
    void refetch({ ...next, page: 1, limit: PAGE_SIZE })
  }

  function handleReset() {
    setStatus('')
    setPriority('')
    setPage(1)
    void refetch({ page: 1, limit: PAGE_SIZE })
  }

  const filters: FilterConfig[] = [
    {
      id: 'status',
      label: 'Status',
      value: status,
      options: [
        { label: 'Open', value: 'OPEN' },
        { label: 'In Progress', value: 'IN_PROGRESS' },
        { label: 'Closed', value: 'CLOSED' },
      ],
    },
    {
      id: 'priority',
      label: 'Priority',
      value: priority,
      options: [
        { label: 'High', value: 'HIGH' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'Low', value: 'LOW' },
      ],
    },
  ]

  const columns: Column<Opportunity>[] = [
    {
      key: 'companyName',
      label: 'Company',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-navy-50 border border-navy-100 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-navy-600">
              {(row.companyName ?? 'C').charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-semibold text-gray-800">{row.companyName ?? row.companyId}</span>
        </div>
      ),
    },
    {
      key: 'potentialService',
      label: 'Service',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-gray-700">
          {row.potentialService ?? row.opportunityType ?? '—'}
        </span>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      render: (row) => <Badge label={row.priority} variant="priority" value={row.priority} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge label={row.status.replace('_', ' ')} variant="status" value={row.status} />
      ),
    },
    {
      key: 'confidenceScore',
      label: 'Confidence',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(row.confidenceScore * 100)}%`,
                background: row.confidenceScore >= 0.7 ? '#0D9488' : row.confidenceScore >= 0.4 ? '#F59E0B' : '#94A3B8',
              }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-600">{formatConfidence(row.confidenceScore)}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (row) => <span className="text-xs text-gray-400">{formatDate(row.createdAt)}</span>,
    },
  ]

  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Opportunity Intelligence"
        subtitle="Track and prioritise potential Singtel service opportunities"
        badge={isMockData ? <Badge label="Illustrative" variant="sample" /> : undefined}
      />

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: total, color: 'text-gray-800' },
          { label: 'High Priority', value: opportunities.filter(o => o.priority === 'HIGH').length, color: 'text-red-600' },
          { label: 'Open', value: opportunities.filter(o => o.status === 'OPEN').length, color: 'text-teal-600' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
              <TargetIcon className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <FilterBar filters={filters} onChange={handleFilterChange} onReset={handleReset} />
      </div>

      <DataTable<Opportunity>
        columns={columns}
        data={opportunities}
        loading={loading}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => {
          setPage(p)
          void refetch({ status, priority, page: p, limit: PAGE_SIZE })
        }}
        keyExtractor={(row) => row._id}
        emptyMessage="No opportunities match your filters."
      />
    </div>
  )
}
