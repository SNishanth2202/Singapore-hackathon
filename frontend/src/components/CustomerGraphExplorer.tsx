import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightIcon, FileTextIcon, FocusIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { Artifact, CustomerGraphSnapshot, Fact, GraphNode, Idea } from '../services/customer-graph.service'

interface Props { snapshot: CustomerGraphSnapshot; selectedId: string | null; onSelect: (id: string | null) => void; onArtifact: (id: string, quote?: string) => void }
const short = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text
export default function CustomerGraphExplorer({ snapshot, selectedId, onSelect, onArtifact }: Props) {
  const [all, setAll] = useState(true), [zoom, setZoom] = useState(1)
  const canvasRef = useRef<HTMLDivElement>(null), [canvasWidth, setCanvasWidth] = useState(900)
  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const resize = new ResizeObserver(entries => setCanvasWidth(entries[0].contentRect.width))
    resize.observe(element)
    return () => resize.disconnect()
  }, [])
  const graphNodes = snapshot.graph.nodes
  const selected = graphNodes.find(n => n.id === selectedId)
  const ideas = graphNodes.filter(n => n.kind === 'Idea')
  const layout = useMemo(() => {
    const nodes = snapshot.graph.nodes
    const relevantFacts = new Set(nodes.filter(n => n.kind === 'Idea').flatMap(n => (n.record as Idea).factIds))
    const kept = all ? nodes : nodes.filter(n => n.kind !== 'Fact' || relevantFacts.has(n.id) || n.id === selectedId)
    const sourceIds = new Set(kept.filter(n => n.kind === 'Fact').flatMap(n => (n.record as Fact).evidence.map(e => e.artifactId)))
    const visible = kept.filter(n => all || n.kind !== 'Artifact' || sourceIds.has(n.id))
    const columns = [visible.filter(n => n.kind === 'Artifact'), visible.filter(n => n.kind === 'Fact'),
      visible.filter(n => !['Artifact', 'Fact', 'Idea'].includes(n.kind)), visible.filter(n => n.kind === 'Idea')]
    const height = Math.max(640, Math.max(...columns.map(c => c.length)) * 58 + 90)
    const positions = new Map<string, { x: number; y: number; node: GraphNode }>()
    columns.forEach((column, index) => column.forEach((node, row) => positions.set(node.id, {
      x: [105, 335, 565, 795][index], y: 85 + (row + 0.5) * ((height - 120) / Math.max(column.length, 1)), node,
    })))
    return { positions, height, edges: snapshot.graph.edges.filter(e => positions.has(e.from) && positions.has(e.to)) }
  }, [snapshot.graph, all, selectedId])
  const neighbors = new Set([selectedId, ...layout.edges.filter(e => e.from === selectedId || e.to === selectedId).flatMap(e => [e.from, e.to])])
  const factById = (id: string) => snapshot.run?.extraction.facts.find(f => f.id === id)
  const scale = Math.max(700, canvasWidth) / 900 * zoom
  return <div className="cg-graph-layout">
    <section className="cg-panel cg-graph-panel" aria-label="Customer knowledge graph">
      <div className="cg-graph-toolbar">
        <div className="cg-segment"><button aria-pressed={!all} onClick={() => setAll(false)}>Decision paths</button><button aria-pressed={all} onClick={() => setAll(true)}>All connections</button></div>
        <div className="cg-zoom"><button aria-label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom(z => z - 0.25)}><MinusIcon size={15} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 1.5} onClick={() => setZoom(z => z + 0.25)}><PlusIcon size={15} /></button></div>
      </div>
      <div className="cg-graph-focus"><FocusIcon size={15} /><label htmlFor="cg-focus">Focus on</label><select id="cg-focus" value={selected?.kind === 'Idea' ? selected.id : ''} onChange={e => onSelect(e.target.value || null)}><option value="">All ideas</option>{ideas.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select>{selected && <button onClick={() => onSelect(null)}>Clear selection</button>}</div>
      <div className="cg-canvas" ref={canvasRef} tabIndex={0} aria-label="Scrollable graph canvas">
        <svg viewBox={`0 0 900 ${layout.height}`} style={{ width: 900 * scale, height: layout.height * scale }} aria-label="Sources connected to facts, customer entities and proposed ideas">
          <defs><pattern id="cg-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="var(--line)" /></pattern></defs>
          <rect width="900" height={layout.height} fill="url(#cg-dots)" />
          {['SOURCE ARTIFACTS', 'EXTRACTED FACTS', 'CUSTOMER CONTEXT', 'PROPOSED IDEAS'].map((title, i) => <text key={title} x={[105, 335, 565, 795][i]} y="35" textAnchor="middle" className="cg-graph-heading">{title}</text>)}
          {layout.edges.map(edge => {
            const a = layout.positions.get(edge.from)!, b = layout.positions.get(edge.to)!
            const highlighted = edge.from === selectedId || edge.to === selectedId
            return <path key={edge.id} d={`M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`} fill="none" stroke={highlighted ? 'var(--brand)' : '#c2c6cc'} strokeWidth={highlighted ? 2.2 : 1.1} opacity={selectedId && !highlighted ? 0.16 : 0.8}><title>{edge.type.replaceAll('_', ' ')}</title></path>
          })}
          {[...layout.positions.values()].map(({ x, y, node }) => {
            const idea = node.kind === 'Idea', fact = node.kind === 'Fact', active = node.id === selectedId
            return <g key={node.id} role="button" tabIndex={0} aria-label={`Inspect ${node.kind}: ${node.label}`} aria-pressed={active}
              onClick={() => onSelect(node.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node.id) } }}
              className="cg-graph-node" transform={`translate(${x - 95}, ${y - 23})`} opacity={selectedId && !neighbors.has(node.id) ? 0.38 : 1}>
              <rect width="190" height="46" rx="9" fill={idea ? 'var(--ink)' : fact ? 'var(--canvas)' : 'var(--surface)'} stroke={active ? 'var(--brand)' : idea ? 'var(--ink)' : '#cdd0d6'} strokeWidth={active ? 3 : 1} />
              <circle cx="13" cy="14" r="3" fill={idea ? '#ff99ac' : fact ? 'var(--brand)' : 'var(--muted)'} />
              <text x="23" y="18" fill={idea ? '#e1e2e5' : 'var(--muted)'} fontSize="9" fontWeight="600">{node.kind.toUpperCase()}</text>
              <text x="12" y="35" fill={idea ? 'var(--surface)' : 'var(--ink)'} fontSize="11" fontWeight="600">{short(node.label, 28)}</text><title>{node.label}</title>
            </g>
          })}
        </svg>
      </div>
      <div className="cg-graph-caption">{layout.positions.size} nodes · {layout.edges.length} connections shown. Select a node to trace its evidence.</div>
    </section>
    <aside className="cg-panel cg-inspector" aria-label="Graph node details" aria-live="polite">
      {!selected ? <><h2>Inspect a connection</h2><p>Select an idea, fact or source in the graph. See what connects it to the customer, then open the original artifact.</p><div className="cg-path-example"><span>Source</span><ArrowRightIcon size={14} /><span>Fact</span><ArrowRightIcon size={14} /><span>Idea</span></div><p className="cg-muted">Ideas are proposals to verify. Facts are linked to recorded source material.</p></> : <>
        <div className="cg-eyebrow">{selected.kind === 'Idea' ? 'PROPOSED IDEA · HYPOTHESIS' : selected.kind.toUpperCase()}</div><h2>{selected.label}</h2>
        {selected.kind === 'Fact' ? <><p>{(selected.record as Fact).statement}</p>{(selected.record as Fact).value && <div className="cg-detail-value">{(selected.record as Fact).value}</div>}
          <h3>Source evidence</h3>{(selected.record as Fact).evidence.map((e, i) => <div className="cg-evidence" key={`${e.artifactId}-${i}`}><blockquote>“{e.quote}”</blockquote><button onClick={() => onArtifact(e.artifactId, e.quote)}><FileTextIcon size={13} />Open {snapshot.artifacts.find(a => a.id === e.artifactId)?.format}<ArrowRightIcon size={13} /></button></div>)}
        </> : selected.kind === 'Idea' ? <><p>{(selected.record as Idea).rationale}</p><div className="cg-next"><h3>Next action</h3><p>{(selected.record as Idea).nextAction}</p></div><h3>Connected facts</h3>{(selected.record as Idea).factIds.map(id => <button className="cg-fact-link" key={id} onClick={() => { setAll(true); onSelect(id) }}>{factById(id)?.title}<ArrowRightIcon size={13} /></button>)}</> : selected.kind === 'Artifact' ? <><p>{(selected.record as Artifact).metadata.System || 'Original customer source artifact.'}</p><button className="cg-button" onClick={() => onArtifact(selected.id)}>Open artifact<ArrowRightIcon size={15} /></button></> : <p>{'description' in selected.record ? selected.record.description : ''}</p>}
        <h3>Relationships</h3><div className="cg-relationship-list">{snapshot.graph.edges.filter(e => e.from === selected.id || e.to === selected.id).map(e => {
          const other = graphNodes.find(n => n.id === (e.from === selected.id ? e.to : e.from))
          return other && <button key={e.id} onClick={() => { if (other.kind === 'Fact') setAll(true); onSelect(other.id) }}><small>{e.type.replaceAll('_', ' ').toLowerCase()}</small><span>{other.label}</span></button>
        })}</div>
      </>}
    </aside>
  </div>
}
