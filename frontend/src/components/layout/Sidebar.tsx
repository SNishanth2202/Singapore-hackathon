import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Building2, BookUser, Briefcase, Network, Share2, ListOrdered, Bot, Users, Settings, PanelLeftClose, PanelLeftOpen, Radar } from 'lucide-react'

const sections = [
  { title: 'Workspace', items: [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Company Intelligence', path: '/companies', icon: Building2 },
    { label: 'Customer CRM', path: '/crm', icon: BookUser },
    { label: 'Service Opportunities', path: '/service-opportunities', icon: Briefcase },
  ] },
  { title: 'Intelligence', items: [
    { label: 'Knowledge Graph', path: '/graph', icon: Network },
    { label: 'Evidence Graph', path: '/research-graph', icon: Share2 },
    { label: 'Lead Ranking', path: '/lead-ranking', icon: ListOrdered },
  ] },
  { title: 'Operations', items: [
    { label: 'AI Management', path: '/ai-management', icon: Bot },
    { label: 'Sales Workbench', path: '/sales', icon: Users },
    { label: 'Settings', path: '/settings', icon: Settings },
  ] },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()
  const labelClass = collapsed ? 'sr-only' : 'hidden lg:inline'
  return <aside className={`flex min-h-0 shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-14 sm:w-16 lg:w-60'}`}>
    <NavLink to="/" aria-label="Singtel Scout dashboard" className="flex h-16 shrink-0 items-center justify-center gap-2.5 border-b border-line lg:justify-start lg:px-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><Radar size={23} strokeWidth={1.8} /></span>
      {!collapsed && <span className="hidden lg:block"><strong className="block text-[15px] tracking-tight text-ink">Singtel Scout</strong><span className="text-xs text-muted">Singtel Enterprise</span></span>}
    </NavLink>
    <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-4">
      {sections.map(section => <div key={section.title} className="mb-5">
        <p className={`${labelClass} px-3 text-[10px] font-semibold uppercase tracking-[.13em] text-muted`}>{section.title}</p>
        <ul className="mt-1.5 space-y-1">{section.items.map(({ label, path, icon: Icon }) => {
          const active = pathname === path || (path === '/' ? pathname === '/dashboard' : pathname.startsWith(path + '/'))
          return <li key={path}><NavLink to={path} end={path === '/'} aria-label={label} title={label} className={`relative flex min-h-10 items-center justify-center gap-3 rounded-lg px-2 text-[13px] font-medium transition-colors ${collapsed ? '' : 'lg:justify-start lg:px-3'} ${active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-canvas hover:text-ink'}`}>
            {active && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r bg-brand" />}
            <Icon size={17} strokeWidth={1.7} className="shrink-0" /><span className={labelClass}>{label}</span>
          </NavLink></li>
        })}</ul>
      </div>)}
    </nav>
    <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="hidden w-full items-center gap-3 border-t border-line p-4 text-xs font-medium text-muted hover:bg-canvas lg:flex">
      {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} />Collapse sidebar</>}
    </button>
  </aside>
}
