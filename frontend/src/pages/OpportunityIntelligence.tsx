import { useState } from 'react'
import { useOpportunities } from '../hooks/useOpportunities'
import { DataTable, Column } from '../components/ui/DataTable'
import { FilterBar, FilterConfig } from '../components/ui/FilterBar'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { Badge } from '../components/ui/Badge'
import { formatDate, formatConfidence } from '../utils/formatters'
import { Opportunity } from '../services/opportunities.service'

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
        <span className="font-medium text-navy-600">{row.companyName ?? row.companyId}</span>
      ),
    },
    {
      key: 'potentialService',
      label: 'Service Type',
      sortable: true,
      render: (row) => (
        <span className="text-gray-700">
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
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full"
              style={{ width: `${Math.round(row.confidenceScore * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600">{formatConfidence(row.confidenceScore)}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (row) => <span className="text-gray-500 text-xs">{formatDate(row.createdAt)}</span>,
    },
  ]

  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />

  return (
    <div>
      <PageHeader
        title="Opportunity Intelligence"
        subtitle="Track and prioritise potential Singtel service opportunities across the portfolio"
        badge={isMockData ? <Badge label="Demo" variant="sample" /> : undefined}
      />

      <div className="mb-5">
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
