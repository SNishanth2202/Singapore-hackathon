import { UserCircleIcon } from 'lucide-react'
import { NotificationBell } from '../ai/NotificationBell'

interface NavbarProps {
  title: string
}

export function Navbar({ title }: NavbarProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2 pl-3 border-l border-gray-100">
          <UserCircleIcon className="w-7 h-7 text-gray-400" />
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-gray-700 leading-tight">Singtel User</p>
            <p className="text-xs text-gray-400 leading-tight">admin@singtel.com</p>
          </div>
        </div>
      </div>
    </header>
  )
}
