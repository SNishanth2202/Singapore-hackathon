import { SlidersHorizontalIcon, XIcon } from 'lucide-react'

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
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-widest">
        <SlidersHorizontalIcon className="w-3.5 h-3.5" />
        <span>Filter</span>
      </div>

      {filters.map((filter) => (
        <div key={filter.id} className="relative">
          <select
            value={filter.value}
            onChange={(e) => onChange(filter.id, e.target.value)}
            className={`text-sm border rounded-lg pl-3 pr-8 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all appearance-none cursor-pointer ${
              filter.value
                ? 'border-teal-300 text-teal-700 bg-teal-50 font-medium'
                : 'border-gray-200 text-gray-600'
            }`}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      ))}

      {hasActiveFilters && onReset && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          <XIcon className="w-3 h-3" />
          Clear
        </button>
      )}

      {hasActiveFilters && (
        <span className="text-xs text-teal-600 font-medium bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
          {filters.filter((f) => f.value).length} active
        </span>
      )}
    </div>
  )
}
