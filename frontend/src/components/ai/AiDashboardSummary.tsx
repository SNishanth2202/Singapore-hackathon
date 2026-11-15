import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotIcon } from 'lucide-react'
import { aiManagementService, Analytics, apiError } from '../../services/aiManagement.service'

/** AI Management metrics on the main dashboard. Every number is a live database aggregate. */
export function AiDashboardSummary() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { aiManagementService.analytics().then(setData).catch(e => setError(apiError(e, 'AI Management metrics are unavailable.'))) }, [])
  if (error) return <p className="text-xs text-gray-400">{error}</p>
  if (!data) return null
  const rows: [string, number | string, string][] = [
    ['Daily lead target', data.leadRanking.dailyTarget, data.leadRanking.scheduledRankingEnabled ? 'Scheduled ranking on' : 'Scheduled ranking off'],
    ['Companies ranked', data.leadRanking.companiesRanked, `${data.leadRanking.companiesQueued} queued across ${data.leadRanking.runs} run(s)`],
    ['Selected for AI', data.companies.selectedForAiManagement, `${data.companies.currentlyManaged} currently managed`],
    ['Initial outreach', data.emails.initialOutreach, `${data.emails.uniqueCompaniesContacted} unique companies`],
    ['Follow-ups sent', data.emails.followups, `${data.emails.aiReplies} AI replies to questions`],
    ['Incoming replies', data.replies.incoming, `${data.replies.uniqueCompaniesReplied} companies`],
    ['Positive intent', data.replies.positiveIntent, `${data.replies.positiveSentiment} positive tone (not intent)`],
    ['Meeting requests', data.replies.meetingRequests, `${data.replies.meetingsScheduled} actually scheduled`],
    ['Proposal requests', data.replies.proposalRequests, `${data.replies.pricingRequests} pricing requests`],
    ['New requirements', data.outcomes.opportunitiesWithNewRequirements, `${data.outcomes.closedDeals} closed deals`],
    ['Human interventions', data.notifications.humanInterventions, `${data.notifications.openHumanInterventions} still open`],
    ['Completed', data.outcomes.conversationsCompleted, `${data.companies.noResponse} no response`],
    ['Unsubscribes', data.companies.unsubscribed, `${data.companies.notInterested} not interested`],
    ['Email failures', data.emails.failures, `${data.emails.blocked} blocked by policy`],
    ['Agent errors', data.agentErrors, data.globalOutboundEnabled ? 'Outbound enabled' : 'Emergency stop active'],
  ]
  return <section aria-labelledby="ai-summary-title">
    <div className="mb-3 flex items-baseline justify-between"><h2 id="ai-summary-title" className="flex items-center gap-2 font-semibold text-gray-800"><BotIcon className="h-4 w-4 text-teal-600" />AI Management</h2>
      <Link to="/ai-management" className="text-xs text-teal-700 underline">Open AI Management</Link></div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{rows.map(([name, value, detail]) => <article key={name} className="card p-3">
      <p className="text-[11px] font-medium text-gray-500">{name}</p><p className="mt-1 text-xl font-semibold text-navy-600">{value}</p><p className="mt-0.5 text-[10px] text-gray-400">{detail}</p></article>)}</div>
    <p className="mt-2 text-[11px] text-gray-400">Emails are counted when the provider accepts them. {data.emails.deliveryNote}{data.emails.synthetic ? ` ${data.emails.synthetic} test-mode message record(s) are retained for workflow review and were not sent.` : ''}</p>
  </section>
}
