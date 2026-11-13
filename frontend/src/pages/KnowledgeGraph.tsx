import { NetworkIcon, InfoIcon } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'

// TODO: Phase 2 — Replace static diagram with live Neo4j graph visualization
// TODO: Integrate react-force-graph or vis-network library for interactive graph
// TODO: Connect to GET /api/v1/graph/nodes and GET /api/v1/graph/relationships
// TODO: Add node filtering by type (Company, Founder, Industry, Country, Technology)
// TODO: Add relationship-type toggle controls

const NODE_TYPES = [
  { label: 'Company', color: '#1E3A5F', description: 'Tracked enterprise companies across SEA' },
  { label: 'Founder', color: '#0D9488', description: 'Company founders and key personnel' },
  { label: 'Industry', color: '#7A9BC4', description: 'Industry sector classifications' },
  { label: 'Country', color: '#3D6BA3', description: 'Geographic presence nodes' },
  { label: 'Technology', color: '#1DB3AD', description: 'Technologies used or offered' },
]

const REL_TYPES = [
  { label: 'FOUNDED', from: 'Founder', to: 'Company' },
  { label: 'OPERATES_IN', from: 'Company', to: 'Country' },
  { label: 'BELONGS_TO', from: 'Company', to: 'Industry' },
  { label: 'USES_TECHNOLOGY', from: 'Company', to: 'Technology' },
  { label: 'POTENTIALLY_NEEDS', from: 'Company', to: 'Service' },
]

export default function KnowledgeGraph() {
  return (
    <div>
      <PageHeader
        title="Knowledge Graph"
        subtitle="Visual relationship map of enterprise entities — powered by Neo4j"
        badge={
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-navy-50 text-navy-600 border border-navy-100">
            Phase 2
          </span>
        }
      />

      {/* Phase 2 Notice */}
      <div className="mb-6 flex items-start gap-3 px-5 py-4 bg-blue-50 border border-blue-200 rounded-lg">
        <InfoIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Knowledge Graph — Coming in Phase 2</p>
          <p className="text-sm text-blue-700 mt-1">
            This module will render an interactive graph powered by{' '}
            <strong>Neo4j</strong>, showing relationships between companies, founders, investors,
            industries, countries, and technologies. Once integrated, you can explore multi-hop
            paths (e.g., "which companies share the same investors?") and discover hidden
            partnership or cross-sell opportunities.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Static Diagram */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <NetworkIcon className="w-4 h-4 text-teal-600" />
            Graph Schema (Static Preview)
          </h3>

          {/* SVG static diagram */}
          <div className="flex justify-center">
            <svg width="520" height="340" viewBox="0 0 520 340" className="w-full max-w-lg">
              {/* Edges */}
              <line x1="260" y1="160" x2="80" y2="80" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="260" y1="160" x2="440" y2="80" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="260" y1="160" x2="80" y2="260" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="260" y1="160" x2="440" y2="260" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="260" y1="160" x2="260" y2="310" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrow)" />

              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#D1D5DB" />
                </marker>
              </defs>

              {/* Edge Labels */}
              <text x="145" y="102" fontSize="9" fill="#9CA3AF" textAnchor="middle">FOUNDED</text>
              <text x="368" y="102" fontSize="9" fill="#9CA3AF" textAnchor="middle">BELONGS_TO</text>
              <text x="145" y="228" fontSize="9" fill="#9CA3AF" textAnchor="middle">OPERATES_IN</text>
              <text x="368" y="228" fontSize="9" fill="#9CA3AF" textAnchor="middle">USES_TECHNOLOGY</text>
              <text x="275" y="248" fontSize="9" fill="#9CA3AF" textAnchor="middle">POTENTIALLY_NEEDS</text>

              {/* Centre: Company */}
              <circle cx="260" cy="160" r="38" fill="#1E3A5F" />
              <text x="260" y="156" fontSize="11" fill="white" textAnchor="middle" fontWeight="600">Company</text>
              <text x="260" y="172" fontSize="9" fill="#9FB8D5" textAnchor="middle">247 nodes</text>

              {/* Founder */}
              <circle cx="80" cy="80" r="30" fill="#0D9488" />
              <text x="80" y="76" fontSize="10" fill="white" textAnchor="middle" fontWeight="600">Founder</text>
              <text x="80" y="90" fontSize="8" fill="#B3E5E3" textAnchor="middle">/ Investor</text>

              {/* Industry */}
              <circle cx="440" cy="80" r="30" fill="#3D6BA3" />
              <text x="440" y="84" fontSize="10" fill="white" textAnchor="middle" fontWeight="600">Industry</text>

              {/* Country */}
              <circle cx="80" cy="260" r="30" fill="#5A82B4" />
              <text x="80" y="264" fontSize="10" fill="white" textAnchor="middle" fontWeight="600">Country</text>

              {/* Technology */}
              <circle cx="440" cy="260" r="30" fill="#1DB3AD" />
              <text x="440" y="256" fontSize="9" fill="white" textAnchor="middle" fontWeight="600">Technology</text>
              <text x="440" y="270" fontSize="8" fill="#B3E5E3" textAnchor="middle">/ Service</text>

              {/* Service bottom */}
              <rect x="230" y="308" width="60" height="22" rx="4" fill="#F1F3F5" stroke="#E5E7EB" />
              <text x="260" y="323" fontSize="9" fill="#6B7280" textAnchor="middle">Service</text>
            </svg>
          </div>
        </div>

        {/* Node Types Legend */}
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Node Types</h3>
            <ul className="space-y-3">
              {NODE_TYPES.map((n) => (
                <li key={n.label} className="flex items-start gap-2.5">
                  <span
                    className="flex-shrink-0 mt-0.5 w-3 h-3 rounded-full"
                    style={{ backgroundColor: n.color }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{n.label}</p>
                    <p className="text-xs text-gray-500">{n.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Relationship Types</h3>
            <ul className="space-y-2">
              {REL_TYPES.map((r) => (
                <li key={r.label} className="text-xs">
                  <span className="font-mono font-semibold text-teal-700">{r.label}</span>
                  <span className="text-gray-500 ml-1">
                    ({r.from} → {r.to})
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* TODO Integration Points */}
          <div className="card p-5 border-dashed border-amber-200 bg-amber-50">
            <p className="text-xs font-semibold text-amber-700 mb-2">🔧 TODO Integration Points</p>
            <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
              <li>Connect Neo4j driver in backend graphService</li>
              <li>Expose graph REST endpoints under /api/v1/graph</li>
              <li>Add react-force-graph package</li>
              <li>Wire node click → Company Profile navigation</li>
              <li>Add fullscreen graph modal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
