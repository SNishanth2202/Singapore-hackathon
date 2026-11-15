import { useEffect, useState } from 'react'
import { SparklesIcon, RefreshCwIcon, AlertCircleIcon, CheckCircleIcon } from 'lucide-react'
import axios from 'axios'
import api from '../services/api'

interface AnalysisResult {
  analysisId?: string; persistence?: { durable: boolean }
  model: string | null; generatedAt: string; dataMode: string; citationCheck: string; validationWarnings?: string[]
  analysisOrigin?: string
  businessContext?: { sellerName: string; knowledgeVersion: number; companyClassification: string }
  evidenceAssessment?: {
    sourceCount?: number; companyEventCount?: number; duplicateReportCount?: number; commentaryCount?: number
    statusReason: string; sourceLimitations: string[]; discoveryQuestions: string[]
    matchingAssessment?: { serviceCandidateCount: number; acceptedHypothesisCount: number; providerEventCount: number }
    discoveryPrompts?: { offeringId: string; offeringName: string; question: string; basis: string; evidenceIds: string[]; origin: 'catalogue_rule' }[]
    rejections: { offeringId: string; offeringName: string; item: string; reason: string }[]
    sourceAssessments?: { sourceId: string; relevance: string; reason: string }[]
  }
  analysis: {
    summary: string
    observedFacts: { text: string; evidenceIds: string[] }[]
    possibleNeeds: { offeringId: string; need: string; reason: string; evidenceIds: string[]; fitLevel?: string; basis?: string; validationQuestion?: string }[]
    recommendedCapability: { name: string; reason: string } | null
    nextAction: { role: string; question: string; whyNow: string }
    unknowns: string[]; readiness: string
  }
}

