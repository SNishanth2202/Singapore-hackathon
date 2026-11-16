import { Link } from 'react-router-dom'
import {
  ArrowRightIcon, Building2Icon, BarChart3Icon, ChevronRightIcon,
  CircleDollarSignIcon, ClipboardListIcon, FileTextIcon, GaugeIcon, HeadphonesIcon,
  MessagesSquareIcon, SlidersHorizontalIcon, TrendingDownIcon, TrendingUpIcon,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CrmPortfolio, crmMoney, crmMonth } from '../../services/crm-portfolio.service'
import { chartTheme } from '../charts/chartTheme'

export function PortfolioOverview({ data, compact = false }: { data: CrmPortfolio; compact?: boolean }) {
  const m = data.metrics
  const billingTrend = [...data.billingTrend].sort((left, right) => left.period.localeCompare(right.period))
  const cards = [
    { title: 'Customer accounts', value: m.accounts.toLocaleString(), detail: `${m.billedSubscriptions} billed subscriptions`, icon: Building2Icon, href: '/crm' },
    { title: 'Monthly billing', value: crmMoney(m.billedSgd, true), detail: `${crmMonth(data.reportingMonth)} · includes tax`, icon: CircleDollarSignIcon, href: '/crm?view=billing' },
    { title: 'Capacity opportunities', value: m.capacityAccounts.toLocaleString(), detail: `${m.capacitySubscriptions} subscriptions above allowance`, icon: GaugeIcon, href: '/crm?view=capacity' },
    { title: 'Plan optimisation', value: m.optimisationSubscriptions.toLocaleString(), detail: 'Subscriptions below 30% utilisation', icon: SlidersHorizontalIcon, href: '/crm?view=optimisation' },
  ]
  const priorities = [
    { title: 'Service reviews', value: m.serviceReviewAccounts, detail: 'Service performance and SLA context', href: '/crm?view=service', icon: HeadphonesIcon },
    { title: 'Customer concerns', value: m.latestNegativeAccounts, detail: 'Latest conversation has negative sentiment', href: '/crm?view=engagement', icon: MessagesSquareIcon },
    { title: 'Contract reviews', value: m.contractReviews, detail: 'Extensions and replacement agreements', href: '/crm?view=contracts', icon: FileTextIcon },
    { title: 'Open opportunities', value: m.openOpportunities, detail: `${crmMoney(m.openAnnualSgd, true)} estimated annual value`, href: '/crm?view=pipeline', icon: BarChart3Icon },
  ]
  const TrendIcon = (m.billingChangePct ?? 0) < 0 ? TrendingDownIcon : TrendingUpIcon

  return (
    <section aria-label="Customer portfolio overview" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-singtelGray-900">Existing customer intelligence</h2>
        <Link to="/crm" className="inline-flex items-center gap-1.5 text-xs font-semibold text-singtelRed-600 hover:underline">
          Explore customers <ArrowRightIcon size={14} />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => (
          <Link key={card.title} to={card.href} className="card group flex min-w-0 flex-col p-4 transition hover:border-singtelRed-200 hover:shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-singtelGray-600">{card.title}</span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-singtelRed-50 text-singtelRed-600"><card.icon size={16} strokeWidth={1.75} /></span>
            </div>
            <p className="mt-2 text-[1.8rem] font-semibold leading-tight tracking-tight text-singtelGray-900 tabular-nums">{card.value}</p>
            <p className="mt-2 text-xs leading-relaxed text-singtelGray-500">{card.detail}</p>
          </Link>
        ))}
      </div>
      {!compact && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <section className="card flex min-w-0 flex-col overflow-hidden" aria-label="Customer billing trend">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-singtelGray-900">Billing trend</h3>
                <p className="mt-1 text-xs text-singtelGray-500">Monthly invoice totals · {data.coverage.months} months</p>
              </div>
              {m.billingChangePct != null && (
                <div className="flex items-center gap-1.5 rounded-md bg-singtelGray-50 px-2 py-1 text-xs text-singtelGray-600">
                  <TrendIcon size={13} aria-hidden="true" />
                  <span className="font-semibold tabular-nums">{m.billingChangePct > 0 ? '+' : ''}{m.billingChangePct}%</span>
                  <span>YoY</span>
                </div>
              )}
            </div>
            <div className="mx-5 my-4 flex items-center gap-2 text-xs text-singtelGray-600">
              <span className="h-0.5 w-4 rounded-full bg-singtelRed" />Billed amount (SGD)
            </div>
            {billingTrend.length ? (
              <div className="mb-2 h-52 w-full pr-3 lg:h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={billingTrend} margin={{ top: 8, left: 0, right: 16, bottom: 4 }}>
                    <defs><linearGradient id="crm-billing-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.12} /><stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={chartTheme.grid} />
                    <XAxis dataKey="period" tickFormatter={crmMonth} tick={chartTheme.axis} axisLine={false} tickLine={false} tickMargin={8} minTickGap={30} />
                    <YAxis tickFormatter={v => Intl.NumberFormat('en-SG', { notation: 'compact' }).format(Number(v))} tick={chartTheme.axis} axisLine={false} tickLine={false} width={58} tickMargin={8} />
                    <Tooltip contentStyle={chartTheme.tooltip} labelFormatter={v => crmMonth(String(v))} formatter={v => [crmMoney(Number(v)), 'Billed']} />
                    <Area isAnimationActive={false} type="monotone" dataKey="billedSgd" stroke={chartTheme.primary} strokeWidth={2.5} fill="url(#crm-billing-fill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="p-5 text-sm text-singtelGray-500">No billing records in this period.</p>}
          </section>
          <section className="card min-w-0" aria-label="Account review priorities">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold tracking-tight text-singtelGray-900">Account review priorities</h3>
              <ClipboardListIcon size={17} className="text-singtelGray-500" />
            </div>
            <div className="divide-y divide-gray-100">
              {priorities.map(priority => (
                <Link key={priority.title} to={priority.href} className="group flex items-center gap-3 px-4 py-3 hover:bg-singtelGray-50 sm:px-5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-singtelGray-50 text-singtelGray-600"><priority.icon size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-singtelGray-800">{priority.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-singtelGray-500">{priority.detail}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-singtelGray-800">{priority.value}</span>
                  <ChevronRightIcon size={13} className="shrink-0 text-singtelGray-400 group-hover:text-singtelRed" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
