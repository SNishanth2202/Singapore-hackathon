import { Activity, Check, Circle, Loader2, Pause, UserCheck, UserRound, XCircle } from 'lucide-react'
import { CommunicationState, ManagementState, label } from '../../services/aiManagement.service'

const managementStates = {
  OFF: { name: 'Idle · AI off', icon: Circle, style: 'border-gray-200 bg-gray-50 text-gray-600' },
  ACTIVATING: { name: 'Processing', icon: Loader2, style: 'border-singtelRed-100 bg-singtelRed-50 text-singtelRed-700' },
  ACTIVE: { name: 'Active', icon: Activity, style: 'border-singtelRed-100 bg-singtelRed-50 text-singtelRed-700' },
  PAUSED: { name: 'Paused', icon: Pause, style: 'border-amber-200 bg-amber-50 text-amber-800' },
  HUMAN_ATTENTION_REQUIRED: { name: 'Requires human intervention', icon: UserRound, style: 'border-amber-200 bg-amber-50 text-amber-800' },
  HUMAN_HANDOVER: { name: 'Human handover', icon: UserCheck, style: 'border-gray-300 bg-gray-100 text-gray-700' },
  COMPLETED: { name: 'Completed', icon: Check, style: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ERROR: { name: 'Failed', icon: XCircle, style: 'border-red-200 bg-red-100 text-red-800' },
} satisfies Record<ManagementState, { name: string; icon: typeof Activity; style: string }>

export function ManagementBadge({ state }: { state: ManagementState }) {
  const { name, icon: Icon, style } = managementStates[state]
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${style}`}>
    <Icon size={12} aria-hidden className={state === 'ACTIVATING' ? 'motion-safe:animate-spin' : undefined} />{name}
  </span>
}

export function CommunicationBadge({ state }: { state: CommunicationState }) {
  const tone = ['NOT_INTERESTED', 'UNSUBSCRIBED', 'ERROR'].includes(state) ? 'bg-red-50 text-red-800'
    : ['CUSTOMER_RESPONDED', 'COMPLETED'].includes(state) ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${tone}`}>{label(state)}</span>
}

export function PriorityBadge({ priority }: { priority: string }) {
  const value = priority.toUpperCase()
  const style = value === 'CRITICAL' ? 'bg-singtelRed-700 text-white' : value === 'HIGH' ? 'bg-singtelRed-50 text-singtelRed-700'
    : value === 'MEDIUM' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{label(priority)}</span>
}
