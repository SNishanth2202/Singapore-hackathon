import { type LucideIcon } from 'lucide-react'
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: { value: number; label?: string }
  isSample?: boolean
  color?: 'navy' | 'teal' | 'purple' | 'amber'
}

const colorMap = {
  navy: {
    bg: 'bg-navy-600',
    iconBg: 'bg-navy-50',
    iconColor: 'text-navy-600',
    accent: 'from-navy-500 to-navy-700',
  },
  teal: {
    bg: 'bg-teal-600',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    accent: 'from-teal-500 to-teal-700',
  },
  purple: {
    bg: 'bg-purple-600',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    accent: 'from-purple-500 to-purple-700',
  },
  amber: {
    bg: 'bg-amber-500',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    accent: 'from-amber-400 to-amber-600',
  },
}

export function MetricCard({ label, value, icon: Icon, trend, isSample, color = 'navy' }: MetricCardProps) {
  const isPositive = trend && trend.value >= 0
  const colors = colorMap[color]

  return (
    <div className="card card-hover p-5 relative overflow-hidden">
      {/* Subtle top accent */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${colors.accent} opacity-60`} />

      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest truncate">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2 tracking-tight">{value}</p>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${isPositive ? 'text-teal-600' : 'text-red-500'}`}>
              <div className={`flex items-center justify-center w-4 h-4 rounded-full ${isPositive ? 'bg-teal-50' : 'bg-red-50'}`}>
                {isPositive ? (
                  <TrendingUpIcon className="w-2.5 h-2.5" />
                ) : (
                  <TrendingDownIcon className="w-2.5 h-2.5" />
                )}
              </div>
              <span>
                {isPositive ? '+' : ''}{trend.value}% {trend.label ?? 'vs last week'}
              </span>
            </div>
          )}
          {isSample && (
            <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
              Account records
            </span>
          )}
        </div>

        <div className={`flex-shrink-0 ml-4 w-11 h-11 rounded-xl ${colors.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.iconColor}`} />
        </div>
      </div>
    </div>
  )
}
