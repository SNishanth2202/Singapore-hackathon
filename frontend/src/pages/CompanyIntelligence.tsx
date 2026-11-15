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
        <span className="font-medium text-navy-600 hover:text-teal-600 transition-colors cursor-pointer">
          {row.companyName}
        </span>
      ),
    },
    {
      key: 'industry',
      label: 'Industry',
      sortable: true,
      render: (row) =>
        row.industry ? <Badge label={row.industry} variant="industry" /> : <span className="text-gray-400">—</span>,
    },
    {
      key: 'country',
      label: 'Country',
      sortable: true,
      render: (row) => <span className="text-gray-600">{row.country ?? '—'}</span>,
    },
    {
      key: 'companyStage',
      label: 'Stage',
      sortable: true,
      render: (row) => <span className="text-gray-600">{row.companyStage ?? '—'}</span>,
    },
    {
      key: 'foundedDate',
      label: 'Founded',
      sortable: true,
      render: (row) => <span className="text-gray-500">{formatDate(row.foundedDate)}</span>,
    },
  ]

  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />

  return (
    <div>
      <PageHeader
        title="Company Intelligence"
        subtitle="Browse and filter companies tracked across Southeast Asia"
      />

      <CompanyResearch />

      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-700">Tracked company workspace</h2>
        {isMockData && <Badge label="Demo" variant="sample" />}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 mb-5">
        <SearchBar
          value={search}
          onChange={handleSearch}
          placeholder="Search companies by name or description..."
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
  )
}
