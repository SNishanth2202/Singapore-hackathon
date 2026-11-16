import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, Building2Icon, ChevronRightIcon } from 'lucide-react'
import { CrmPortfolio, crmPortfolioService } from '../../services/crm-portfolio.service'
import { PortfolioOverview } from './PortfolioOverview'

export function PortfolioDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<CrmPortfolio | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    crmPortfolioService.overview(controller.signal, refreshKey > 0 || revision > 0)
      .then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [revision, refreshKey])

  if (error) return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-4" role="alert">
      <p className="text-sm text-singtelGray-600">Customer intelligence could not be loaded.</p>
      <button className="btn-secondary" onClick={() => setRevision(v => v + 1)}>Retry customer records</button>
    </section>
  )
  if (!data) return null

  const accounts = data.accounts.filter(a => a.primaryAction).slice(0, 3)
  return (
    <div className="space-y-5">
      <PortfolioOverview data={data} />
      <section className="card overflow-hidden" aria-label="Priority customer actions">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold tracking-tight text-singtelGray-900">Next customer conversations</h3>
          <Link to="/crm" className="inline-flex items-center gap-1.5 text-xs font-semibold text-singtelRed-600 hover:underline">All accounts <ArrowRightIcon size={14} /></Link>
        </div>
        {accounts.length ? (
          <div className="grid divide-y divide-gray-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {accounts.map(account => (
              <Link key={account.id} to={'/crm/' + encodeURIComponent(account.id)} className="group min-w-0 p-5 transition hover:bg-singtelGray-50">
                <div className="flex items-center gap-2">
                  <Building2Icon size={15} className="shrink-0 text-singtelGray-500" />
                  <p className="flex-1 text-sm font-semibold text-singtelGray-900">{account.name}</p>
                  <ChevronRightIcon size={14} className="shrink-0 text-singtelGray-400 group-hover:text-singtelRed" />
                </div>
                <p className="mt-3 text-xs font-semibold text-singtelRed-600">{account.primaryAction?.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-singtelGray-500">{account.primaryAction?.reason}</p>
              </Link>
            ))}
          </div>
        ) : <p className="px-5 py-4 text-sm text-singtelGray-500">No accounts have a recommended action.</p>}
      </section>
    </div>
  )
}
