import { ReactNode, useState } from 'react'
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react'
import { LoadingSpinner } from './LoadingSpinner'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onRowClick?: (row: T) => void
  keyExtractor: (row: T) => string
  emptyMessage?: string
}

type SortDirection = 'asc' | 'desc' | null

export function DataTable<T>({
  columns,
  data,
  loading = false,
  total = 0,
  page = 1,
  pageSize = 25,
  onPageChange,
  onRowClick,
  keyExtractor,
  emptyMessage,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    const aVal = (a as Record<string, unknown>)[sortKey]
    const bVal = (b as Record<string, unknown>)[sortKey]
    const aStr = String(aVal ?? '')
    const bStr = String(bVal ?? '')
    const cmp = aStr.localeCompare(bStr)
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100" style={{ background: '#F8FAFC' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest ${col.width ?? ''} ${col.sortable ? 'cursor-pointer select-none hover:text-gray-600' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="text-gray-300">
                        {sortKey === col.key && sortDir === 'asc' ? (
                          <ChevronUpIcon className="w-3 h-3 text-teal-500" />
                        ) : sortKey === col.key && sortDir === 'desc' ? (
                          <ChevronDownIcon className="w-3 h-3 text-teal-500" />
                        ) : (
                          <ChevronsUpDownIcon className="w-3 h-3 opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <LoadingSpinner />
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState description={emptyMessage} />
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  className={`border-b border-gray-50 last:border-0 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-teal-50/40' : ''
                  } ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs text-gray-500">
            Showing <span className="font-semibold text-gray-700">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> of <span className="font-semibold text-gray-700">{total}</span> results
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 transition-colors"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                return (
                  <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                      p === page
                        ? 'bg-navy-600 text-white'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 transition-colors"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
