import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BotIcon, ListOrdered, MessageSquare, ShieldCheck } from 'lucide-react'
import { aiManagementService, Analytics, apiError } from '../../services/aiManagement.service'

/** AI Management metrics on the main dashboard. Every number is a live database aggregate. */
export function AiDashboardSummary() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { aiManagementService.analytics().then(setData).catch(e => setError(apiError(e, 'AI Management metrics are unavailable.'))) }, [])
  if (error) return <p className="text-xs text-singtelGray-500">{error}</p>
  if (!data) return null
  const groups: { title: string; icon: typeof ListOrdered; rows: [string, number, string][] }[] = [
    { title: 'Ranking and outreach', icon: ListOrdered, rows: [
      ['Daily lead target', data.leadRanking.dailyTarget, data.leadRanking.scheduledRankingEnabled ? 'Scheduled ranking on' : 'Scheduled ranking off'],
      ['Companies ranked', data.leadRanking.companiesRanked, `${data.leadRanking.companiesQueued} queued across ${data.leadRanking.runs} run(s)`],
      ['Selected for AI', data.companies.selectedForAiManagement, `${data.companies.currentlyManaged} currently managed`],
      ['Initial outreach', data.emails.initialOutreach, `${data.emails.uniqueCompaniesContacted} unique companies`],
      ['Follow-ups sent', data.emails.followups, `${data.emails.aiReplies} AI replies to questions`],
    ] },
    { title: 'Customer responses', icon: MessageSquare, rows: [
      ['Incoming replies', data.replies.incoming, `${data.replies.uniqueCompaniesReplied} companies`],
      ['Positive intent', data.replies.positiveIntent, `${data.replies.positiveSentiment} replies with positive tone`],
      ['Meeting requests', data.replies.meetingRequests, `${data.replies.meetingsScheduled} meetings scheduled`],
      ['Proposal requests', data.replies.proposalRequests, `${data.replies.pricingRequests} pricing requests`],
      ['New requirements', data.outcomes.opportunitiesWithNewRequirements, `${data.outcomes.closedDeals} closed deals`],
    ] },
    { title: 'Automation outcomes', icon: ShieldCheck, rows: [
      ['Human interventions', data.notifications.humanInterventions, `${data.notifications.openHumanInterventions} still open`],
      ['Completed', data.outcomes.conversationsCompleted, `${data.companies.noResponse} no response`],
      ['Unsubscribes', data.companies.unsubscribed, `${data.companies.notInterested} not interested`],
      ['Email failures', data.emails.failures, `${data.emails.blocked} blocked by policy`],
      ['Agent errors', data.agentErrors, data.globalOutboundEnabled ? 'Outbound enabled' : 'Emergency stop active'],
    ] },
  ]
  return <section aria-labelledby="ai-summary-title" className="card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><h2 id="ai-summary-title" className="flex items-center gap-2 font-semibold text-singtelGray-800"><BotIcon size={18} className="text-singtelRed" />AI Management</h2>
      <Link to="/ai-management" className="inline-flex items-center gap-1.5 text-xs font-semibold text-singtelRed-700 hover:underline">Open AI Management<ArrowRight size={13} /></Link></div>
    <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
      {groups.map(({ title, icon: Icon, rows }) => <div key={title} className="px-5 py-4">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-singtelGray-700"><Icon size={14} aria-hidden />{title}</h3>
        <dl className="divide-y">{rows.map(([name, value, detail]) => <div key={name} className="flex items-center justify-between gap-2 py-2.5">
          <dt className="text-xs font-medium text-singtelGray-800">{name}<span className="mt-0.5 block text-[11px] font-normal text-singtelGray-500">{detail}</span></dt>
          <dd className="text-lg font-semibold tabular-nums text-singtelGray-800">{value?.toLocaleString() ?? '—'}</dd>
        </div>)}</dl>
      </div>)}
    </div>
    <p className="border-t bg-singtelGray-50 px-5 py-3 text-[11px] leading-relaxed text-singtelGray-500">Emails are counted when the provider accepts them. {data.emails.deliveryNote}{data.emails.synthetic ? ` ${data.emails.synthetic} test-mode message record(s) are retained for workflow review and were not sent.` : ''}</p>
  </section>
}
