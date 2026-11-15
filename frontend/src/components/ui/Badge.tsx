interface BadgeProps {
  label: string
  variant?: 'default' | 'priority' | 'status' | 'industry' | 'sample'
  value?: string
}

const priorityColors: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-blue-50 text-blue-700 border-blue-200',
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-teal-50 text-teal-700 border-teal-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  CLOSED: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function Badge({ label, variant = 'default', value }: BadgeProps) {
  const key = value ?? label.toUpperCase()

  let className = `inline-flex items-center py-0.5 rounded font-medium border ${variant === 'sample' ? 'px-1.5 text-[10px]' : 'px-2 text-xs'} `

  if (variant === 'priority') {
    className += priorityColors[key] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  } else if (variant === 'status') {
    className += statusColors[key] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  } else if (variant === 'sample') {
    className += 'bg-gray-50 text-gray-500 border-gray-200'
  } else if (variant === 'industry') {
    className += 'bg-navy-50 text-navy-600 border-navy-100'
  } else {
    className += 'bg-gray-100 text-gray-700 border-gray-200'
  }

  return <span className={className}>{variant === 'sample' ? 'Demo' : label}</span>
}

export function SampleBadge() {
  return <Badge label="Demo" variant="sample" />
}
