import { FilterIcon } from 'lucide-react'

export interface FilterOption {
  label: string
  value: string
}

export interface FilterConfig {
  id: string
  label: string
  options: FilterOption[]
  value: string
}

interface FilterBarProps {
  filters: FilterConfig[]
  onChange: (id: string, value: string) => void
  onReset?: () => void
}

export function FilterBar({ filters, onChange, onReset }: FilterBarProps) {
  const hasActiveFilters = filters.some((f) => f.value !== '')

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <FilterIcon className="w-4 h-4" />
        <span className="font-medium">Filters:</span>
      </div>
      {filters.map((filter) => (
        <div key={filter.id} className="flex items-center gap-1">
          <select
            value={filter.value}
            onChange={(e) => onChange(filter.id, e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {hasActiveFilters && onReset && (
        <button
          onClick={onReset}
          className="text-xs text-teal-600 hover:text-teal-800 font-medium underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
