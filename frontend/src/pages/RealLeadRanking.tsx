import { useEffect, useRef, useState } from 'react'
import { ActivityIcon, Building2Icon, Loader2Icon, SearchIcon, Settings2Icon, SparklesIcon } from 'lucide-react'
import {PageHeader} from '../components/ui/PageHeader'
type Settings={markets:string[];intervalMinutes:number;enabled:boolean;maxCandidates:number}
type Lead={id:string;name:string;description:string;website:string|null;score:number;whyNow:string;researchedAt:string;relationship:string;model:string|null;fitStatus?:'SUPPORTED'|'NEEDS_RESEARCH';fitReason?:string;sourceWarnings?:string[];identityStatus?:'DIRECTORY_MATCH'|'REGISTRY_MATCH'|'UNVERIFIED';analysisOrigin?:'model'|'sources_only';researchId:string;analysis:{summary:string;possibleNeeds:{serviceName?:string;need:string;reason:string;offeringId:string;evidenceIds:string[]}[];recommendedCapability:{name:string;reason:string}|null;nextAction:{role:string;question:string;whyNow:string};unknowns:string[]};sources:{id:string;title:string;url:string;publishedAt:string|null;retrievedAt:string;verification:string;excerpt:string}[]}
type State={settings:Settings;nextRunAt:string|null;leads:Lead[];reviewedCompanies?:Lead[];displayMode?:'current_run'|'previous_run'|'awaiting_results'|'completed';run:{status:string;cursor:number;candidateCount:number;qualifiedCount:number;currentCompany?:string|null;failures:string[];sourceReports:{source:string;count:number;status:string}[]}|null;history:{id:string;status:string;startedAt:string;finishedAt?:string}[];sourceCatalogue:{name:string;mode:string;purpose:string}[];scheduler:{storage:string;externalWakeConfigured:boolean}}
const initial:Settings={markets:['Singapore','India'],intervalMinutes:240,enabled:false,maxCandidates:3}
const time=(value:string|null)=>value?new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'Not scheduled'
async function request(path='',body?:unknown){const response=await fetch(`${(import.meta.env.VITE_API_BASE_URL??'').replace(/\/$/,'')}/api/v1/prospecting${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.message??'Research request failed');return data}
export default function RealLeadRanking(){
 const [state, setState] = useState<State | null>(null)
 const [settings, setSettings] = useState(initial)
 const [markets, setMarkets] = useState('')
 const [error, setError] = useState('')
 const [busy, setBusy] = useState(false)
 const [selected, setSelected] = useState<Lead | null>(null)
 const [query, setQuery] = useState('')
 const initialized = useRef(false)
 const version = useRef(0)
 const saving = useRef(false)

 useEffect(() => {
   let active = true
   let timer: number
   async function poll() {
     const current = version.current
     try {
       if (saving.current) return
       const data: State = await request()
       if (!active || current !== version.current) return
       setState(data)
       if (!initialized.current) {
         const { markets, intervalMinutes, enabled, maxCandidates } = data.settings
         setSettings({ markets, intervalMinutes, enabled, maxCandidates })
         setMarkets(data.settings.markets.join(', '))
         initialized.current = true
       }
       setError('')
     } catch (reason) {
       if (active && current === version.current) setError((reason as Error).message)
     } finally {
       if (active) timer = window.setTimeout(poll, 5000)
     }
   }
   void poll()
   return () => { active = false; window.clearTimeout(timer) }
 }, [])

 async function save(run: boolean) {
   if (saving.current || !state) return
   saving.current = true
   version.current++
   setBusy(true)
   setError('')
   try {
     const next = { ...settings, markets: markets.split(',').map(market => market.trim()).filter(Boolean) }
     await request('/settings', next)
     if (run) await request('/run', {})
     setState(await request())
   } catch (reason) {
     setError((reason as Error).message)
   } finally {
     saving.current = false
     setBusy(false)
   }
 }
 const running=state?.run&&['discovering','researching'].includes(state.run.status)
 const ranked=state?.leads??[]
 const reviewed=state?.reviewedCompanies??[]
 const input='block mt-1.5 w-full rounded-lg border border-singtelGray-200 bg-white px-3 py-2 text-sm font-normal text-singtelGray-800 focus:border-singtelRed focus:outline-singtelRed'
 return <div><PageHeader title="Lead Ranking" subtitle="Discover and research real companies. Evidence-backed opportunities for Singtel." actions={<button className="btn-primary inline-flex items-center gap-2" disabled={busy||!!running||!state} type="button" form="prospecting-settings" onClick={event => { if (event.currentTarget.form?.reportValidity()) void save(true) }}>{running ? <Loader2Icon size={15} className="animate-spin"/> : <SparklesIcon size={15}/>} {running?'Research in progress…':'Research now'}</button>}/>
 {error&&<p role="alert" className="p-4 mb-4 border border-singtelRed-100 bg-singtelRed-50 rounded-lg text-sm text-singtelRed-700">{error}</p>}
 <form id="prospecting-settings" onSubmit={event => { event.preventDefault(); void save(false) }} className="card p-5 mb-5"><h2 className="flex items-center gap-2 text-base font-semibold mb-4"><Settings2Icon size={17} className="text-singtelGray-500"/>Research settings</h2><div className="grid sm:grid-cols-3 gap-4">
 <label className="text-sm font-medium text-singtelGray-700">Markets (comma separated)<input className={input} required disabled={!state || busy || !!running} value={markets} onChange={event => setMarkets(event.target.value)}/></label>
 <label className="text-sm font-medium text-singtelGray-700">Research every (minutes)<input required disabled={!state || busy || !!running} type="number" min="15" max="43200" className={input} value={settings.intervalMinutes} onChange={e=>setSettings({...settings,intervalMinutes:Number(e.target.value)})}/><span className="block mt-1.5 font-normal text-xs text-singtelGray-500">240 minutes = 4 hours</span></label>
 <label className="text-sm font-medium text-singtelGray-700">Candidates per run<input required disabled={!state || busy || !!running} type="number" min="1" max="40" className={input} value={settings.maxCandidates} onChange={e=>setSettings({...settings,maxCandidates:Number(e.target.value)})}/><span className="block mt-1.5 font-normal text-xs text-singtelGray-500">Start with 2–3 companies to reduce AI requests.</span></label></div>
 <div className="flex flex-wrap gap-x-4 gap-y-3 items-center mt-5 pt-4 border-t border-singtelGray-200"><label className="text-sm flex gap-2"><input type="checkbox" disabled={!state || busy || !!running} className="accent-singtelRed" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/>Automatic research</label><button type="submit" className="btn-secondary" disabled={busy||!!running||!state}>Save settings</button><span className="text-xs text-singtelGray-500">Next run: {time(state?.nextRunAt??null)} SGT</span></div>
 {state?.settings.enabled&&<p className="text-xs text-singtelGray-500 mt-3">Schedules continue while the backend worker is running. A sleeping hosting service needs an external scheduler wake-up; configuration: {state.scheduler.externalWakeConfigured?'wake endpoint configured':'wake-up not configured'}. Storage: {state.scheduler.storage}.</p>}</form>
 {running&&<div role="status" className="rounded-xl border border-singtelRed-100 bg-singtelRed-50 p-4 mb-4 text-sm text-singtelRed-800"><strong className="flex items-center gap-2 mb-1"><ActivityIcon size={16}/>{state?.run?.status==='discovering'?'Searching live sources…':'Researching and validating companies…'}</strong><p>{state?.run?.cursor} / {state?.run?.candidateCount} candidates processed · {state?.run?.qualifiedCount} supported opportunities. New company reports appear as each finishes.</p>{state?.run?.currentCompany&&<p className="text-sm mt-1">Next company: {state.run.currentCompany}</p>}</div>}
 {state?.run?.status==='failed'&&<p role="status" className="border border-singtelRed-100 bg-singtelRed-50 text-singtelRed-700 rounded-lg text-sm p-4 mb-4">The latest research run failed. Previous results retain their original dates. See research history for details.</p>}
 <section className="card p-5"><div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 mb-4"><div className="min-w-0 flex-1 basis-72"><h2 className="text-lg font-semibold">Top {state?.leads.length??0} companies</h2><p className="text-xs text-singtelGray-500">All industries are eligible. {state?.displayMode==='current_run'?'Showing results from the current run. ':state?.displayMode==='previous_run'?'Showing the previous list while new companies are researched. ':''}Up to 15 distinct companies. Research priority is not a purchase probability. Account relationship remains unknown without CRM verification.</p></div><label className="flex w-full items-center gap-2 rounded-lg border border-singtelGray-200 bg-white px-3 py-2 text-singtelGray-500 focus-within:border-singtelRed sm:w-52"><SearchIcon size={15}/><span className="sr-only">Search companies</span><input placeholder="Search companies" className="w-full min-w-0 bg-transparent text-sm text-singtelGray-800 outline-none" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
 {!state?.leads.length&&<div className="rounded-lg border border-dashed border-singtelGray-200 bg-singtelGray-50 px-4 py-10 text-center text-singtelGray-500"><Building2Icon size={22} className="mx-auto mb-3 text-singtelGray-500"/><h3 className="text-base font-semibold text-singtelGray-800">{!state?'Loading research…':running?'Research in progress':state.run?'No supported opportunities yet':'No completed research yet'}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed">Choose markets and start research across all industries. Company reports appear below as research completes, including companies whose service fit still needs verification.</p></div>}
 <div className="grid lg:grid-cols-2 gap-3">{ranked.filter(l=>l.name.toLowerCase().includes(query.toLowerCase())).map((lead)=><article key={lead.id} className="relative border border-singtelGray-200 rounded-xl p-4 group hover:border-singtelGray-300"><div className="flex items-start justify-between gap-3"><button className="text-left font-semibold text-singtelGray-800 hover:text-singtelRed-700" aria-expanded={selected?.id===lead.id} onClick={()=>setSelected(selected?.id===lead.id?null:lead)}>#{ranked.findIndex(item=>item.id===lead.id)+1} {lead.name}</button><span className="shrink-0 text-xs font-semibold rounded-full bg-singtelRed-50 text-singtelRed-700 px-3 py-1">Priority {lead.score}/100</span></div><p className="text-sm text-singtelGray-600 mt-2">{lead.description}</p><p className="text-sm mt-2">{lead.whyNow}</p><p className="text-xs text-singtelGray-500 mt-2">{lead.sources.length} sources · Researched {time(lead.researchedAt)} SGT</p><div className="absolute left-0 right-0 top-full z-20 hidden group-hover:block group-focus-within:block text-sm bg-white border border-singtelGray-200 shadow-lg rounded-lg p-3"><strong>Possible need</strong><p>{lead.analysis.possibleNeeds[0]?.need}</p><strong>Singtel fit</strong><p>{lead.analysis.recommendedCapability?.name??lead.analysis.possibleNeeds[0]?.serviceName??'See service hypotheses'}</p></div></article>)}</div></section>
 {reviewed.length>0&&<section className="card p-5 mt-5" aria-label="Company research"><h2 className="text-lg font-semibold">Company research · {reviewed.length}</h2><p className="text-sm text-singtelGray-500 mb-4">Every completed company report is available here. A researched company is not automatically a qualified sales opportunity.</p><div className="grid lg:grid-cols-2 gap-3">{reviewed.filter(lead=>lead.name.toLowerCase().includes(query.toLowerCase())).map(lead=><article key={lead.id} className="border border-singtelGray-200 rounded-lg p-4"><button className="font-semibold text-singtelGray-800 hover:text-singtelRed-700 text-left" aria-label={`Open research for ${lead.name}`} onClick={()=>setSelected(lead)}>{lead.name}</button><p className="text-xs mt-1">{lead.identityStatus==='UNVERIFIED'?'Sources ready · identity verification needed':lead.analysisOrigin==='sources_only'?'Sources ready · AI analysis incomplete':lead.fitStatus==='NEEDS_RESEARCH'?'Further verification needed':'Service connection supported'} · {lead.sources.length} sources</p><p className="text-sm text-singtelGray-600 mt-2">{lead.fitReason??lead.whyNow}</p></article>)}</div></section>}
 {selected&&<section aria-label={`Research details for ${selected.name}`} className="card p-6 mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{selected.name}</h2><button className="btn-secondary shrink-0" onClick={()=>setSelected(null)}>Close company details</button></div><p className="mt-3">{selected.analysis.summary}</p>{selected.fitReason&&<p className="text-sm mt-3 border border-singtelGray-200 rounded-lg p-3">{selected.fitReason}</p>}{selected.website&&<a className="text-singtelRed-700 underline" href={selected.website} target="_blank" rel="noreferrer">Company website</a>}<h3 className="font-semibold mt-5">Why this company matters now</h3><p>{selected.whyNow}</p><h3 className="font-semibold mt-5">Possible needs and Singtel capabilities</h3>{!selected.analysis.possibleNeeds.length&&<p>Review the company evidence and use the discovery question below to identify a suitable service.</p>}{selected.analysis.possibleNeeds.map((need,i)=><div key={i} className="border border-singtelGray-200 rounded-lg p-3 mt-2"><strong>{need.serviceName??need.offeringId}</strong><p>{need.need}</p><p>{need.reason}</p><small>Hypothesis · {need.offeringId} · Sources: {need.evidenceIds.join(', ')}</small></div>)}<p className="mt-3">{selected.analysis.recommendedCapability?.reason}</p><h3 className="font-semibold mt-5">Recommended next action</h3><p>Role to identify: {selected.analysis.nextAction.role}</p><p>{selected.analysis.nextAction.question}</p><p>{selected.analysis.nextAction.whyNow}</p><h3 className="font-semibold mt-5">Still to verify</h3><ul className="list-disc pl-5">{['Existing customer relationship, budget and procurement approval',...selected.analysis.unknowns].map((s,i)=><li key={i}>{s}</li>)}</ul>{selected.sourceWarnings&&selected.sourceWarnings.length>0&&<details className="mt-4 border border-singtelGray-200 rounded-lg p-3"><summary>Source coverage and retrieval limits</summary><ul className="list-disc pl-5 text-sm">{selected.sourceWarnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>}<h3 className="font-semibold mt-5">Source evidence</h3>{selected.sources.map(s=><article key={s.id} className="border border-singtelGray-200 rounded-lg p-3 mt-2"><a className="text-singtelRed-700 underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a><p className="text-sm">{s.excerpt}</p><p className="text-xs text-singtelGray-500">{s.id} · {s.verification} · Published: {s.publishedAt?time(s.publishedAt):'Date unavailable'} · Retrieved: {time(s.retrievedAt)}</p></article>)}<p className="text-xs text-singtelGray-500 mt-4">Model: {selected.model??'AI analysis not completed'} · {selected.researchId}</p></section>}
 <details className="card p-5 mt-5"><summary className="cursor-pointer text-sm font-semibold">Research history and source coverage</summary>{state?.history.map(h=><p key={h.id} className="text-sm mt-2">{time(h.startedAt)} SGT · {h.status}</p>)}{state?.run?.failures.map((f,i)=><p key={i} className="text-sm text-singtelGray-600 mt-2">{f}</p>)}{state?.run?.sourceReports.map((r,i)=><p key={i} className="text-xs mt-2">{r.source}: {r.status}, {r.count} records</p>)}<div className="grid sm:grid-cols-2 gap-3 mt-4">{state?.sourceCatalogue.map(s=><div key={s.name} className="border border-singtelGray-200 rounded-lg p-3 text-sm"><strong>{s.name} · {s.mode.replaceAll('_',' ')}</strong><p>{s.purpose}</p></div>)}</div></details></div>
}
