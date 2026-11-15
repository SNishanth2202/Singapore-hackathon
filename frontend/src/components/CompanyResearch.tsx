import { useState } from 'react'
import axios from 'axios'
import { SearchIcon, GlobeIcon, RefreshCwIcon, ExternalLinkIcon } from 'lucide-react'
import api from '../services/api'
import CompanyAnalysis from './CompanyAnalysis'

interface Candidate { entityId: string; name: string; description: string; website: string | null; identitySource: string }
interface Source { id: string; title: string; url: string; publisher: string; excerpt: string; publishedAt: string | null; retrievedAt: string; kind: string; verification: string }
interface Research { id: string; company: Candidate; sources: Source[]; warnings: string[]; createdAt: string; persistence?: { mode: string; durable: boolean }; quality?: { companyEventCount: number; duplicateReportCount: number; commentaryCount: number; sourceAssessments: { sourceId: string; relevance: string; reason: string }[] } }

export default function CompanyResearch() {
  const [name, setName] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [research, setResearch] = useState<Research | null>(null)
  const [phase, setPhase] = useState<'idle'|'finding'|'collecting'>('idle')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  async function collect(candidate: Candidate) {
    setPhase('collecting'); setError(''); setCandidates([])
    try {
      const response = await api.post('/api/v1/ai/research', { entityId: candidate.entityId }, { timeout: 100000 })
      setResearch(response.data.data)
    } catch (e) { setError(message(e)) }
    finally { setPhase('idle') }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (name.trim().length < 2 || phase !== 'idle') return
    setPhase('finding'); setError(''); setNote(''); setResearch(null); setCandidates([])
    try {
      const response = await api.post('/api/v1/ai/research/search', { name: name.trim() }, { timeout: 90000 })
      const data = response.data.data as { candidates: Candidate[]; autoSelectId: string | null; note: string }
      const automatic = data.candidates.find((c) => c.entityId === data.autoSelectId)
      if (automatic) { await collect(automatic); return }
      setCandidates(data.candidates); setNote(data.note)
    } catch (e) { setError(message(e)) }
    finally { setPhase('idle') }
  }
  function message(e: unknown) { return axios.isAxiosError(e) ? e.response?.data?.message ?? 'Public research is unavailable. Keep the backend running and try again.' : 'Could not research this company.' }
  return <section className="mb-8" aria-label="Research a company by name">
    <div className="card p-5 sm:p-6 border-t-4 border-teal-600">
      <div className="flex gap-3 items-start"><GlobeIcon className="w-6 h-6 text-teal-600 mt-1 shrink-0" /><div><h2 className="text-xl font-semibold text-navy-600">Start with a company name</h2><p className="text-sm text-gray-500 mt-1">Find the company, gather public sources, then generate a discovery brief.</p></div></div>
      <form onSubmit={(e)=>void search(e)} className="flex flex-col sm:flex-row gap-3 mt-5">
        <label className="sr-only" htmlFor="research-company-name">Company name to research</label>
        <input id="research-company-name" value={name} onChange={(e)=>setName(e.target.value)} disabled={phase !== 'idle'} minLength={2} maxLength={120} required placeholder="e.g. Infosys, DHL, Tata Consultancy Services" className="flex-1 min-w-0 border border-gray-300 px-3 py-3 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        <button disabled={phase !== 'idle' || name.trim().length < 2} className="inline-flex justify-center items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 text-sm font-semibold disabled:opacity-50">{phase === 'idle' ? <SearchIcon className="w-4 h-4" /> : <RefreshCwIcon className="w-4 h-4 animate-spin" />}{phase === 'finding' ? 'Finding company…' : phase === 'collecting' ? 'Gathering sources…' : 'Research company'}</button>
      </form>
      <p className="text-xs text-gray-500 mt-3">Public research is separate from the sample accounts below. Coverage varies; unclear matches need your confirmation.</p>
      {phase !== 'idle' && <p role="status" className="text-sm text-teal-700 mt-4">{phase === 'finding' ? 'Checking public identity listings. The AI does not guess the company.' : 'Reading profiles, recent news headlines and accessible company pages. Blocked sources will be disclosed.'}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {note && <p className="text-sm text-gray-600 mt-4">{note}</p>}
      {!!candidates.length && <div className="mt-4 space-y-2"><h3 className="text-sm font-semibold">Which company do you mean?</h3>{candidates.map((c)=><button key={c.entityId} onClick={()=>void collect(c)} disabled={phase !== 'idle'} className="w-full text-left rounded-lg border border-gray-200 p-3 hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"><span className="font-semibold text-sm">{c.name}</span><span className="block text-sm text-gray-600 mt-1">{c.description}</span><span className="text-xs text-gray-400">{c.website ?? 'Website not listed'} · {c.entityId}</span></button>)}</div>}
    </div>
    {research && <div className="mt-5 space-y-5">
      <div className="card p-5 sm:p-6"><div className="flex flex-wrap gap-2 justify-between items-start"><div><h2 className="text-lg font-semibold text-navy-600">Research: {research.company.name}</h2><p className="text-sm text-gray-600 mt-1">{research.company.description}</p></div><span className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded">Public-source snapshot</span></div>
        <a href={research.company.identitySource} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 underline inline-block mt-2">Identity listing · confirm this is the right organization</a>
        {!!research.warnings.length && <details className="mt-4 border border-gray-200 rounded-lg p-3 text-xs text-gray-600"><summary className="cursor-pointer font-medium text-gray-700">Source notes</summary><div className="mt-2 space-y-2">{research.warnings.map((w,i)=><p key={i}>{w}</p>)}</div></details>}
        <h3 className="text-sm font-semibold mt-5 mb-3">Collected sources · {research.sources.length}</h3>
        {research.quality && <p className="text-xs text-gray-600 mb-3">{research.quality.companyEventCount} distinct company events · {research.quality.duplicateReportCount} repeated reports grouped · {research.quality.commentaryCount} commentary items kept separate</p>}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">{research.sources.map((s)=><details key={s.id} className="border border-gray-200 rounded-lg p-3"><summary className="cursor-pointer text-sm font-medium text-gray-800">{s.title}<span className="block font-normal text-xs text-gray-500 mt-1">{s.kind === 'news_headline' ? 'Headline only · article unverified' : s.kind === 'official_page' ? 'Retrieved company page' : 'Background / identity profile'} · {s.publisher}</span></summary><p className="text-sm text-gray-600 mt-3">{s.excerpt}</p><p className="text-xs text-gray-500 mt-2">Published: {s.publishedAt ? new Date(s.publishedAt).toLocaleDateString() : 'Unknown'} · Retrieved: {new Date(s.retrievedAt).toLocaleString()}</p><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex gap-1 items-center text-xs text-teal-700 underline mt-2">Open source <ExternalLinkIcon className="w-3 h-3" /></a><p className="text-xs text-gray-400 mt-1">{s.id}</p></details>)}</div>
        <p className="text-xs text-gray-400 mt-4">{research.persistence?.durable ? 'Sources saved in cloud storage' : 'Temporary preview snapshot'} with retrieval times and content hashes. Snapshot: {research.id}</p>
      </div>
      <CompanyAnalysis key={research.id} companyId={research.id} sources={research.sources} autoRun />
    </div>}
  </section>
}
