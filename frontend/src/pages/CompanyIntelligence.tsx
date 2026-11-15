import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompanies } from '../hooks/useCompanies'
import { DataTable } from '../components/ui/DataTable'
import { SearchBar } from '../components/ui/SearchBar'
import { FilterBar, FilterConfig } from '../components/ui/FilterBar'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { Badge } from '../components/ui/Badge'
import { formatDate } from '../utils/formatters'
import { INDUSTRIES, COUNTRIES, COMPANY_STAGES } from '../utils/constants'
import { Company } from '../services/companies.service'
import { Column } from '../components/ui/DataTable'
import CompanyResearch from '../components/CompanyResearch'
import { GlobeIcon, BuildingIcon } from 'lucide-react'

const PAGE_SIZE = 25

export default function CompanyIntelligence() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [stage, setStage] = useState('')
  const [page, setPage] = useState(1)

  const { companies, total, loading, error, isMockData, refetch } = useCompanies({
    search,
    country,
    industry,
    stage,
    page,
    limit: PAGE_SIZE,
  })

  function handleSearch(val: string) {
    setSearch(val)
    setPage(1)
    void refetch({ search: val, country, industry, stage, page: 1, limit: PAGE_SIZE })
  }

  function handleFilterChange(id: string, value: string) {
    const next = { search, country, industry, stage, [id]: value }
    if (id === 'country') setCountry(value)
    if (id === 'industry') setIndustry(value)
    if (id === 'stage') setStage(value)
    setPage(1)
    void refetch({ ...next, page: 1, limit: PAGE_SIZE })
  }

  function handleReset() {
    setSearch('')
    setCountry('')
    setIndustry('')
    setStage('')
    setPage(1)
    void refetch({ page: 1, limit: PAGE_SIZE })
  }

  const filters: FilterConfig[] = [
    {
      id: 'country',
      label: 'Country',
      value: country,
      options: COUNTRIES.map((c) => ({ label: c, value: c })),
    },
    {
      id: 'industry',
      label: 'Industry',
      value: industry,
      options: INDUSTRIES.map((i) => ({ label: i, value: i })),
    },
    {
      id: 'stage',
      label: 'Stage',
      value: stage,
      options: COMPANY_STAGES.map((s) => ({ label: s, value: s })),
    },
  ]

  const columns: Column<Company>[] = [
    {
      key: 'companyName',
      label: 'Company',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-navy-50 border border-navy-100 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-navy-600">
              {row.companyName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-semibold text-gray-800 hover:text-teal-600 transition-colors">
            {row.companyName}
          </span>
        </div>
      ),
    },
    {
      key: 'industry',
      label: 'Industry',
      sortable: true,
      render: (row) =>
        row.industry ? <Badge label={row.industry} variant="industry" /> : <span className="text-gray-300">—</span>,
    },
    {
      key: 'country',
      label: 'Country',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <GlobeIcon className="w-3 h-3 text-gray-400" />
          {row.country ?? '—'}
        </div>
      ),
    },
    {
      key: 'companyStage',
      label: 'Stage',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
          {row.companyStage ?? '—'}
        </span>
      ),
    },
    {
      key: 'foundedDate',
      label: 'Founded',
      sortable: true,
      render: (row) => <span className="text-xs text-gray-400">{formatDate(row.foundedDate)}</span>,
    },
  ]

  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Company Intelligence"
        subtitle="Browse, filter and research companies tracked across Southeast Asia"
        badge={isMockData ? <Badge label="Demo" variant="sample" /> : undefined}
      />

      {/* AI Research widget */}
      <CompanyResearch />

      {/* Tracked workspace */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BuildingIcon className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Tracked company workspace</h2>
            {total > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                {total} companies
              </span>
            )}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <SearchBar
            value={search}
            onChange={handleSearch}
            placeholder="Search by company name or description…"
          />
          <FilterBar filters={filters} onChange={handleFilterChange} onReset={handleReset} />
        </div>

        <DataTable<Company>
          columns={columns}
          data={companies}
          loading={loading}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => {
            setPage(p)
            void refetch({ search, country, industry, stage, page: p, limit: PAGE_SIZE })
          }}
          onRowClick={(row) => navigate(`/companies/${row._id}`)}
          keyExtractor={(row) => row._id}
          emptyMessage="No companies match your filters."
        />
      </div>
    </div>
  )
}
