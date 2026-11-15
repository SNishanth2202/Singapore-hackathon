import { type LucideIcon } from 'lucide-react'
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: { value: number; label?: string }
  isSample?: boolean
}

export function MetricCard({ label, value, icon: Icon, trend, isSample }: MetricCardProps) {
  const isPositive = trend && trend.value >= 0

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 font-medium truncate">{label}</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{value}</p>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${isPositive ? 'text-teal-600' : 'text-red-500'}`}>
              {isPositive ? (
                <TrendingUpIcon className="w-3.5 h-3.5" />
              ) : (
                <TrendingDownIcon className="w-3.5 h-3.5" />
              )}
              <span>
                {isPositive ? '+' : ''}{trend.value}% {trend.label ?? 'vs last week'}
              </span>
            </div>
          )}
          {isSample && (
            <span className="inline-block mt-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
              Demo
            </span>
          )}
        </div>
        <div className="flex-shrink-0 ml-4 w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-navy-600" />
        </div>
      </div>
    </div>
  )
}
