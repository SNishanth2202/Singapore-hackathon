import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApiQuery'
import { DataTable } from '../components/ui/DataTable'
import { SearchBar } from '../components/ui/SearchBar'
import { FilterBar, FilterConfig } from '../components/ui/FilterBar'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { Badge } from '../components/ui/Badge'
import { formatDate } from '../utils/formatters'
import { INDUSTRIES, COUNTRIES, COMPANY_STAGES, DEFAULT_PAGE_SIZE } from '../utils/constants'
import { Company, companiesService } from '../services/companies.service'
import { Column } from '../components/ui/DataTable'
import CompanyResearch from '../components/CompanyResearch'
import { GlobeIcon, BuildingIcon } from 'lucide-react'

export default function CompanyIntelligence() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [stage, setStage] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback((signal: AbortSignal) => companiesService.getCompanies(
    { search, country, industry, stage, page, limit: DEFAULT_PAGE_SIZE }, signal,
  ), [search, country, industry, stage, page])
  const { data: result, loading, error, refetch } = useApiQuery(load)
  const companies = result?.data ?? []
  const total = result?.total ?? 0

  function handleSearch(val: string) {
    setSearch(val)
    setPage(1)
  }

  function handleFilterChange(id: string, value: string) {
    if (id === 'country') setCountry(value)
    if (id === 'industry') setIndustry(value)
    if (id === 'stage') setStage(value)
    setPage(1)
  }

  function handleReset() {
    setSearch('')
    setCountry('')
    setIndustry('')
    setStage('')
    setPage(1)
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Company Intelligence"
        subtitle="Browse, filter and research companies tracked across Southeast Asia"
        badge={result?.isMockData ? <Badge label="Account records" variant="sample" /> : undefined}
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

        {error ? <ErrorState message={error} onRetry={refetch} /> : <DataTable<Company>
          columns={columns}
          data={companies}
          loading={loading}
          total={total}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/companies/${encodeURIComponent(row._id)}`)}
          keyExtractor={(row) => row._id}
          emptyMessage="No companies match your filters."
        />}
      </div>
    </div>
  )
}
