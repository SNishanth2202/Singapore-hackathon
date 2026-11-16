import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CrmPortfolio, crmPortfolioService } from '../../services/crm-portfolio.service'
import { PortfolioOverview } from './PortfolioOverview'

export function PortfolioDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<CrmPortfolio | null>(null), [error, setError] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    crmPortfolioService.overview(controller.signal, refreshKey > 0 || revision > 0).then(value => { if (!controller.signal.aborted) setData(value) }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [revision, refreshKey])
  if (error) return <section className="card p-5"><p className="text-sm text-gray-600">Customer intelligence could not be loaded.</p><button className="mt-2 text-sm text-teal-700 underline" onClick={() => setRevision(v => v + 1)}>Retry customer records</button></section>
  if (!data) return null
  return <div className="space-y-4"><PortfolioOverview data={data} /><section className="card p-5" aria-label="Priority customer actions"><div className="mb-4 flex justify-between gap-3"><h3 className="text-sm font-semibold text-gray-800">Next customer conversations</h3><Link to="/crm" className="text-xs text-teal-700">All accounts →</Link></div><div className="grid gap-3 lg:grid-cols-3">{data.accounts.filter(a => a.primaryAction).slice(0, 3).map(account => <Link key={account.id} to={'/crm/' + encodeURIComponent(account.id)} className="rounded-lg border border-gray-100 p-4 transition hover:border-teal-400"><p className="text-sm font-semibold text-navy-600">{account.name}</p><p className="mt-2 text-xs font-medium text-teal-700">{account.primaryAction?.title}</p><p className="mt-1 text-xs leading-relaxed text-gray-500">{account.primaryAction?.reason}</p></Link>)}</div></section></div>
}
