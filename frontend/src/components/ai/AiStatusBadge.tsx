import { CommunicationState, ManagementState, label } from '../../services/aiManagement.service'

const managementStyles: Record<ManagementState, string> = {
  OFF: 'bg-gray-50 text-gray-500 border-gray-200',
  ACTIVATING: 'bg-blue-50 text-blue-700 border-blue-200',
  ACTIVE: 'bg-teal-50 text-teal-700 border-teal-200',
  PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
  HUMAN_ATTENTION_REQUIRED: 'bg-red-50 text-red-700 border-red-200',
  HUMAN_HANDOVER: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-navy-50 text-navy-600 border-navy-100',
  ERROR: 'bg-red-100 text-red-800 border-red-300',
}
const managementLabels: Record<ManagementState, string> = {
  OFF: 'AI off', ACTIVATING: 'Activating', ACTIVE: 'AI-managed', PAUSED: 'Paused', HUMAN_ATTENTION_REQUIRED: 'Needs attention',
  HUMAN_HANDOVER: 'Human handover', COMPLETED: 'Completed', ERROR: 'Automation error',
}

export function ManagementBadge({ state }: { state: ManagementState }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${managementStyles[state]}`}>
    {state === 'ACTIVE' && <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />}{managementLabels[state]}
  </span>
}

export function CommunicationBadge({ state }: { state: CommunicationState }) {
  const tone = ['NOT_INTERESTED', 'UNSUBSCRIBED', 'ERROR'].includes(state) ? 'text-red-700' : state === 'CUSTOMER_RESPONDED' ? 'text-teal-700' : 'text-gray-600'
  return <span className={`whitespace-nowrap text-xs ${tone}`}>{label(state)}</span>
}

export function PriorityBadge({ priority }: { priority: string }) {
  const style = priority === 'CRITICAL' ? 'bg-red-600 text-white border-red-600' : priority === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200'
    : priority === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style}`}>{priority}</span>
}
