import { ArrowUpRight, Building2, GitBranch, ListOrdered, Mail, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

const workspaces = [
  { name: 'Lead Ranking Agent', task: 'Rank and qualify leads', route: '/lead-ranking', icon: ListOrdered },
  { name: 'Company Research Agent', task: 'Research company evidence', route: '/companies', icon: Building2 },
  { name: 'AI Email Agent', task: 'Review outreach and replies', route: '/sales', icon: Mail },
  { name: 'Farming Agent', task: 'Find account growth opportunities', route: '/crm', icon: GitBranch },
  { name: 'AI Management', task: 'Configure automation policies', route: '/ai-management?tab=settings', icon: SlidersHorizontal },
]

export function AgentWorkspaces() {
  return <nav aria-label="Agent workspaces">
    <h2 className="mb-3 text-sm font-semibold text-singtelGray-800">Agent workspaces</h2>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {workspaces.map(({ name, task, route, icon: Icon }) => <Link key={name} to={route}
        className="card group px-4 py-3 transition-colors hover:border-singtelRed-200">
        <div className="mb-3 flex items-center justify-between">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-singtelRed-50 text-singtelRed"><Icon size={17} aria-hidden /></span>
          <ArrowUpRight size={15} className="text-gray-400 transition-colors group-hover:text-singtelRed" aria-hidden />
        </div>
        <span className="block text-sm font-semibold leading-snug text-singtelGray-800">{name}</span>
        <span className="mt-1 block text-xs leading-snug text-singtelGray-500">{task}</span>
      </Link>)}
    </div>
  </nav>
}
