import { CommunicationState, ManagementState } from '../models/AiManagement';
import { AppError } from '../utils/errors';

/**
 * Automation configuration transitions. Communication and opportunity lifecycles are tracked separately,
 * so a company can, for example, have an active opportunity while automation is PAUSED.
 */
const transitions: Record<ManagementState, readonly ManagementState[]> = {
  OFF: ['ACTIVATING'],
  ACTIVATING: ['ACTIVE', 'ERROR', 'OFF'],
  ACTIVE: ['PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'COMPLETED', 'ERROR', 'OFF'],
  PAUSED: ['ACTIVE', 'HUMAN_ATTENTION_REQUIRED', 'HUMAN_HANDOVER', 'COMPLETED', 'OFF', 'ERROR'],
  HUMAN_ATTENTION_REQUIRED: ['ACTIVE', 'PAUSED', 'HUMAN_HANDOVER', 'COMPLETED', 'OFF'],
  HUMAN_HANDOVER: ['ACTIVE', 'PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'COMPLETED', 'OFF'],
  COMPLETED: ['ACTIVATING', 'OFF'],
  ERROR: ['ACTIVATING', 'ACTIVE', 'PAUSED', 'HUMAN_ATTENTION_REQUIRED', 'COMPLETED', 'OFF'],
};

export function canTransition(from: ManagementState, to: ManagementState): boolean {
  return from === to || transitions[from].includes(to);
}

export function transitionManagementState(from: ManagementState, to: ManagementState): void {
  if (!canTransition(from, to)) {
    throw new AppError(`AI Management cannot move from ${from} to ${to}.`, 409, 'AI_MANAGEMENT_TRANSITION_INVALID');
  }
}

export const TERMINAL_COMMUNICATION_STATES: readonly CommunicationState[] = ['NO_RESPONSE', 'NOT_INTERESTED', 'UNSUBSCRIBED', 'COMPLETED'];

export function canSendAutonomous(state: ManagementState): boolean {
  return state === 'ACTIVE';
}

export function isTerminalCommunicationState(state: CommunicationState): boolean {
  return TERMINAL_COMMUNICATION_STATES.includes(state);
}

/** States in which a company is enrolled in AI Management (whether or not it is currently sending). */
export function isEnrolled(state: ManagementState): boolean {
  return state !== 'OFF' && state !== 'COMPLETED';
}
