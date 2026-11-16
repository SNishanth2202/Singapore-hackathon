import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon, ArrowRightIcon, DatabaseIcon, DownloadIcon, NetworkIcon, RefreshCwIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { Badge } from '../components/ui/Badge'
import { crmService, CrmAccount, CrmArtifact, CrmDetail, CrmEntity } from '../services/crm.service'
import type { Fact, Idea } from '../services/customer-graph.service'
import { formatDate } from '../utils/formatters'

type OpenSource = (artifactId: string, quote?: string) => void
function FactRecord({ fact, artifacts, onSource }: { fact: Fact; artifacts: CrmArtifact[]; onSource: OpenSource }) {
  return <article className="rounded-lg border border-gray-200 bg-white p-4">
    <h3 className="text-sm font-semibold text-gray-800">{fact.title}</h3>
    <p className="mt-1 text-sm leading-relaxed text-gray-600">{fact.statement}</p>
    {(fact.value || fact.date) && <p className="mt-2 text-xs font-medium text-teal-700">{[fact.value, fact.date].filter(Boolean).join(' · ')}</p>}
    <details className="mt-3 text-xs text-gray-500">
      <summary className="cursor-pointer font-medium text-teal-700">Source evidence ({fact.evidence.length})</summary>
      {fact.evidence.map((evidence, index) => <div key={evidence.artifactId + ':' + index} className="mt-2 border-l-2 border-teal-100 pl-3">
        <blockquote className="whitespace-pre-wrap text-gray-600">“{evidence.quote}”</blockquote>
        <button className="mt-1 text-left text-teal-700 underline" onClick={() => onSource(evidence.artifactId, evidence.quote)}>{artifacts.find(artifact => artifact.id === evidence.artifactId)?.title ?? evidence.artifactId}</button>
      </div>)}
    </details>
  </article>
}
function EntityRecords({ title, records, artifacts, onSource }: { title: string; records: CrmEntity[]; artifacts: CrmArtifact[]; onSource: OpenSource }) {
  return <section className="card p-5" aria-label={title}><h2 className="text-base font-semibold text-gray-800">{title}</h2>
    {records.length ? <div className="mt-4 space-y-3">{records.map(record => <details key={record.id} className="rounded-lg border border-gray-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-navy-600">{record.name ?? record.title ?? record.id}</summary>
      <p className="mt-2 text-sm text-gray-600">{record.description}</p>
      <div className="mt-3 space-y-2">{record.facts.map(fact => <FactRecord key={fact.id} fact={fact} artifacts={artifacts} onSource={onSource} />)}</div>
      {!!record.artifactIds?.length && <div className="mt-3 flex flex-wrap gap-2">{record.artifactIds.map(id => <button key={id} onClick={() => onSource(id)} className="text-xs text-teal-700 underline">{artifacts.find(artifact => artifact.id === id)?.title ?? id}</button>)}</div>}
    </details>)}</div> : <p className="mt-3 text-sm text-gray-500">No {title.toLowerCase()} are recorded for this account.</p>}
  </section>
}
function Ideas({ title, records, detail, onSource }: { title: string; records: Idea[]; detail: CrmDetail; onSource: OpenSource }) {
  if (!records.length) return null
  return <section className="card p-5" aria-label={title}><h2 className="text-base font-semibold text-gray-800">{title}</h2><div className="mt-4 space-y-3">
    {records.map(idea => <article key={idea.id} className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-sm text-navy-600">{idea.title}</h3><span className="rounded bg-gray-100 px-2 py-1 text-xs capitalize text-gray-600">{idea.priority} priority</span></div>
      <p className="mt-2 text-sm text-gray-600">{idea.rationale}</p>
      <div className="mt-3 rounded-lg bg-teal-50 p-3"><p className="text-xs font-semibold text-teal-800">Next action</p><p className="mt-1 text-sm text-teal-900">{idea.nextAction}</p></div>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-teal-700">Supporting facts ({idea.factIds.length})</summary><div className="mt-2 space-y-2">{detail.facts.filter(fact => idea.factIds.includes(fact.id)).map(fact => <FactRecord key={fact.id} fact={fact} artifacts={detail.artifacts} onSource={onSource} />)}</div></details>
    </article>)}
  </div></section>
}
function OriginalPassage({ artifact, quote }: { artifact: CrmArtifact; quote: string }) {
  const at = quote ? artifact.content.indexOf(quote) : -1
  return <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-700">
    {at < 0 ? artifact.content : <>{artifact.content.slice(0, at)}<mark className="bg-teal-100">{quote}</mark>{artifact.content.slice(at + quote.length)}</>}
  </pre>
}
export default function CrmAccounts() {
  const { accountId } = useParams<{ accountId?: string }>()
  const [accounts, setAccounts] = useState<CrmAccount[]>([]), [detail, setDetail] = useState<CrmDetail | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [source, setSource] = useState<{ artifactId: string; quote: string } | null>(null)
  const sourcePanel = useRef<HTMLElement>(null)
  const sourceTrigger = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true); setError(''); setDetail(null); setSource(null)
    Promise.all([crmService.accounts(controller.signal), accountId ? crmService.account(accountId, controller.signal) : Promise.resolve(null)])
      .then(([list, selected]) => { if (active) { setAccounts(list.accounts); setDetail(selected) } })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : 'Customer records could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [accountId, revision])
  useEffect(() => { if (source) { sourcePanel.current?.focus(); sourcePanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } }, [source])
  const selectedSource = source && detail?.artifacts.find(artifact => artifact.id === source.artifactId)
  const openSource: OpenSource = (artifactId, quote = '') => { sourceTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSource({ artifactId, quote }) }
  function closeSource() { setSource(null); sourceTrigger.current?.focus() }
  if (loading) return <LoadingSpinner label="Loading customer records…" />
  if (error) return <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} />
  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title={detail ? detail.account.name : 'Customer CRM'} subtitle={detail ? 'Existing customer context, commercial records and evidence-linked next actions' : 'Use recorded customer history to plan account growth and resolve service needs'}
      actions={<button onClick={() => setRevision(value => value + 1)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCwIcon className="h-4 w-4" />Refresh records</button>} />
    {detail ? <>
      <Link to="/crm/records" className="inline-flex items-center gap-1 text-sm text-teal-700"><ArrowLeftIcon className="h-4 w-4" />All customer accounts</Link>
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm leading-relaxed text-gray-600">{detail.account.description}</p><div className="mt-3 flex flex-wrap gap-2"><Badge label="Existing customer" variant="industry" /><Badge label={detail.account.industry} variant="industry" />{detail.account.isSynthetic && <Badge label="Source records" variant="sample" />}</div></div>
          <Link className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 underline" to={'/graph?account=' + encodeURIComponent(detail.account.graphAccountId)}><NetworkIcon className="h-4 w-4" />Open account graph</Link></div>
        <p className="mt-4 flex items-center gap-2 text-xs text-gray-500"><DatabaseIcon className="h-3 w-3" />{detail.persistence.durable ? 'Saved in MongoDB Atlas' : 'Session records'} · {detail.facts.length} sourced facts · {detail.artifacts.length} original records</p>
      </section>
      {selectedSource && <section ref={sourcePanel} tabIndex={-1} className="card border-teal-200 p-5 outline-none focus:ring-2 focus:ring-teal-500" aria-label="CRM source viewer">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-gray-500">{selectedSource.source.replace(/_/g, ' ')} · {formatDate(selectedSource.occurredAt)}</p><h2 className="mt-1 font-semibold text-gray-800">{selectedSource.title}</h2></div><div className="flex flex-wrap gap-3"><a href={crmService.artifactUrl(selectedSource.downloadPath)} className="inline-flex items-center gap-1 text-sm text-teal-700 underline"><DownloadIcon className="h-4 w-4" />Download original</a><button onClick={closeSource} className="rounded border px-3 py-1 text-sm">Close source</button></div></div>
        <OriginalPassage artifact={selectedSource} quote={source?.quote ?? ''} />
        <p className="mt-2 break-all text-xs text-gray-400">SHA-256: {selectedSource.contentHash}</p>
      </section>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5"><EntityRecords title="Contacts" records={detail.contacts} artifacts={detail.artifacts} onSource={openSource} /><EntityRecords title="Contracts" records={detail.contracts} artifacts={detail.artifacts} onSource={openSource} /><EntityRecords title="Invoices" records={detail.invoices} artifacts={detail.artifacts} onSource={openSource} /><EntityRecords title="Support cases" records={detail.support} artifacts={detail.artifacts} onSource={openSource} /></div>
        <div className="space-y-5"><Ideas title="Recommended account actions" records={detail.actions} detail={detail} onSource={openSource} /><Ideas title="Account risks to review" records={detail.risks} detail={detail} onSource={openSource} /><Ideas title="Growth opportunities to qualify" records={detail.opportunities} detail={detail} onSource={openSource} /></div>
      </div>
      {!!detail.usage.length && <section className="card p-5" aria-label="Services and usage"><h2 className="font-semibold text-gray-800">Services and usage</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{detail.usage.map(fact => <FactRecord key={fact.id} fact={fact} artifacts={detail.artifacts} onSource={openSource} />)}</div></section>}
      <section className="card p-5" aria-label="Original customer records"><h2 className="font-semibold text-gray-800">Original customer records</h2><p className="mt-1 text-sm text-gray-500">Open the source behind an account fact or recommendation.</p><div className="mt-4 grid gap-2 md:grid-cols-2">{detail.artifacts.map(artifact => <button key={artifact.id} onClick={() => openSource(artifact.id)} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:border-teal-500"><span><span className="block text-sm font-medium text-gray-800">{artifact.title}</span><span className="mt-1 block text-xs text-gray-500">{artifact.source.replace(/_/g, ' ')} · {formatDate(artifact.occurredAt)}</span></span><ArrowRightIcon className="h-4 w-4 shrink-0 text-teal-600" /></button>)}</div></section>
      <p className="text-xs text-gray-400">Extracted {formatDate(detail.extraction.createdAt)} · {detail.extraction.model} · {detail.extraction.promptVersion}. Proposed actions require account-team review.</p>
    </> : accounts.length ? <div className="grid gap-5 md:grid-cols-2">{accounts.map(account => <Link key={account.id} to={'/crm/records/' + encodeURIComponent(account.id)} className="card block p-6 hover:border-teal-500">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-navy-600">{account.name}</h2><p className="mt-1 text-sm text-gray-500">{account.industry}</p></div><ArrowRightIcon className="h-5 w-5 text-teal-600" /></div><p className="mt-4 text-sm leading-relaxed text-gray-600">{account.description}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Badge label="Existing customer" variant="industry" />{account.isSynthetic && <Badge label="Source records" variant="sample" />}</div>
      <dl className="mt-5 grid grid-cols-3 gap-3">{(['contacts', 'contracts', 'invoices', 'artifacts', 'opportunities', 'actions'] as const).map(key => <div key={key}><dt className="text-xs capitalize text-gray-500">{key}</dt><dd className="mt-1 text-lg font-semibold text-navy-600">{account.counts[key]}</dd></div>)}</dl>
    </Link>)}</div> : <section className="card p-8"><p className="text-sm text-gray-600">No customer accounts are available. Import the prepared CRM records to begin.</p></section>}
  </div>
}
