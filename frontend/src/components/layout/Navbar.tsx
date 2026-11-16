import { Link } from 'react-router-dom'
import { Search, ChevronRight } from 'lucide-react'
import { NotificationBell } from '../ai/NotificationBell'

export function Navbar({ title }: { title: string }) {
  return <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="hidden text-muted sm:inline">Workspace</span>
      <ChevronRight size={14} className="hidden shrink-0 text-gray-400 sm:block" aria-hidden />
      <h2 className="truncate font-semibold text-ink" title={title}>{title}</h2>
    </div>
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <Link to="/companies" title="Search companies" aria-label="Search companies" className="flex h-8 items-center gap-2 rounded-lg border border-line px-2 text-xs text-muted hover:border-gray-300 sm:px-3"><Search size={15} /><span className="hidden md:inline">Search companies</span></Link>
      <NotificationBell />
    </div>
  </header>
}
