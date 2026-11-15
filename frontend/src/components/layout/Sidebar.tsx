import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboardIcon,
  Building2Icon,
  NetworkIcon,
  TargetIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RadarIcon,
  SparklesIcon,
  UsersIcon,
  BotIcon,
} from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboardIcon, exact: true },
  { label: 'Company Intelligence', path: '/companies', icon: Building2Icon, exact: false },
  { label: 'Knowledge Graph', path: '/graph', icon: NetworkIcon, exact: false },
  { label: 'Evidence Graph', path: '/research-graph', icon: NetworkIcon, exact: false },
  { label: 'Lead Ranking', path: '/lead-ranking', icon: TargetIcon, exact: false },
  { label: 'AI Management', path: '/ai-management', icon: BotIcon, exact: false },
  { label: 'Sales Workbench', path: '/sales', icon: UsersIcon, exact: false },
  { label: 'Settings', path: '/settings', icon: SettingsIcon, exact: false },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  function isActive(path: string, exact: boolean) {
    if (exact) return location.pathname === path
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={`flex flex-col bg-navy-900 transition-all duration-200 ${collapsed ? 'w-16' : 'w-16 md:w-64'} flex-shrink-0`}
      style={{ background: 'linear-gradient(180deg, #0D1929 0%, #13243B 100%)' }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0 shadow-lg">
          <RadarIcon className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="hidden md:block min-w-0">
            <p className="text-sm font-bold text-white leading-tight tracking-wide">Singtel Scout</p>
            <p className="text-xs text-teal-400 font-medium leading-tight mt-0.5">Enterprise Intelligence</p>
          </div>
        )}
      </div>

      {/* AI Badge */}
      {!collapsed && (
        <div className="hidden md:flex mx-3 mt-4 px-3 py-2 bg-teal-500/10 border border-teal-500/20 rounded-lg flex items-center gap-2">
          <SparklesIcon className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
          <p className="text-xs text-teal-300 font-medium">AI-Powered Analysis</p>
        </div>
      )}

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 py-4 overflow-y-auto">
        {!collapsed && (
          <p className="hidden md:block px-5 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Navigation</p>
        )}
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path, item.exact)
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  title={item.label}
                  aria-label={item.label}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-teal-400 rounded-r" />
                  )}
                  <item.icon
                    className={`flex-shrink-0 w-4.5 h-4.5 ${active ? 'text-teal-400' : 'text-gray-500 group-hover:text-gray-300'}`}
                    style={{ width: 18, height: 18 }}
                  />
                  {!collapsed && <span className="hidden md:block truncate">{item.label}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" />
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User info */}
      {!collapsed && (
        <div className="hidden md:block px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-teal flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
              SA
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-200 truncate">Sales Analyst</p>
              <p className="text-[10px] text-gray-500 truncate">Singtel Enterprise Group</p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRightIcon className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeftIcon className="w-4 h-4" />
              <span className="hidden md:inline">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
