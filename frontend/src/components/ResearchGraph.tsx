import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NetworkIcon, RefreshCwIcon, ExternalLinkIcon } from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import api from '../services/api'

interface GraphNode { id: string; type: string; label: string; properties: Record<string, string | null> }
interface GraphEdge { id: string; source: string; target: string; type: string }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[]; storageMode: string; pendingSnapshots: number }
interface Snapshot { id: string; company: { name: string }; createdAt: string }
const TYPES = ['Company', 'ResearchSnapshot', 'BusinessEvent', 'EvidenceSource']
const LABELS: Record<string, string> = { Company: 'Company', ResearchSnapshot: 'Research', BusinessEvent: 'Reported event', EvidenceSource: 'Source' }
const COLORS: Record<string, string> = { Company: '#1e3a5f', ResearchSnapshot: '#0d9488', BusinessEvent: '#2563eb', EvidenceSource: '#64748b' }

export default function ResearchGraph() {
  const [params, setParams] = useSearchParams()
  const researchId = params.get('researchId') ?? ''
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [graph, setGraph] = useState<Graph | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setSelected(null)
    Promise.all([
      api.get('/api/v1/graph', { params: researchId ? { researchId } : {} }),
      api.get('/api/v1/ai/research'),
    ]).then(([graphResponse, historyResponse]) => {
      if (active) { setGraph(graphResponse.data.data); setSnapshots(historyResponse.data.data) }
    }).catch(() => { if (active) { setGraph(null); setError('The graph could not be loaded. Refresh to retry; previously saved research is retained.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [researchId, refresh])
  const height = Math.max(480, Math.max(...TYPES.map(type => graph?.nodes.filter(n => n.type === type).length ?? 0)) * 42 + 80)
  const positions = new Map((graph?.nodes ?? []).map(node => {
    const siblings = graph!.nodes.filter(n => n.type === node.type)
    return [node.id, { x: 95 + TYPES.indexOf(node.type) * 235, y: siblings.length === 1 ? height / 2 : 70 + siblings.indexOf(node) * (height - 110) / (siblings.length - 1) }]
  }))
  const sourceUrl = selected?.properties.url
  const safeSourceUrl = sourceUrl && /^https:\/\//i.test(sourceUrl) ? sourceUrl : null
  return <div>
    <PageHeader title="Knowledge Graph" subtitle="Explore companies, reported events and their original evidence" actions={
      <button disabled={loading} onClick={() => setRefresh(v => v + 1)} className="inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm text-gray-600 disabled:opacity-50"><RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
    } />
    <div className="card p-5 mb-5">
      <label htmlFor="graph-research" className="block text-sm font-medium text-gray-700 mb-2">Research snapshot</label>
      <select id="graph-research" value={researchId} onChange={e => setParams(e.target.value ? { researchId: e.target.value } : {})} className="border rounded-lg p-2 w-full text-sm">
        <option value="">Latest synced research</option>
        {snapshots.map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshot.company.name} · {new Date(snapshot.createdAt).toLocaleString()}</option>)}
      </select>
      <div className="flex flex-wrap gap-4 mt-4">{TYPES.map(type => <span key={type} className="inline-flex items-center gap-2 text-xs text-gray-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[type] }} />{LABELS[type]}</span>)}</div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 text-red-700 text-sm p-4 mb-4">{error}</p>}
    {loading ? <p role="status" className="p-8 text-center text-gray-500">Loading relationships…</p> : graph && !graph.nodes.length ? <div className="card p-10 text-center">
      <NetworkIcon className="w-9 h-9 mx-auto text-teal-600 mb-3" /><h2 className="text-base font-semibold text-gray-800">{graph.pendingSnapshots ? 'Research is syncing to the graph' : 'Start with a company research'}</h2>
      <p className="text-sm text-gray-500 mt-2">{graph.storageMode !== 'cloud' ? 'Cloud graph storage has not been connected yet.' : graph.pendingSnapshots ? 'Your research is saved. Refresh shortly to see its relationships.' : 'Research a company in Company Intelligence to build its evidence graph.'}</p>
    </div> : graph && <div className="grid lg:grid-cols-3 gap-5">
      <div className="card p-4 lg:col-span-2 overflow-auto">
        <p className="text-xs text-gray-500 mb-3">{graph.nodes.length} nodes · {graph.edges.length} relationships{graph.pendingSnapshots ? ` · ${graph.pendingSnapshots} snapshot(s) awaiting sync` : ''}</p>
        <svg viewBox={`0 0 930 ${height}`} className="w-full min-w-[650px]" role="group" aria-label="Research evidence graph">
          {TYPES.map((type, i) => <text key={type} x={95 + i * 235} y={24} textAnchor="middle" fill="#64748b" fontSize="12">{LABELS[type]}</text>)}
          {graph.edges.map(edge => { const from = positions.get(edge.source), to = positions.get(edge.target); return from && to ? <g key={edge.id}><title>{edge.type.replace(/_/g, ' ')}</title><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={selected && [edge.source, edge.target].includes(selected.id) ? '#0d9488' : '#dbe3ed'} strokeWidth="1.5" /></g> : null })}
          {graph.nodes.map(node => { const position = positions.get(node.id)!; return <g key={node.id} role="button" tabIndex={0} aria-label={`${LABELS[node.type]}: ${node.label}`} onClick={() => setSelected(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(node) } }} className="cursor-pointer focus:outline-teal-600">
            <title>{node.label}</title><circle cx={position.x} cy={position.y} r={node.type === 'Company' ? 14 : 8} fill={COLORS[node.type] ?? '#64748b'} stroke={selected?.id === node.id ? '#5eead4' : 'white'} strokeWidth="3" />
            <text x={position.x} y={position.y + 24} fontSize="10" fill="#374151" textAnchor="middle">{node.type === 'ResearchSnapshot' ? 'Source snapshot' : node.label.length > 29 ? `${node.label.slice(0, 27)}…` : node.label}</text>
          </g> })}
        </svg>
      </div>
      <div className="card p-5 h-fit" aria-live="polite">
        <h2 className="text-sm font-semibold text-gray-800">{selected ? LABELS[selected.type] : 'Inspect a relationship'}</h2>
        {selected ? <><p className="text-sm font-medium text-navy-600 mt-3">{selected.label}</p><dl className="text-xs mt-4 space-y-3">
          {['verification', 'eventType', 'businessRole', 'publisher', 'kind', 'publishedAt', 'retrievedAt', 'createdAt'].filter(key => selected.properties[key]).map(key => <div key={key}><dt className="text-gray-400">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="text-gray-700 mt-1 break-words">{selected.properties[key]}</dd></div>)}
        </dl>{safeSourceUrl && <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal-700 underline mt-4">Open original source <ExternalLinkIcon className="w-3 h-3" /></a>}</> : <p className="text-sm text-gray-500 mt-3">Select a node to see its evidence, dates and verification status.</p>}
        <p className="text-xs text-gray-400 mt-5">Links describe research provenance. A reported event does not establish buying intent or an existing customer relationship.</p>
      </div>
    </div>}
  </div>
}
