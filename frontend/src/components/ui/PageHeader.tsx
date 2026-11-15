interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  badge?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions, badge }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-gray-500 leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-4">{actions}</div>}
    </div>
  )
}
