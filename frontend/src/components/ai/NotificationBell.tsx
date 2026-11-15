import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon } from 'lucide-react'
import { aiManagementService } from '../../services/aiManagement.service'

/** Unread AI Management notifications; polls every 60 seconds while the app is open. */
export function NotificationBell() {
  const [counts, setCounts] = useState({ unread: 0, open: 0 })
  useEffect(() => {
    let active = true
    const load = () => aiManagementService.notifications({ limit: '1' })
      .then(result => { if (active) setCounts({ unread: result.unreadCount, open: result.openActionCount }) })
      .catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  const title = `${counts.unread} unread notification(s), ${counts.open} need attention`
  return <Link to={counts.open ? '/ai-management?tab=attention' : '/ai-management?tab=notifications'} title={title} aria-label={title}
    className="relative rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
    <BellIcon className="h-5 w-5" />
    {counts.open > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{counts.open}</span>
      : counts.unread > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-teal-500" /> : null}
  </Link>
}
