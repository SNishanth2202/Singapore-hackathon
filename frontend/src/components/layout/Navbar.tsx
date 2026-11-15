import { SearchIcon } from 'lucide-react'
import { NotificationBell } from '../ai/NotificationBell'

interface NavbarProps {
  title: string
}

export function Navbar({ title }: NavbarProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col">
          <h2 className="text-sm font-semibold text-gray-900 leading-tight">{title}</h2>
          <p className="text-[11px] text-gray-400 leading-tight">Singtel Enterprise Intelligence Platform</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search hint */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-400 cursor-default">
          <SearchIcon className="w-3.5 h-3.5" />
          <span>Search companies…</span>
          <kbd className="ml-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] text-gray-400 font-mono">⌘K</kbd>
        </div>

        <NotificationBell />

        {/* User */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-100">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-navy-600 to-navy-400 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">SA</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-gray-700 leading-tight">Sales Analyst</p>
            <p className="text-[10px] text-gray-400 leading-tight">admin@singtel.com</p>
          </div>
        </div>
      </div>
    </header>
  )
}