export default function CompanyAnalysis({ companyId, sources = [], autoRun = false }: { companyId: string; sources?: { id: string; title: string; url: string }[]; autoRun?: boolean }) {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState(false)
  useEffect(() => {
    let active = true
    setResult(null); setError(''); setReviewed(false); setLoading(true)
    api.get('/api/v1/ai/analyses/latest', { params: { companyId } }).then(response => {
      if (!active) return
      const saved = response.data.data?.result as AnalysisResult | undefined
      if (saved) { setResult(saved); setLoading(false) }
      else if (autoRun) void analyze()
      else setLoading(false)
    }).catch(() => { if (active) { setLoading(false); setError('Saved analysis could not be loaded. You can retry with Analyze with AI.') } })
    return () => { active = false }
  }, [companyId, autoRun]) // eslint-disable-line react-hooks/exhaustive-deps
  async function analyze() {
    setLoading(true); setError(''); setReviewed(false)
    try {
      const response = await api.post('/api/v1/ai/analyze', { companyId }, { timeout: 180000 })
      setResult(response.data.data)
    } catch (e) {
      setResult(null)
      setError(axios.isAxiosError(e) ? e.response?.data?.message ?? 'The analysis request failed. Check the backend and AI provider.' : 'Could not analyze this company.')
    } finally { setLoading(false) }
  }
  const a = result?.analysis
  const assessment = result?.evidenceAssessment
  function citations(ids: string[]) {
    return ids.map((id, j) => { const source = sources.find(s => s.id === id); return <span key={id}>{j ? ', ' : ''}{source ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline" title={source.title}>{id}</a> : id}</span> })
  }
  const emptyNeeds = result?.businessContext?.companyClassification === 'SELLER'
    ? 'Select an external customer company to assess service fit.'
    : assessment?.companyEventCount
      ? 'Company events were collected. No service hypothesis passed the current relevance checks; inspect the reasons below.'
      : 'The collected items do not establish a dated company action. Check the source assessment below.'
  return <section className="card p-6 mb-5" aria-label="AI company analysis">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold text-navy-600"><SparklesIcon className="w-5 h-5 text-teal-600" /> AI Opportunity Brief</h2>
        <p className="text-sm text-gray-500 mt-1">From company signals to a useful discovery conversation.</p></div>
      <button onClick={() => void analyze()} disabled={loading} className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-60">
        {loading ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
        {loading ? 'Analyzing…' : result ? 'Analyze again' : 'Analyze with AI'}
      </button>
    </div>
    {!result && !loading && !error && <p className="text-sm text-gray-500 mt-5 bg-gray-50 p-4 rounded-lg">Generate a brief using the configured AI provider. The key stays in the backend. No outreach is sent.</p>}
    {loading && <p role="status" className="text-sm text-teal-700 mt-5 bg-teal-50 p-4 rounded-lg">Reading the supplied signals and preparing the brief. The first request may take longer while the backend starts.</p>}
    {error && <div role="alert" className="mt-5 p-4 bg-red-50 text-red-700 rounded-lg flex gap-2"><AlertCircleIcon className="w-5 h-5 shrink-0" />{error}</div>}
    {result && a && <div className="mt-6 space-y-5" aria-live="polite">
      {result.persistence?.durable && <p className="text-xs text-gray-500">Saved report · {new Date(result.generatedAt).toLocaleString()}</p>}
      <div className="flex flex-wrap gap-2 text-xs"><span className="bg-teal-50 text-teal-700 px-2 py-1 rounded">{result.analysisOrigin === 'seller_check' ? 'Seller identity check' : `Live AI · ${result.model}`}</span><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">{result.dataMode === 'sample' ? 'Fictional scenario' : result.dataMode === 'research' ? 'Public research · verify sources' : 'Supplied account data'}</span><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">{a.readiness === 'DISCOVERY_READY' ? 'Ready for targeted discovery' : a.readiness === 'NEEDS_RESEARCH' ? 'Service connection needs review' : 'Hold for research'}</span></div>
      {result.businessContext && <p className="text-xs text-gray-500">Seller: {result.businessContext.sellerName} · Business knowledge v{result.businessContext.knowledgeVersion}{result.businessContext.companyClassification === 'SELLER' ? ' · Selected company is the seller' : ''}</p>}
      <p className="text-sm leading-relaxed text-gray-700">{a.summary}</p>
      {assessment && <div className="bg-teal-50 border border-teal-100 rounded-lg p-4 text-sm text-teal-900">
        <h3 className="font-semibold">Why this result</h3><p className="mt-2">{assessment.statusReason}</p>
        {assessment.sourceCount !== undefined && <p className="text-xs mt-2">{assessment.sourceCount} sources · {assessment.companyEventCount} distinct company events · {assessment.duplicateReportCount} repeated reports grouped · {assessment.commentaryCount} commentary items excluded from company activity</p>}
        {assessment.matchingAssessment && <p className="text-xs mt-2">{assessment.matchingAssessment.serviceCandidateCount} potential service connections screened · {assessment.matchingAssessment.acceptedHypothesisCount} AI hypotheses retained. Source counts describe coverage; they do not confirm customer demand.</p>}
      </div>}
      {!!result.validationWarnings?.length && <details className="border border-gray-200 rounded-lg p-3 text-xs text-gray-600"><summary className="cursor-pointer font-medium text-gray-700">Analysis notes</summary><div className="mt-2 space-y-2">{result.validationWarnings.map((w,i)=><p key={i}>{w}</p>)}</div></details>}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-lg p-4"><h3 className="font-semibold text-sm mb-3">Company context and reported events</h3>{a.observedFacts.length ? a.observedFacts.map((f, i) => <div key={i} className="text-sm mb-3"><p>{f.text}</p><p className="text-xs text-teal-700 mt-1">Evidence: {citations(f.evidenceIds)}</p></div>) : <p className="text-sm text-gray-500">No supported event available in this snapshot.</p>}</div>
        <div className="bg-blue-50 rounded-lg p-4"><h3 className="font-semibold text-sm mb-3">Service hypotheses to validate</h3>{a.possibleNeeds.map((n, i) => <div key={i} className="text-sm mb-4"><p className="font-medium">{n.need}</p>{n.fitLevel && <p className="text-xs text-blue-800 mt-1">{n.fitLevel === 'EXPLORATORY' ? 'Exploratory connection · requirement unconfirmed' : 'Service-related signal · demand unconfirmed'}</p>}<p className="text-gray-600 mt-2">{n.reason}</p>{n.basis && <p className="text-xs text-gray-500 mt-2">Basis: {n.basis}</p>}<p className="text-xs text-teal-700 mt-2">Evidence: {citations(n.evidenceIds ?? [])}</p>{n.validationQuestion && <p className="text-xs text-blue-900 mt-2">To confirm: {n.validationQuestion}</p>}</div>)}{!a.possibleNeeds.length && (assessment?.discoveryPrompts?.length ? <div><p className="text-xs text-blue-800 mb-3">No AI hypothesis passed validation. These questions come from configured catalogue rules and the cited events; they are not confirmed requirements.</p>{assessment.discoveryPrompts.map(p => <div key={p.offeringId} className="text-sm mb-4"><p className="font-medium">{p.offeringName} · question to explore</p><p className="mt-2">{p.question}</p><p className="text-xs text-gray-600 mt-2">{p.basis}</p><p className="text-xs text-teal-700 mt-2">Evidence: {citations(p.evidenceIds)}</p></div>)}</div> : <p className="text-sm text-gray-600">{emptyNeeds}</p>)}</div>
      </div>
      <div className="border border-teal-100 rounded-lg p-4"><h3 className="text-sm font-semibold text-teal-800">{a.recommendedCapability?.name ?? (a.possibleNeeds.length ? 'Service options for discovery' : 'No supported service connection yet')}</h3><p className="text-sm text-gray-600 mt-2">{a.recommendedCapability?.reason ?? (a.possibleNeeds.length ? 'Validate the hypotheses above before choosing a service.' : assessment?.statusReason ?? emptyNeeds)}</p><p className="text-xs text-gray-400 mt-2">Discovery guidance. Customer requirements, existing-provider gaps and service availability need confirmation.</p></div>
      <div className="rounded-lg bg-navy-50 p-4"><h3 className="text-sm font-semibold">Recommended next action</h3><p className="text-sm mt-2"><strong>Role to identify:</strong> {a.nextAction.role}</p><p className="text-sm mt-2"><strong>Ask:</strong> {a.nextAction.question}</p><p className="text-sm mt-2 text-gray-600"><strong>Timing:</strong> {a.nextAction.whyNow}</p></div>
      <div><h3 className="text-sm font-semibold">Unknowns to validate</h3><ul className="list-disc pl-5 mt-2 text-sm text-gray-600 space-y-1">{a.unknowns.map((u,i)=><li key={i}>{u}</li>)}</ul></div>
      {!!assessment?.sourceLimitations.length && <details className="border border-gray-200 rounded-lg p-3 text-xs text-gray-600"><summary className="cursor-pointer font-medium text-gray-700">Source verification notes</summary><div className="mt-2 space-y-2">{assessment.sourceLimitations.map((limitation,i)=><p key={i}>{limitation}</p>)}</div></details>}
      {!!assessment?.rejections.length && <details className="border rounded-lg p-4"><summary className="text-sm font-medium cursor-pointer">Why suggestions were withheld ({assessment.rejections.length})</summary><ul className="mt-3 text-sm text-gray-600 space-y-2">{assessment.rejections.map((rejection,i)=><li key={i}>{rejection.offeringName}: {rejection.reason}</li>)}</ul></details>}
      {!!assessment?.sourceAssessments?.some(s => s.relevance !== 'COMPANY_EVENT') && <details className="border rounded-lg p-4"><summary className="text-sm font-medium cursor-pointer">How the collected sources were used</summary><div className="mt-3 space-y-3 text-sm text-gray-600">{assessment.sourceAssessments.filter(s => s.relevance !== 'COMPANY_EVENT').map(s => <div key={s.sourceId}><p className="font-medium text-gray-800">{sources.find(source => source.id === s.sourceId)?.title ?? 'Source context'}</p><p className="text-xs mt-1">{s.reason}</p></div>)}</div></details>}
      <p className="text-xs text-gray-500">{result.citationCheck} Customer relationship: unknown. This brief does not establish buying intent.</p>
      <div className="border-t pt-4 flex flex-wrap items-center gap-3"><button onClick={()=>setReviewed(!reviewed)} className="border rounded-lg px-3 py-2 text-sm inline-flex gap-2 items-center"><CheckCircleIcon className="w-4 h-4" />{reviewed ? 'Marked as reviewed' : 'Mark reviewed for this session'}</button><span className="text-xs text-gray-400">Session only · not saved to CRM · nothing sent</span></div>
    </div>}
  </section>
}
