interface BadgeProps {
  label: string
  variant?: 'default' | 'priority' | 'status' | 'industry' | 'sample' | 'success' | 'warning'
  value?: string
}

const priorityColors: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700 border-red-200 ring-red-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-100',
  LOW: 'bg-blue-50 text-blue-600 border-blue-200 ring-blue-100',
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-teal-50 text-teal-700 border-teal-200',
  IN_PROGRESS: 'bg-purple-50 text-purple-700 border-purple-200',
  CLOSED: 'bg-gray-100 text-gray-500 border-gray-200',
}

export function Badge({ label, variant = 'default', value }: BadgeProps) {
  const key = value ?? label.toUpperCase().replace(/\s+/g, '_')

  let className = `inline-flex items-center font-semibold border leading-none ${
    variant === 'sample' ? 'px-2 py-0.5 text-[10px] rounded-full' : 'px-2.5 py-0.5 text-[11px] rounded-md'
  } `

  if (variant === 'priority') {
    className += priorityColors[key] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  } else if (variant === 'status') {
    className += statusColors[key] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  } else if (variant === 'sample') {
    className += 'bg-amber-50 text-amber-600 border-amber-200'
  } else if (variant === 'industry') {
    className += 'bg-navy-50 text-navy-600 border-navy-100'
  } else if (variant === 'success') {
    className += 'bg-teal-50 text-teal-700 border-teal-200'
  } else if (variant === 'warning') {
    className += 'bg-amber-50 text-amber-700 border-amber-200'
  } else {
    className += 'bg-gray-100 text-gray-600 border-gray-200'
  }

  return <span className={className}>{label}</span>
}

export function SampleBadge() {
  return <Badge label="Illustrative" variant="sample" />
}
